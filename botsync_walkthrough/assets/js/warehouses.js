/* warehouses.js: the three warehouse maps (spec section 7) as data, the waypoint graph, and the static map layer.
   Lengths are schematic. Only aisle widths are drawn to scale (14 px per metre of the real minimum aisle width). */
(function () {
  'use strict';
  var D = window.BOTSYNC_DATA, Draw = window.Draw;
  var PX_PER_M = 14, W = 900, RACK_DEPTH = 26;

  /* Each site gets its own floor plan from the same generator: rack blocks, rows, an optional open staging floor, and a final
     rotation or flip so the dock doors sit on a different wall. Rotating or flipping keeps every distance, so routing is unchanged.
     A: brownfield plant, narrowest aisles: turned 90 degrees, docks on the left wall, a dense grid of short rack columns.
     B: greenfield plant, widest aisles: docks on the bottom wall facing a large open staging floor, three rack bays.
     C: distribution centre with glare-exposed dock doors along the top wall. */
  var CFG = {
    A: { site: 'S08', frameW: 560, rackRows: 10, blocks: 2, openFloor: 0, transform: 'transpose', layout: { dock: 2, staging: 4, conveyor: 4, rack: 1 }, chargers: 3, glare: false, startClock: 15 * 60 },
    B: { site: 'S12', frameW: 900, rackRows: 3, blocks: 3, openFloor: 150, transform: 'flipY', layout: { dock: 4, staging: 7, conveyor: 2, rack: 4 }, chargers: 6, glare: false, startClock: 15 * 60 },
    C: { site: 'S20', frameW: 900, rackRows: 5, blocks: 2, openFloor: 0, transform: 'none', layout: { dock: 4, staging: 2, conveyor: 4, rack: 7 }, chargers: 6, glare: true, startClock: 15 * 60 + 30 }
  };
  var SHIFTS = { '24x7': { start: 0, end: 24 * 60, days: 7 }, '16x7': { start: 6 * 60, end: 22 * 60, days: 7 }, '16x6': { start: 6 * 60, end: 22 * 60, days: 6 } };

  function siteRow(id) { for (var i = 0; i < D.siteTable.length; i++) if (D.siteTable[i].site_id === id) return D.siteTable[i]; return null; }

  function spread(n, a, b) { var out = []; for (var i = 0; i < n; i++) out.push(a + (b - a) * (n === 1 ? 0.5 : i / (n - 1))); return out; }
  function build(id) {
    var cfg = CFG[id], site = siteRow(cfg.site), L = cfg.layout;
    var aisleMin = site.aisleMin.v, aw = aisleMin * PX_PER_M, Wf = cfg.frameW;
    var leftX = 104, rightX = Wf - 104, topY = 92;
    var nodes = [];
    function addNode(x, y, kind) { nodes.push({ id: nodes.length, x: x, y: y, kind: kind || 'way' }); return nodes.length - 1; }

    // the plan is built in a frame with the dock doors on the top wall, then rotated or flipped (end of this function)
    var vLines = spread(cfg.blocks + 1, leftX, rightX);
    var hLines = [topY], floorIdx = -1;
    if (cfg.openFloor) { hLines.push(topY + cfg.openFloor); floorIdx = 1; }
    var racks = [], rackTop = hLines[hLines.length - 1] + aw / 2, firstAisle = hLines.length;
    for (var r = 0; r < cfg.rackRows; r++) {
      for (var b = 0; b < cfg.blocks; b++) racks.push({ x: vLines[b] + aw / 2, y: rackTop, w: vLines[b + 1] - vLines[b] - aw, h: RACK_DEPTH, row: r });
      if (r < cfg.rackRows - 1) hLines.push(rackTop + RACK_DEPTH + aw / 2);
      rackTop += RACK_DEPTH + aw;
    }
    var bottomY = rackTop - aw + aw / 2;
    hLines.push(bottomY);
    var Hf = Math.round(bottomY + aw / 2 + 66);

    var hPts = hLines.map(function () { return []; }), vPts = vLines.map(function () { return []; });
    hLines.forEach(function (y, hi) { vLines.forEach(function (x, vi) { var n = addNode(x, y, 'cross'); hPts[hi].push(n); vPts[vi].push(n); }); });

    // stations, numbered in the order of section 7: dock, staging, conveyor, rack
    var stations = [], bay = 1;
    function station(type, code, x, y, node, extra) { var st = { n: bay, name: 'Bay ' + bay, type: type, code: code, x: x, y: y, node: node, glare: false, open: true }; for (var k in extra) st[k] = extra[k]; stations.push(st); bay++; return st; }
    var dockX, stageX;
    if (floorIdx < 0) {
      // docks and staging share the road under the dock wall: one row of evenly spaced slots
      var slots = spread(L.dock + L.staging, 140, Wf - 140), dockSlots = spread(L.dock, 0, slots.length - 1).map(Math.round);
      dockX = dockSlots.map(function (i) { return slots[i]; }); stageX = slots.filter(function (x, i) { return dockSlots.indexOf(i) < 0; });
    } else { dockX = spread(L.dock, 190, Wf - 190); stageX = spread(L.staging, 150, Wf - 150); }
    dockX.forEach(function (x) { var n = addNode(x, topY, 'station'); hPts[0].push(n); station('dock', 'D', x, 0, n, { glare: !!cfg.glare }); });
    stageX.forEach(function (x) {
      var hi = floorIdx < 0 ? 0 : floorIdx, n = addNode(x, hLines[hi], 'station'); hPts[hi].push(n);
      station('staging', 'F', x, floorIdx < 0 ? 42 : hLines[hi] - aw / 2 - 20, n);
    });
    spread(L.conveyor, hLines[firstAisle - 1] + 50, bottomY - 30).forEach(function (y) { var n = addNode(leftX, y, 'station'); vPts[0].push(n); station('conveyor', 'C', 24, y, n); });
    var aisles = []; for (var a = firstAisle; a < hLines.length - 1; a++) aisles.push(a);
    for (var k = 0; k < L.rack; k++) {
      var hi2 = L.rack === 1 ? aisles[Math.floor(aisles.length / 2)] : aisles[k % aisles.length];
      var blk = L.rack === 1 ? cfg.blocks - 1 : Math.floor(k / aisles.length) % cfg.blocks;
      var x2 = (vLines[blk] + vLines[blk + 1]) / 2 + (L.rack > aisles.length * cfg.blocks ? 0 : 0);
      var n2 = addNode(x2, hLines[hi2], 'station'); hPts[hi2].push(n2);
      station('rack', 'R', x2, hLines[hi2] - aw / 2 - RACK_DEPTH / 2, n2, { rackRow: hi2 - firstAisle });
    }

    // chargers on the far wall (1 per 3 robots, assumed), swap bay, service bay
    var chargers = [];
    spread(cfg.chargers, 200, 200 + 34 * (cfg.chargers - 1)).forEach(function (x, i) { var n = addNode(x, bottomY, 'charger'); hPts[hLines.length - 1].push(n); chargers.push({ i: i, x: x, y: Hf - 16, node: n }); });
    var sbx = Wf - 190, swapNode = addNode(sbx, bottomY, 'swap'); hPts[hLines.length - 1].push(swapNode);
    var swapBay = { x: sbx, y: bottomY + aw / 2 + 24, node: swapNode };
    var svy = (hLines[firstAisle - 1] + bottomY) / 2 + 20, serviceNode = addNode(rightX, svy, 'service'); vPts[vLines.length - 1].push(serviceNode);
    var serviceBay = { x: Wf - 40, y: svy, node: serviceNode };

    var adj = nodes.map(function () { return []; });
    function link(a, b) { var d = Math.max(0.01, Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)); adj[a].push({ to: b, len: d }); adj[b].push({ to: a, len: d }); }
    hPts.forEach(function (pts) { pts.sort(function (a, b) { return nodes[a].x - nodes[b].x; }); for (var i = 1; i < pts.length; i++) link(pts[i - 1], pts[i]); });
    vPts.forEach(function (pts) { pts.sort(function (a, b) { return nodes[a].y - nodes[b].y; }); for (var i = 1; i < pts.length; i++) link(pts[i - 1], pts[i]); });

    var N = nodes.length, dist = [], next = [];
    for (var i = 0; i < N; i++) { dist.push(new Float64Array(N).fill(Infinity)); next.push(new Int16Array(N).fill(-1)); dist[i][i] = 0; next[i][i] = i; }
    adj.forEach(function (list, a) { list.forEach(function (e) { dist[a][e.to] = e.len; next[a][e.to] = e.to; }); });
    for (var kk = 0; kk < N; kk++) for (var ii = 0; ii < N; ii++) { var dik = dist[ii][kk]; if (dik === Infinity) continue; for (var jj = 0; jj < N; jj++) { var v = dik + dist[kk][jj]; if (v < dist[ii][jj]) { dist[ii][jj] = v; next[ii][jj] = next[ii][kk]; } } }

    // rotate or flip the finished plan
    var T = cfg.transform, W = T === 'transpose' ? Hf : Wf, H = T === 'transpose' ? Wf : Hf;
    function P(x, y) { return T === 'transpose' ? [y, x] : T === 'flipY' ? [x, Hf - y] : [x, y]; }
    function R(rc) { var a = P(rc.x, rc.y), b = P(rc.x + rc.w, rc.y + rc.h); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), row: rc.row }; }
    function mv(o) { var q = P(o.x, o.y); o.x = q[0]; o.y = q[1]; }
    nodes.forEach(mv); racks = racks.map(R);
    stations.forEach(function (st) {
      if (st.type === 'rack') st.face = R({ x: st.x - 20, y: st.y - RACK_DEPTH / 2, w: 40, h: RACK_DEPTH });
      mv(st);
      if (st.type === 'dock') { st.wall = T === 'transpose' ? 'left' : T === 'flipY' ? 'bottom' : 'top'; if (st.wall === 'top') st.y = 1.5; if (st.wall === 'bottom') st.y = H - 1.5; if (st.wall === 'left') st.x = 1.5; }
      if (st.type === 'conveyor') st.conv = T === 'transpose' ? { a: 0, dx: 0, dy: 18, align: 'center' } : { a: Math.PI / 2, dx: 16, dy: 0, align: 'left' };
    });
    chargers.forEach(mv); mv(swapBay); mv(serviceBay);
    var c0 = chargers[0];
    var cl = chargers[chargers.length - 1], chargerCaption = T === 'transpose' ? { x: W - 6, y: cl.y + 36, align: 'right', up: -1 } : T === 'flipY' ? { x: c0.x - 20, y: c0.y + 14, align: 'right', up: -1 } : { x: c0.x - 20, y: c0.y, align: 'right' };
    var serviceCaption = T === 'transpose' ? { x: serviceBay.x, y: serviceBay.y - 22, align: 'center' } : { x: W - 6, y: serviceBay.y + 24, align: 'right' };

    var wh = {
      id: id, site: cfg.site, siteRow: site, name: site.site_name, shift: site.shift_pattern, shiftHours: SHIFTS[site.shift_pattern],
      aisleMin: aisleMin, aw: aw, W: W, H: H, racks: racks, nodes: nodes, adj: adj, dist: dist, next: next, transform: T,
      stations: stations, chargers: chargers, swapBay: swapBay, serviceBay: serviceBay, robots: site.robots_deployed.v,
      chargerCaption: chargerCaption, serviceCaption: serviceCaption, startClock: cfg.startClock, glare: cfg.glare, workStations: stations
    };
    wh.path = function (a, b) { if (next[a][b] < 0) return [a]; var p = [a]; while (a !== b) { a = next[a][b]; p.push(a); } return p; };
    wh.station = function (name) { for (var i = 0; i < stations.length; i++) if (stations[i].name === name || stations[i].n === name) return stations[i]; return null; };
    wh.edgeKey = function (a, b) { return a < b ? a + '-' + b : b + '-' + a; };
    return wh;
  }

  /* Static layer: floor, racks, stations (layer order from 7A: floor, racks, stations) */
  function render(ctx, wh, o) {
    o = o || {};
    var zoom = o.zoom || 1, zo = { zoom: zoom };
    Draw.drawBuilding(ctx, 0, 0, 0, 'default', { w: wh.W, h: wh.H });
    wh.racks.forEach(function (r) { Draw.drawRack(ctx, r.x, r.y, 0, 'default', { w: r.w, h: r.h, zoom: zoom }); });
    // rack-face bay labels sit on the rack next to their aisle point
    wh.stations.forEach(function (s) { if (s.type === 'rack') Draw.drawRack(ctx, s.face.x, s.face.y, 0, 'face', { w: s.face.w, h: s.face.h, label: s.name, labelX: s.face.x + s.face.w / 2, zoom: zoom }); });
    // glare bands (Warehouse C, 14:00 to 17:00 simulated time) and sun symbols
    if (wh.glare && o.glareOn) wh.stations.forEach(function (s) { if (s.type === 'dock' && s.glare) Draw.drawGlareBand(ctx, s.x, 3, 0, 'on', { len: 40 }); });
    wh.stations.forEach(function (s) {
      var closed = o.closed && o.closed[s.name];
      if (s.type === 'dock') {
        var lab = s.wall === 'left' ? { a: Math.PI / 2, dx: 8, dy: 0, align: 'left' } : s.wall === 'bottom' ? { a: 0, dx: 0, dy: -13, align: 'center' } : { a: 0, dx: 0, dy: 13, align: 'center' };
        Draw.drawDockDoor(ctx, s.x, s.y, lab.a, closed ? 'closed' : 'open', { label: s.name, labelDx: lab.dx, labelDy: lab.dy, labelAlign: lab.align, zoom: zoom });
        if (s.glare) Draw.drawSun(ctx, s.x + 24, 9, 0, o.glareOn ? 'on' : 'off', zo);
      }
      if (s.type === 'staging') Draw.drawStaging(ctx, s.x, s.y, 0, 'default', { label: s.name, zoom: zoom });
      if (s.type === 'conveyor') Draw.drawConveyor(ctx, s.x, s.y, s.conv.a, 'default', { label: s.name, labelDx: s.conv.dx, labelDy: s.conv.dy, labelAlign: s.conv.align, zoom: zoom });
    });
    wh.chargers.forEach(function (c) { Draw.drawCharger(ctx, c.x, c.y, 0, o.chargerBusy && o.chargerBusy[c.i] ? 'occupied' : 'free', zo); });
    var cc = wh.chargerCaption, up = cc.up || 1;
    Draw.text(ctx, 'Charger zone', cc.x, cc.y, 12, zo, { align: cc.align });
    Draw.text(ctx, '(assumed count)', cc.x, cc.y - up * 14 / zoom, 12, zo, { align: cc.align });
    Draw.drawServiceBay(ctx, wh.serviceBay.x, wh.serviceBay.y, 0, 'default', { zoom: zoom, caption: false });
    Draw.text(ctx, 'Service bay', wh.serviceCaption.x, wh.serviceCaption.y, 12, zo, { align: wh.serviceCaption.align });
    if (o.swapBay) {
      Draw.drawSwapBay(ctx, wh.swapBay.x, wh.swapBay.y, 0, 'on', { slots: o.swapSlots || [], operatorBusy: o.operatorBusy, armAngle: o.armAngle, zoom: zoom });
      var sl = o.swapSlots || [], nc = sl.filter(function (x) { return x.state === 'charged'; }).length;
      Draw.text(ctx, nc + ' charged / ' + (sl.length - nc) + ' charging 100 min', wh.swapBay.x - 34, wh.swapBay.y - 6, 12, zo, { align: 'right' });
    }
  }

  var built = {};
  window.Warehouses = {
    CFG: CFG, SHIFTS: SHIFTS, PX_PER_M: PX_PER_M, siteRow: siteRow, render: render,
    get: function (id) { return built[id] || (built[id] = build(id)); },
    ids: ['A', 'B', 'C']
  };
})();
