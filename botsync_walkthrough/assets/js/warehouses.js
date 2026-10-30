/* warehouses.js: the three warehouse maps (spec section 7) as data, the waypoint graph, and the static map layer.
   Lengths are schematic. Only aisle widths are drawn to scale (14 px per metre of the real minimum aisle width). */
(function () {
  'use strict';
  var D = window.BOTSYNC_DATA, Draw = window.Draw;
  var PX_PER_M = 14, W = 900, RACK_DEPTH = 26;

  var CFG = {
    A: { site: 'S08', rackRows: 6, layout: { dock: 2, staging: 4, conveyor: 4, rack: 1 }, chargers: 3, glare: false, startClock: 15 * 60 },
    B: { site: 'S12', rackRows: 5, layout: { dock: 4, staging: 7, conveyor: 2, rack: 4 }, chargers: 6, glare: false, startClock: 15 * 60 },
    C: { site: 'S20', rackRows: 5, layout: { dock: 4, staging: 2, conveyor: 4, rack: 7 }, chargers: 6, glare: true, startClock: 15 * 60 + 30 }
  };
  var SHIFTS = { '24x7': { start: 0, end: 24 * 60, days: 7 }, '16x7': { start: 6 * 60, end: 22 * 60, days: 7 }, '16x6': { start: 6 * 60, end: 22 * 60, days: 6 } };

  function siteRow(id) { for (var i = 0; i < D.siteTable.length; i++) if (D.siteTable[i].site_id === id) return D.siteTable[i]; return null; }

  function build(id) {
    var cfg = CFG[id], site = siteRow(cfg.site);
    var aisleMin = site.aisleMin.v, aw = aisleMin * PX_PER_M;
    var leftX = 104, rightX = W - 104, midX = W / 2, topY = 92;
    var nodes = [], edgesH = {}, edgesV = {};
    function addNode(x, y, kind) { nodes.push({ id: nodes.length, x: x, y: y, kind: kind || 'way' }); return nodes.length - 1; }

    // racks and aisle lines
    var racks = [], hLines = [topY], rackTop = topY + aw / 2;
    for (var r = 0; r < cfg.rackRows; r++) {
      racks.push({ x: leftX + aw / 2, y: rackTop, w: midX - aw / 2 - (leftX + aw / 2), h: RACK_DEPTH, row: r });
      racks.push({ x: midX + aw / 2, y: rackTop, w: rightX - aw / 2 - (midX + aw / 2), h: RACK_DEPTH, row: r });
      if (r < cfg.rackRows - 1) hLines.push(rackTop + RACK_DEPTH + aw / 2);
      rackTop += RACK_DEPTH + aw;
    }
    var bottomY = rackTop - aw + aw / 2;
    hLines.push(bottomY);
    var H = Math.round(bottomY + aw / 2 + 56);
    var vLines = [leftX, midX, rightX];

    // points on each line: intersections first
    var hPts = hLines.map(function () { return []; }), vPts = vLines.map(function () { return []; });
    hLines.forEach(function (y, hi) {
      vLines.forEach(function (x, vi) { var n = addNode(x, y, 'cross'); hPts[hi].push(n); vPts[vi].push(n); });
    });

    // stations, numbered in the order of section 7: dock, staging, conveyor, rack
    var stations = [], bay = 1, L = cfg.layout;
    function spread(n, a, b) { var out = []; for (var i = 0; i < n; i++) out.push(a + (b - a) * (n === 1 ? 0.5 : i / (n - 1))); return out; }
    spread(L.dock, 190, W - 190).forEach(function (x) {
      var n = addNode(x, topY, 'station'); hPts[0].push(n);
      stations.push({ n: bay, name: 'Bay ' + bay, type: 'dock', code: 'D', x: x, y: 0, node: n, glare: !!cfg.glare, open: true }); bay++;
    });
    var stX = spread(L.staging, 150, W - 150);
    if (L.staging === 2) stX = [300, 600];
    stX.forEach(function (x) {
      // keep staging clear of the dock-door x positions
      stations.forEach(function (s) { if (s.type === 'dock' && Math.abs(s.x - x) < 40) x += 44; });
      var n = addNode(x, topY, 'station'); hPts[0].push(n);
      stations.push({ n: bay, name: 'Bay ' + bay, type: 'staging', code: 'F', x: x, y: 42, node: n, glare: false, open: true }); bay++;
    });
    spread(L.conveyor, topY + 60, bottomY - 30).forEach(function (y) {
      var n = addNode(leftX, y, 'station'); vPts[0].push(n);
      stations.push({ n: bay, name: 'Bay ' + bay, type: 'conveyor', code: 'C', x: 24, y: y, node: n, glare: false, open: true }); bay++;
    });
    var inner = hLines.length - 2;
    for (var k = 0; k < L.rack; k++) {
      var hi = 1 + (k % Math.max(inner, 1)), right = Math.floor(k / Math.max(inner, 1)) % 2 === 1;
      var x = right ? midX + (rightX - midX) * 0.55 : leftX + (midX - leftX) * 0.5;
      if (L.rack === 1) { hi = Math.max(1, Math.floor(hLines.length / 2)); x = midX + (rightX - midX) * 0.5; }
      var n2 = addNode(x, hLines[hi], 'station'); hPts[hi].push(n2);
      stations.push({ n: bay, name: 'Bay ' + bay, type: 'rack', code: 'R', x: x, y: hLines[hi] - aw / 2 - RACK_DEPTH / 2, node: n2, glare: false, open: true, rackRow: hi - 1 }); bay++;
    }

    // chargers on the bottom wall (1 per 3 robots, assumed), swap bay, service bay
    var chargers = [];
    spread(cfg.chargers, 200, 200 + 34 * (cfg.chargers - 1)).forEach(function (x, i) {
      var n = addNode(x, bottomY, 'charger'); hPts[hLines.length - 1].push(n);
      chargers.push({ i: i, x: x, y: H - 16, node: n });
    });
    var sbx = W - 190, swapNode = addNode(sbx, bottomY, 'swap'); hPts[hLines.length - 1].push(swapNode);
    var swapBay = { x: sbx, y: bottomY + aw / 2 + 24, node: swapNode };
    var svy = (topY + bottomY) / 2 + 20, serviceNode = addNode(rightX, svy, 'service'); vPts[2].push(serviceNode);
    var serviceBay = { x: W - 40, y: svy, node: serviceNode };

    // edges: consecutive points along each line
    var adj = nodes.map(function () { return []; });
    function link(a, b) { var d = Math.max(0.01, Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)); adj[a].push({ to: b, len: d }); adj[b].push({ to: a, len: d }); }
    hPts.forEach(function (pts) { pts.sort(function (a, b) { return nodes[a].x - nodes[b].x; }); for (var i = 1; i < pts.length; i++) link(pts[i - 1], pts[i]); });
    vPts.forEach(function (pts) { pts.sort(function (a, b) { return nodes[a].y - nodes[b].y; }); for (var i = 1; i < pts.length; i++) link(pts[i - 1], pts[i]); });

    // all-pairs shortest paths (Floyd-Warshall; the graphs have well under 100 nodes)
    var N = nodes.length, dist = [], next = [];
    for (var i = 0; i < N; i++) { dist.push(new Float64Array(N).fill(Infinity)); next.push(new Int16Array(N).fill(-1)); dist[i][i] = 0; next[i][i] = i; }
    adj.forEach(function (list, a) { list.forEach(function (e) { dist[a][e.to] = e.len; next[a][e.to] = e.to; }); });
    for (var kk = 0; kk < N; kk++) for (var ii = 0; ii < N; ii++) { var dik = dist[ii][kk]; if (dik === Infinity) continue; for (var jj = 0; jj < N; jj++) { var v = dik + dist[kk][jj]; if (v < dist[ii][jj]) { dist[ii][jj] = v; next[ii][jj] = next[ii][kk]; } } }

    var wh = {
      id: id, site: cfg.site, siteRow: site, name: site.site_name, shift: site.shift_pattern, shiftHours: SHIFTS[site.shift_pattern],
      aisleMin: aisleMin, aw: aw, W: W, H: H, racks: racks, hLines: hLines, vLines: vLines, nodes: nodes, adj: adj, dist: dist, next: next,
      stations: stations, chargers: chargers, swapBay: swapBay, serviceBay: serviceBay, robots: site.robots_deployed.v,
      startClock: cfg.startClock, glare: cfg.glare,
      workStations: stations.filter(function (s) { return true; })
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
    wh.stations.forEach(function (s) { if (s.type === 'rack') Draw.drawRack(ctx, s.x - 20, s.y - RACK_DEPTH / 2, 0, 'face', { w: 40, h: RACK_DEPTH, label: s.name, labelX: s.x, zoom: zoom }); });
    // glare bands (Warehouse C, 14:00 to 17:00 simulated time) and sun symbols
    if (wh.glare && o.glareOn) wh.stations.forEach(function (s) { if (s.type === 'dock' && s.glare) Draw.drawGlareBand(ctx, s.x, 3, 0, 'on', { len: 40 }); });
    wh.stations.forEach(function (s) {
      var closed = o.closed && o.closed[s.name];
      if (s.type === 'dock') { Draw.drawDockDoor(ctx, s.x, 1.5, 0, closed ? 'closed' : 'open', { label: s.name, zoom: zoom }); if (s.glare) Draw.drawSun(ctx, s.x + 24, 9, 0, o.glareOn ? 'on' : 'off', zo); }
      if (s.type === 'staging') Draw.drawStaging(ctx, s.x, s.y, 0, 'default', { label: s.name, zoom: zoom });
      if (s.type === 'conveyor') Draw.drawConveyor(ctx, s.x, s.y, Math.PI / 2, 'default', { label: s.name, labelDx: 16, labelAlign: 'left', zoom: zoom });
    });
    wh.chargers.forEach(function (c) { Draw.drawCharger(ctx, c.x, c.y, 0, o.chargerBusy && o.chargerBusy[c.i] ? 'occupied' : 'free', zo); });
    var cz = wh.chargers[0];
    Draw.text(ctx, 'Charger zone', cz.x - 20, cz.y, 12, zo, { align: 'right' });
    Draw.text(ctx, '(assumed count)', cz.x - 20, cz.y - 14 / zoom, 12, zo, { align: 'right' });
    Draw.drawServiceBay(ctx, wh.serviceBay.x, wh.serviceBay.y, 0, 'default', zo);
    if (o.swapBay) Draw.drawSwapBay(ctx, wh.swapBay.x, wh.swapBay.y, 0, 'on', { slots: o.swapSlots || [], operatorBusy: o.operatorBusy, armAngle: o.armAngle, zoom: zoom });
  }

  var built = {};
  window.Warehouses = {
    CFG: CFG, SHIFTS: SHIFTS, PX_PER_M: PX_PER_M, siteRow: siteRow, render: render,
    get: function (id) { return built[id] || (built[id] = build(id)); },
    ids: ['A', 'B', 'C']
  };
})();
