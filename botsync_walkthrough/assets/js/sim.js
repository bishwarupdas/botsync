/* sim.js: one simulation engine for Explore (demo speed, traffic by mechanism) and Game (calibrated incidents).
   Deterministic given a seed: every random draw comes from mulberry32 streams. no unseeded random number calls are used.
   Time unit: simulated minutes. */
(function () {
  'use strict';
  var D = window.BOTSYNC_DATA, W = window.Warehouses, A = D.assumed;
  var mulberry32 = window.Draw.mulberry32;

  /* Calibration knobs (8.5 allows only these two): the mission duty (site work arrival rate, missions per minute) and the charge trigger, per site.
     Tuned with tools/calibrate.js so the Today baseline matches 5.7 within the tolerance. */
  var CAL = {
    A: { demand: 1.3979, chargeTrigger: 0.36, triggerSpread: 0 },
    B: { demand: 2.3274, chargeTrigger: 0.25, triggerSpread: 0.05 },
    C: { demand: 2.6923, chargeTrigger: 0.25, triggerSpread: 0 }
  };
  var DRIVE_PX_PER_MIN = 240;     // map travel speed; schematic, the map lengths are not to scale
  var FORK_DWELL_MIN = 0.5;       // pick-up and drop-off time at a station (part of a mission)
  var DRAIN_PER_MIN = 1 / (A.runTimeH.v * 60);
  var CHARGE_MIN = A.chargeTimeMin.v;
  var DEADLOCK_WAIT_MIN = 1;      // 60 simulated seconds (8.1d)
  var FOLLOW_GAP_PX = 40;         // a robot keeps one robot-length behind the one ahead on the same segment (Explore)
  var LEVEL = D.codeLevel;

  function hashSeed() { var h = 2166136261 >>> 0; for (var i = 0; i < arguments.length; i++) { h ^= (arguments[i] + 0x9e3779b9 + (h << 6) + (h >>> 2)) >>> 0; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function stream(seed, a, b) { return mulberry32(hashSeed(seed, a, b || 0)); }
  function normal(rng) { var u = Math.max(rng(), 1e-12), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function lognormal(rng, median, sigma) { return median * Math.exp(sigma * normal(rng)); }
  function expo(rng, rate) { return -Math.log(Math.max(rng(), 1e-12)) / rate; }
  function poisson(rng, mean) { if (mean <= 0) return 0; var L = Math.exp(-mean), k = 0, q = 1; do { k++; q *= rng(); } while (q > L && k < 1000); return k - 1; }
  function pickWeighted(rng, items) { var tot = 0, i; for (i = 0; i < items.length; i++) tot += items[i][1]; var u = rng() * tot; for (i = 0; i < items.length; i++) { u -= items[i][1]; if (u <= 0) return items[i][0]; } return items[items.length - 1][0]; }

  var RECOVERY = D.recoveryDist;
  function drawDowntime(rng, type) { var r = RECOVERY[type] || RECOVERY.operator; return lognormal(rng, r.median.v, r.sigma.v); }
  function category(state) {
    switch (state) {
      case 'moving': return 'moving';
      // the utilisation tab has no waiting column, so a robot waiting for a charger or the swap bay counts as idle there;
      // the waiting is also tracked on its own (m.queueMin) and counts in "robot time returned"
      case 'idle': case 'queueCharge': case 'queueSwap': return 'idle';
      case 'toCharge': case 'charging': case 'toSwapBay': case 'swapping': return 'charging';
      case 'stopped': case 'recovering': return 'stopped';
      default: return null;
    }
  }

  /* ---------------- engine ---------------- */
  function create(opts) {
    var wh = W.get(opts.wh), site = wh.siteRow, cal = CAL[opts.wh];
    var seed = opts.seed >>> 0, mode = opts.mode || 'game';
    var policy = opts.policy || {}, P = opts.params || {};
    var p = {
      swapTime: P.swapTime != null ? P.swapTime : A.swapTimeMin.v,
      spares: P.spares != null ? P.spares : A.sparePacksPerRobot.v,
      operators: P.operators != null ? P.operators : A.swapOperators.v,
      agentCan: P.agentCan != null ? P.agentCan : A.agentCan.v,
      gatePass: P.gatePass != null ? P.gatePass : A.gatePass.v,
      headroom: P.headroom != null ? P.headroom : A.headroom.v,
      triageSaving: P.triageSaving != null ? P.triageSaving : A.triageSaving.v,
      chargeTrigger: P.chargeTrigger != null ? P.chargeTrigger : cal.chargeTrigger,
      demand: P.demand != null ? P.demand : cal.demand,
      offered: opts.offeredHeadroom || 0,   // extra work waiting, offered to Today and the policy alike (8.1b)
      triggerSpread: P.triggerSpread != null ? P.triggerSpread : cal.triggerSpread
    };
    var shift = wh.shiftHours, days = opts.days || 7, nR = wh.robots;
    var pFlat = site.lowBatteryStops.v / site.chargeSessions.v;
    var stations = wh.stations.filter(function (s) { return s.open !== false; });

    var S = {
      wh: wh, opts: opts, params: p, policy: policy, mode: mode, seed: seed, t: opts.startMin || 0, days: days, end: days * 1440,
      robots: [], chargers: wh.chargers.map(function () { return null; }), chargeQueue: [], swapQueue: [], operatorsBusy: [],
      packs: [], events: [], budget: opts.budget || null, pFlat: pFlat, closed: {}, pending: 0, rngW: stream(seed, 777), arrived: 0,
      m: { cat: { moving: 0, charging: 0, idle: 0, stopped: 0 }, sched: 0, dayMoving: [], dayCat: [], incidents: {}, emergency: 0, downtimeMin: 0,
        walkUps: 0, humanClicks: 0, swaps: 0, swapWait: 0, chargeSessions: 0, agentHandled: 0, confirmed: 0, confirmedBase: 0, totalInc: 0, walkUpsAvoided: 0,
        waitMin: 0, chargerFallbacks: 0, queueMin: 0, missionsDone: 0 }
    };
    for (var dd = 0; dd < days + 1; dd++) { S.m.dayMoving.push(0); S.m.dayCat.push({ moving: 0, charging: 0, idle: 0, stopped: 0, sched: 0 }); }
    var nPacks = Math.round(p.spares * nR);
    for (var k = 0; k < nPacks; k++) S.packs.push({ id: k, state: 'charged', readyAt: 0, reserved: false });
    for (var o = 0; o < p.operators; o++) S.operatorsBusy.push(null);

    // per-robot streams: missions, charge, incidents (pre-drawn)
    var initRng = stream(seed, 999);
    for (var i = 0; i < nR; i++) {
      var st = stations[Math.floor(initRng() * stations.length)];
      var r = {
        i: i, label: 'Bot ' + (i + 1), state: 'idle', battery: shift.end - shift.start >= 1440 ? 0.3 + 0.7 * initRng() : 1,
        node: st.node, x: wh.nodes[st.node].x, y: wh.nodes[st.node].y, angle: 0, path: null, seg: 0, pos: 0, carrying: false,
        mission: null, timer: 0, idleUntil: 0, incident: null, resume: null, chargerIdx: -1, packId: -1, wait: 0, schedMin: 0,
        rngM: stream(seed, i, 1), rngC: stream(seed, i, 2), rngI: stream(seed, i, 3), incList: [], incPtr: 0, lastIncident: null,
        trigger: 0, corridor: null, waitingFor: null, history: [], recoveredUntil: -1, selectedFlag: false
      };
      if (shift.end - shift.start < 1440) r.battery = 1;
      r.trigger = p.chargeTrigger + p.triggerSpread * initRng();   // this robot's soft charge trigger (calibration knob, 8.5)
      S.robots.push(r);
    }
    if (mode === 'game' || opts.calibratedIncidents) buildIncidentSchedules(S);
    if (mode === 'explore') buildCorridors(S);
    return S;
  }

  /* 8.2: calibrated incidents, pre-drawn per robot in scheduled-time minutes so every policy sees the same incidents */
  function buildIncidentSchedules(S) {
    var site = S.wh.siteRow, schedH = site.scheduledHours.v, codes = [], rateTot = 0;
    Object.keys(site.incidentsByCode).forEach(function (c) {
      if (c === 'ERR_BATTERY_LOW_CRITICAL') return;   // comes from the battery model (8.1)
      var rate = site.incidentsByCode[c].v / schedH / 60;   // per scheduled robot-minute
      codes.push([c, rate]); rateTot += rate;
    });
    var rec = []; Object.keys(site.recoveryTypes).forEach(function (k) { rec.push([k, site.recoveryTypes[k].v]); });
    var shift = S.wh.shiftHours, shiftLen = shift.end - shift.start, totalSched = schedPerDay(S) * S.days / 1;
    var glareC = S.wh.glare ? (shiftLen / 60) / ((shiftLen / 60 - 3) + 3 * 3) : 1;
    var glareDocks = S.wh.stations.filter(function (s) { return s.type === 'dock' && s.glare; });
    var dockingRate = 0; codes.forEach(function (c) { if (c[0] === 'ERR_DOCKING_ALIGNMENT_TIMEOUT') dockingRate = c[1]; });
    var candRate = rateTot + (S.wh.glare ? dockingRate * (3 * glareC - 1) : 0);
    S.robots.forEach(function (r) {
      var rng = r.rngI, t = 0;
      while (true) {
        t += expo(rng, candRate);
        if (t > totalSched) break;
        // decide the code; docking candidates at C are thinned by time of day (3x in 14:00-17:00, total preserved)
        var u = rng() * candRate, code = null, acc = 0;
        for (var j = 0; j < codes.length; j++) { var w = codes[j][1] * (S.wh.glare && codes[j][0] === 'ERR_DOCKING_ALIGNMENT_TIMEOUT' ? 3 * glareC : 1); acc += w; if (u <= acc) { code = codes[j][0]; break; } }
        if (!code) code = codes[codes.length - 1][0];
        var accept = rng(), clockMin = schedToClock(S, t), inWin = clockMin >= 14 * 60 && clockMin < 17 * 60;
        var draw = { recov: pickWeighted(rng, rec), down: 0, uAgent: rng(), uGate: rng(), uConfirm: rng(), uTriage: rng(), uStation: rng() };
        draw.down = drawDowntime(rng, draw.recov);
        if (S.wh.glare && code === 'ERR_DOCKING_ALIGNMENT_TIMEOUT' && !inWin && accept > 1 / 3) continue;
        var station = null;
        if (code === 'ERR_DOCKING_ALIGNMENT_TIMEOUT' || code === 'ERR_PALLET_POCKET_NOT_DETECTED') {
          if (S.wh.glare && code === 'ERR_DOCKING_ALIGNMENT_TIMEOUT' && inWin) station = glareDocks[Math.floor(draw.uStation * glareDocks.length)].name;
          else station = S.wh.stations[Math.floor(draw.uStation * S.wh.stations.length)].name;
        }
        r.incList.push({ at: t, code: code, recov: draw.recov, down: draw.down, uAgent: draw.uAgent, uGate: draw.uGate, uConfirm: draw.uConfirm, uTriage: draw.uTriage, station: station, glareWindow: inWin });
      }
    });
  }
  function schedPerDay(S) { var sh = S.wh.shiftHours; return (sh.end - sh.start) * sh.days / 7; }
  function schedToClock(S, schedMin) {
    var sh = S.wh.shiftHours, len = sh.end - sh.start;
    return sh.start + (schedMin % len);
  }
  function onShift(S, t) {
    var sh = S.wh.shiftHours, day = Math.floor(t / 1440), m = t - day * 1440;
    if (sh.days === 6 && day % 7 === 6) return false;
    return m >= sh.start && m < sh.end;
  }

  /* 8.1d traffic (Explore only): each aisle segment (edge between two waypoints) holds one robot at a time.
     A robot waiting at a waypoint holds nothing; the first robot to wait for a segment is next in, so nobody waits for ever.
     A wait over 60 simulated seconds raises a stop. */
  function buildCorridors(S) {
    var wh = S.wh, cor = {};
    wh.adj.forEach(function (list, a) { list.forEach(function (e) { var k = wh.edgeKey(a, e.to); if (!cor[k]) cor[k] = { c: { id: k, users: [], dir: 0, reserve: 0 }, fwd: a < e.to ? [a, e.to] : [e.to, a] }; }); });
    S.corridors = cor;
  }
  function sameLine(wh, a, b, c) { var A1 = wh.nodes[a], B = wh.nodes[b], Cn = wh.nodes[c]; return (Math.abs(A1.x - B.x) < 0.6 && Math.abs(B.x - Cn.x) < 0.6) || (Math.abs(A1.y - B.y) < 0.6 && Math.abs(B.y - Cn.y) < 0.6); }
  function corridorDir(S, a, b) { var info = S.corridors[S.wh.edgeKey(a, b)]; return { c: info.c, dir: info.fwd[0] === a ? 1 : -1 }; }

  /* ---------------- robot actions ---------------- */
  function log(S, r, code, outcome, extra) {
    var ev = { t: S.t, robot: r ? r.label : '', code: code || '', outcome: outcome || '' };
    if (extra) for (var k in extra) ev[k] = extra[k];
    S.events.push(ev); if (S.events.length > 200) S.events.shift();
    if (S.onEvent) S.onEvent(ev);
  }
  function setPath(S, r, target) {
    var path = S.wh.path(r.node, target);
    r.path = path; r.seg = 0; r.pos = 0; r.dest = target;
    if (r.corridor) { leaveCorridor(S, r); }
  }
  function startMission(S, r) {
    var st = stationsOpen(S), rng = r.rngM;
    var pick = st[Math.floor(rng() * st.length)], drop = st[Math.floor(rng() * st.length)];
    if (drop === pick) drop = st[(st.indexOf(pick) + 1) % st.length];
    if (S.redirectDrop) drop = S.wh.station(S.redirectDrop) || drop;
    r.mission = { pick: pick, drop: drop, phase: 'toPick' };
    r.state = 'moving'; r.carrying = false; setPath(S, r, pick.node);
  }
  function stationsOpen(S) { return S.wh.stations.filter(function (s) { return !S.closed[s.name]; }); }
  function requestCharge(S, r) {
    // one uniform per request, drawn whether or not it is used, so a swap run and a Today run stay aligned
    var u = r.rngC();
    S.m.chargeRequests = (S.m.chargeRequests || 0) + 1;
    if (S.policy.swap) {
      var pack = null; for (var i = 0; i < S.packs.length; i++) if (S.packs[i].state === 'charged' && !S.packs[i].reserved) { pack = S.packs[i]; break; }
      if (pack) { pack.reserved = true; r.packId = pack.id; r.state = 'toSwapBay'; setPath(S, r, S.wh.swapBay.node); return; }
      S.m.chargerFallbacks++;
    }
    if (u < S.pFlat) {
      // runs flat before reaching a charger: hard stop, cleared by an operator walk-up, then charges
      var rng = r.rngC, down = drawDowntime(rng, 'operator');
      openIncident(S, r, { code: 'ERR_BATTERY_LOW_CRITICAL', recov: 'operator', down: down, uAgent: 1, uGate: 1, uConfirm: rng(), uTriage: rng(), flat: true }, 'toCharge');
      return;
    }
    goCharge(S, r);
  }
  /* soft trigger: charge early only if a charger (or, with the swap policy, a charged pack) is free right now */
  function canChargeNow(S) {
    if (S.chargers.indexOf(null) >= 0 && !S.chargeQueue.length) return true;
    if (S.policy.swap) for (var i = 0; i < S.packs.length; i++) if (S.packs[i].state === 'charged' && !S.packs[i].reserved) return true;
    return false;
  }
  function goCharge(S, r) {
    var best = -1, bd = Infinity;
    S.chargers.forEach(function (occ, ci) { if (occ == null) { var d = S.wh.dist[r.node][S.wh.chargers[ci].node]; if (d < bd) { bd = d; best = ci; } } });
    if (best >= 0) { S.chargers[best] = r.i; r.chargerIdx = best; r.state = 'toCharge'; setPath(S, r, S.wh.chargers[best].node); }
    else { r.chargerIdx = -1; r.state = 'toCharge'; r.queueing = true; setPath(S, r, S.wh.chargers[0].node); }
  }
  function openIncident(S, r, inc, resume) {
    var lvl = LEVEL[inc.code], m = S.m;
    inc.t = S.t; inc.robot = r.label; inc.level = lvl; inc.severity = (D.errorCodes[inc.code] || {}).severity || 'soft stop';
    if (!inc.station && r.mission) inc.station = (r.mission.phase === 'toPick' ? r.mission.pick : r.mission.drop).name;
    inc.handledBy = inc.recov;
    // 8.3 recovery agent: level-1 codes that today need an operator or remote person
    if (S.policy.agent && lvl === '1' && (inc.recov === 'operator' || inc.recov === 'remote') && inc.uAgent < S.params.agentCan) {
      if (inc.uGate < S.params.gatePass) { inc.down = RECOVERY.auto.median.v; inc.handledBy = 'agent'; }
      else { inc.down = RECOVERY.auto.median.v + A.approvalWaitMin.v; inc.handledBy = 'agent+click'; m.humanClicks++; }
      m.agentHandled++; if (inc.recov === 'operator') m.walkUpsAvoided++;
    }
    if (inc.handledBy === 'operator' && S.mode !== 'explore') m.walkUps++;   // Explore counts the walk-up when it happens (ui.js)
    m.incidents[inc.code] = (m.incidents[inc.code] || 0) + 1; m.totalInc++;
    if (inc.code === 'ERR_BATTERY_LOW_CRITICAL') m.emergency++;
    m.downtimeMin += inc.down;
    var conf = inc.uConfirm < A.confirmedCauseStart.v;
    if (conf) m.confirmedBase++;
    if (conf || (S.policy.triage && inc.uTriage < (A.confirmedCauseTarget.v - A.confirmedCauseStart.v) / (1 - A.confirmedCauseStart.v))) m.confirmed++;
    r.resume = resume || r.state; r.incident = inc; r.lastIncident = inc; r.state = 'stopped'; r.timer = inc.down;
    if (r.corridor) leaveCorridor(S, r);
    dropReserve(S, r); r.waitingFor = null; r.wait = 0;
    if (S.mode === 'explore') r.timer = inc.holdForUser ? Infinity : inc.down;
    log(S, r, inc.code, 'stopped' + (inc.station ? ' at ' + inc.station : ''), { kind: 'stop' });
  }
  function clearIncident(S, r, how) {
    var inc = r.incident; r.incident = null;
    var next = r.resume || 'idle'; r.resume = null;
    if (inc && inc.flat) next = 'toCharge';
    r.recoveredUntil = S.t + (S.mode === 'explore' ? 2000 : 0); // UI uses wall time; see ui.js
    if (next === 'toCharge') { if (r.chargerIdx >= 0) { r.state = 'toCharge'; setPath(S, r, S.wh.chargers[r.chargerIdx].node); } else goCharge(S, r); }
    else if (next === 'moving' && r.mission) { r.state = 'moving'; setPath(S, r, r.mission.phase === 'toPick' ? r.mission.pick.node : r.mission.drop.node); }
    else if (next === 'toSwapBay') { r.state = 'toSwapBay'; setPath(S, r, S.wh.swapBay.node); }
    else { r.state = 'idle'; r.mission = null; }
    if (inc) log(S, r, inc.code, how || 'cleared', { kind: 'clear', handledBy: inc.handledBy });
  }

  /* corridor bookkeeping (Explore) */
  function dropReserve(S, r) { if (!S.corridors) return; var c = r.waitingFor; if (c && c.reserveBy === r.i) { c.reserve = 0; c.reserveBy = null; } }
  function leaveCorridor(S, r) { var c = r.corridor; if (!c) return; var k = c.users.indexOf(r.i); if (k >= 0) c.users.splice(k, 1); if (!c.users.length) c.dir = 0; r.corridor = null; }
  function tryEnter(S, r, a, b) {
    if (!S.corridors) return true;
    var cd = corridorDir(S, a, b), c = cd.c;
    if (r.corridor === c) return true;
    if (c.reserve && (c.reserveBy == null || S.robots[c.reserveBy].waitingFor !== c)) { c.reserve = 0; c.reserveBy = null; }   // stale: that robot is no longer waiting here
    // head-on robots queue; robots going the same way follow one robot-length apart, so they never drive onto each other
    var last = c.users.length ? S.robots[c.users[c.users.length - 1]] : null;
    var blocked = (c.users.length && c.dir !== cd.dir) || (c.reserve && c.reserve !== cd.dir && c.reserveBy !== r.i) || (last && last.pos < FOLLOW_GAP_PX);
    if (blocked) { if (!c.reserve && c.users.length && c.dir !== cd.dir) { c.reserve = cd.dir; c.reserveBy = r.i; } return false; }
    if (r.corridor) leaveCorridor(S, r);
    if (c.reserveBy === r.i) { c.reserve = 0; c.reserveBy = null; }
    c.users.push(r.i); c.dir = cd.dir; r.corridor = c; return true;
  }

  /* move along the path by up to dt minutes; returns minutes used */
  function travel(S, r, dt) {
    var wh = S.wh, used = 0;
    while (used < dt - 1e-9 && r.path && r.seg < r.path.length - 1) {
      var a = r.path[r.seg], b = r.path[r.seg + 1];
      if (r.pos === 0 && !tryEnter(S, r, a, b)) {
        // blocked head-on: try a route around, else wait (counts toward the 60-second deadlock rule)
        if (!r.triedReplan) { r.triedReplan = true; if (replanAround(S, r)) { dropReserve(S, r); r.waitingFor = null; continue; } }
        var w = dt - used; r.wait += w; S.m.waitMin += w; r.waitingFor = corridorDir(S, a, b).c;
        return dt;
      }
      r.waitingFor = null; r.wait = 0; r.triedReplan = false;
      var na = wh.nodes[a], nb = wh.nodes[b], len = Math.max(0.01, Math.hypot(nb.x - na.x, nb.y - na.y));
      var can = (dt - used) * DRIVE_PX_PER_MIN, left = len - r.pos;
      if (r.corridor) {   // following: stop one robot-length behind the robot ahead on this segment
        var qi = r.corridor.users.indexOf(r.i), ahead = qi > 0 ? S.robots[r.corridor.users[qi - 1]] : null;
        if (ahead && ahead.corridor === r.corridor) {
          var room = ahead.pos - FOLLOW_GAP_PX - r.pos;
          if (room <= 0.01) { var ww = dt - used; r.wait += ww * 0.25; S.m.waitMin += ww; return dt; }
          can = Math.min(can, room);
          if (can < left) { r.pos += can; var tu = can / DRIVE_PX_PER_MIN; used += tu; r.x = na.x + (nb.x - na.x) * r.pos / len; r.y = na.y + (nb.y - na.y) * r.pos / len; if (can >= room - 0.01) { var w2 = dt - used; S.m.waitMin += w2; return dt; } continue; }
        }
      }
      r.angle = Math.atan2(nb.y - na.y, nb.x - na.x);
      if (can >= left) { used += left / DRIVE_PX_PER_MIN; r.seg++; r.pos = 0; r.node = b; r.x = nb.x; r.y = nb.y; if (r.corridor) leaveCorridor(S, r); }
      else { r.pos += can; used = dt; r.x = na.x + (nb.x - na.x) * r.pos / len; r.y = na.y + (nb.y - na.y) * r.pos / len; }
    }
    if (r.path && r.seg >= r.path.length - 1) { r.path = null; if (r.corridor && S.corridors) leaveCorridor(S, r); return -used - 1e-9; }  // arrived
    return used;
  }
  function replanAround(S, r) {
    var wh = S.wh, blocked = {}, target = r.dest, N = wh.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int16Array(N).fill(-1), done = new Uint8Array(N);
    Object.keys(S.corridors).forEach(function (k) { var info = S.corridors[k], c = info.c; if (c.users.length && c.users.indexOf(r.i) < 0) blocked[k] = c.dir === 1 ? info.fwd[1] + '>' + info.fwd[0] : info.fwd[0] + '>' + info.fwd[1]; });
    dist[r.node] = 0;
    for (var it = 0; it < N; it++) {
      var u = -1, bd = Infinity; for (var i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === target) break; done[u] = 1;
      wh.adj[u].forEach(function (e) { var k = wh.edgeKey(u, e.to); if (blocked[k] === u + '>' + e.to) return; var nd = dist[u] + e.len; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; } });
    }
    if (dist[target] === Infinity || dist[target] > 2 * wh.dist[r.node][target] + 60) return false;
    var p = [target]; while (p[0] !== r.node) p.unshift(prev[p[0]]);
    r.path = p; r.seg = 0; r.pos = 0; return true;
  }
  function arrive(S, r) {
    var st = r.state;
    if (st === 'moving' && r.mission) {
      r.timer = FORK_DWELL_MIN; r.dwell = true;
    } else if (st === 'toCharge') {
      if (r.chargerIdx < 0) { r.state = 'queueCharge'; S.chargeQueue.push(r.i); }
      else { r.state = 'charging'; r.timer = CHARGE_MIN; r.chargeFrom = r.battery; S.m.chargeSessions++; }
    } else if (st === 'toSwapBay') { r.state = 'queueSwap'; S.swapQueue.push(r.i); }
    else if (st === 'toService') { r.state = 'stopped'; }
    else if (st === 'moving') { r.state = 'idle'; r.idleUntil = S.t; }
  }

  function advanceRobot(S, r, dt, on) {
    var t0 = S.t, guard = 0, rem = dt;
    while (rem > 1e-9 && guard++ < 30) {
      var used = rem, st = r.state;
      var tl = t0 + (dt - rem);
      // calibrated incidents fall due on the robot's scheduled-time clock (Game)
      if (on && r.incPtr < r.incList.length && r.incList[r.incPtr].at <= r.schedMin && (st === 'moving' || st === 'idle' || st === 'toCharge' || st === 'toSwapBay')) {
        if (!(st === 'moving' && r.dwell)) { var inc = r.incList[r.incPtr++]; S.t = tl; openIncident(S, r, inc, st); continue; }
      }
      if (st === 'parked') { used = rem; }
      else if (st === 'idle') {
        if (r.battery <= S.params.chargeTrigger || (r.battery <= r.trigger && canChargeNow(S))) { S.t = tl; requestCharge(S, r); continue; }
        var dayIdx = Math.floor(tl / 1440);
        var budgetOk = !S.budget || S.m.dayMoving[dayIdx] < S.budget[dayIdx];
        // work arrives at the site; a robot moves only when a pallet move is waiting (8.1b)
        if (S.pending >= 1 && budgetOk && !r.hold && on && r.offered) { r.offered = false; S.pending -= 1; S.t = tl; startMission(S, r); continue; }
        used = rem;
        r.battery -= used * DRAIN_PER_MIN * A.idleDrainFactor.v;
      } else if (st === 'moving' || st === 'toCharge' || st === 'toSwapBay' || st === 'toService') {
        if (r.dwell) {
          used = Math.min(rem, r.timer); r.timer -= used; r.battery -= used * DRAIN_PER_MIN;
          if (r.timer <= 1e-9) {
            r.dwell = false;
            if (r.mission.phase === 'toPick') { r.mission.phase = 'toDrop'; r.carrying = true; setPath(S, r, r.mission.drop.node); }
            else { r.mission = null; r.carrying = false; r.state = 'idle'; S.m.missionsDone++; }
          }
        } else {
          var u2 = travel(S, r, rem);
          if (u2 < 0) { used = -u2; r.battery -= used * DRAIN_PER_MIN; S.t = tl + used; arrive(S, r); if (used < 1e-9) used = 1e-9; }
          else {
            used = u2; r.battery -= used * DRAIN_PER_MIN * (r.wait > 0 ? A.idleDrainFactor.v : 1);
            if (S.mode === 'explore' && r.wait > DEADLOCK_WAIT_MIN) { S.t = tl + used; trafficIncident(S, r); }
          }
        }
      } else if (st === 'queueCharge' || st === 'queueSwap') {
        used = rem; r.battery -= used * DRAIN_PER_MIN * A.idleDrainFactor.v; if (on) { S.m.queueMin += used; if (st === 'queueSwap') S.m.swapWait += used; }
      } else if (st === 'charging') {
        used = Math.min(rem, r.timer); r.timer -= used;
        r.battery = Math.min(1, r.chargeFrom + (1 - r.chargeFrom) * (1 - r.timer / CHARGE_MIN));
        if (r.timer <= 1e-9) { r.battery = 1; S.chargers[r.chargerIdx] = null; r.chargerIdx = -1; r.state = 'idle'; S.t = tl + used; serveChargeQueue(S); }
      } else if (st === 'swapping') {
        used = Math.min(rem, r.timer); r.timer -= used;
        if (r.timer <= 1e-9) {
          r.battery = 1; var opi = S.operatorsBusy.indexOf(r.i); if (opi >= 0) S.operatorsBusy[opi] = null;
          var pk = S.packs[r.packId]; pk.state = 'charging'; pk.readyAt = tl + used + CHARGE_MIN; pk.reserved = false; r.packId = -1;
          S.m.swaps++; r.state = 'idle'; S.t = tl + used; serveSwapQueue(S);
          log(S, r, '', 'pack swapped', { kind: 'swap' });
        }
      } else if (st === 'stopped' || st === 'recovering') {
        used = Math.min(rem, r.timer);
        if (r.timer !== Infinity) r.timer -= used;
        if (r.timer <= 1e-9) { S.t = tl + used; if (st === 'recovering') clearIncident(S, r, 'recovered'); else clearIncident(S, r, r.incident && r.incident.handledBy === 'auto' ? 'cleared automatically' : 'cleared by ' + (r.incident ? r.incident.handledBy : 'operator')); }
      }
      if (on) {
        var cat = category(st);
        if (cat) { S.m.cat[cat] += used; var di = Math.floor(tl / 1440); if (S.m.dayCat[di]) { S.m.dayCat[di][cat] += used; S.m.dayCat[di].sched += used; } if (cat === 'moving' && S.m.dayMoving[di] != null) S.m.dayMoving[di] += used; }
        S.m.sched += used; r.schedMin += used;
      }
      if (r.battery < 0) r.battery = 0;
      rem -= used;
    }
    S.t = t0;
  }
  function trafficIncident(S, r) {
    // a cycle of waiting robots is gridlock; a single long wait is a deadlock
    // gridlock: the robot it waits for is itself waiting (a multi-robot wait chain); otherwise a deadlock
    var c = r.waitingFor, cycle = false;
    if (c) c.users.forEach(function (j) { var o = S.robots[j]; if (o.waitingFor || o.wait > 0) cycle = true; });
    if (c && c.reserveBy === r.i) { c.reserve = 0; c.reserveBy = null; }
    var code = cycle ? 'ERR_INTERSECTION_GRIDLOCK_TIMEOUT' : 'ERR_PATH_PLANNING_DEADLOCK';
    var rng = r.rngC, recov = pickWeighted(rng, Object.keys(S.wh.siteRow.recoveryTypes).map(function (k) { return [k, S.wh.siteRow.recoveryTypes[k].v]; }));
    if (recov === 'tech') recov = 'operator';
    r.wait = 0; r.waitingFor = null;
    openIncident(S, r, { code: code, recov: recov, down: drawDowntime(rng, recov), uAgent: rng(), uGate: rng(), uConfirm: rng(), uTriage: rng(), traffic: true }, 'moving');
  }
  function serveChargeQueue(S) {
    while (S.chargeQueue.length) {
      var free = S.chargers.indexOf(null); if (free < 0) return;
      var r = S.robots[S.chargeQueue.shift()]; S.chargers[free] = r.i; r.chargerIdx = free; r.queueing = false; r.state = 'toCharge'; setPath(S, r, S.wh.chargers[free].node);
    }
  }
  function serveSwapQueue(S) {
    while (S.swapQueue.length) {
      var free = S.operatorsBusy.indexOf(null); if (free < 0) return;
      var r = S.robots[S.swapQueue.shift()]; S.operatorsBusy[free] = r.i; r.state = 'swapping'; r.timer = S.params.swapTime; r.swapStart = S.t;
    }
  }

  function step(S, dt) {
    var on = onShift(S, S.t);
    // shift boundaries (8.1c): off shift robots are parked and charge to full; nothing is counted
    if (!on && !S.offShift) {
      S.offShift = true;
      S.robots.forEach(function (r) {
        if (r.corridor) leaveCorridor(S, r);
        if (r.chargerIdx >= 0) S.chargers[r.chargerIdx] = null;
        if (r.packId >= 0) { S.packs[r.packId].reserved = false; r.packId = -1; }
        r.chargerIdx = -1; r.incident = null; r.mission = null; r.path = null; r.carrying = false; r.dwell = false; r.state = 'parked';
      });
      S.chargeQueue = []; S.swapQueue = []; S.operatorsBusy = S.operatorsBusy.map(function () { return null; });
    }
    if (on && S.offShift) {
      S.offShift = false;
      S.robots.forEach(function (r) { r.state = 'idle'; r.battery = 1; });
      S.pending = 0;
    }
    // spare packs finish charging
    S.packs.forEach(function (pk) { if (pk.state === 'charging' && S.t >= pk.readyAt) pk.state = 'charged'; });
    if (on) { var lam = S.params.demand * (1 + S.params.offered) * dt, k = poisson(S.rngW, lam); S.pending += k; S.arrived += k; }
    serveSwapQueue(S); serveChargeQueue(S);
    // the fleet manager offers waiting work to idle robots, fullest battery first
    if (on && S.pending >= 1) {
      var idle = S.robots.filter(function (r) { return r.state === 'idle' && !r.hold && r.battery > S.params.chargeTrigger; });
      idle.sort(function (x, y) { return y.battery - x.battery || x.i - y.i; });
      for (var q = 0; q < idle.length && q < Math.floor(S.pending); q++) idle[q].offered = true;
    }
    for (var i = 0; i < S.robots.length; i++) advanceRobot(S, S.robots[i], dt, on);
    S.robots.forEach(function (r) { r.offered = false; });
    S.t += dt;
  }
  function run(S, untilMin, dt) { dt = dt || 1; while (S.t < untilMin - 1e-9) step(S, Math.min(dt, untilMin - S.t)); return S; }

  function metrics(S) {
    var m = S.m, sched = m.sched || 1, ppm = A.palletsPerMovingHour.v;
    return {
      wh: S.wh.id, seed: S.seed, days: S.days, scheduledHoursPerRobot: m.sched / 60 / S.robots.length,
      scheduledHours: m.sched / 60, movingHours: m.cat.moving / 60, chargingHours: m.cat.charging / 60, idleHours: m.cat.idle / 60, stoppedHours: m.cat.stopped / 60,
      shareMoving: m.cat.moving / sched, shareCharging: m.cat.charging / sched, shareIdle: m.cat.idle / sched, shareStopped: m.cat.stopped / sched,
      palletMoves: m.cat.moving / 60 * ppm, queueHours: m.queueMin / 60, emergencyLowBatteryStops: m.emergency, incidents: m.totalInc, incidentsByCode: m.incidents,
      downtimeHours: m.downtimeMin / 60, operatorWalkUps: m.walkUps, humanClicks: m.humanClicks, swapsDone: m.swaps, swapWaitMinutesTotal: m.swapWait,
      flatBatteryEventsAvoided: m.swaps * S.pFlat, packsInUse: S.packs.length, chargeSessions: m.chargeSessions, chargerFallbacks: m.chargerFallbacks,
      agentHandled: m.agentHandled, walkUpsAvoided: m.walkUpsAvoided,
      confirmedCausePercent: m.totalInc ? m.confirmed / m.totalInc : A.confirmedCauseStart.v,
      noFaultFoundEngineeringHours: D.support.noFaultFoundEngHours.v * (S.policy.triage ? 1 - S.params.triageSaving : 1),
      backlog: S.pending, arrived: S.arrived, missionsDone: m.missionsDone,
      dayMoving: m.dayMoving.slice(0, S.days), dayCat: m.dayCat.slice(0, S.days), trafficWaitHours: m.waitMin / 60
    };
  }

  /* Game (8.1b): "today's volume" comes from the calibrated Today run. Both columns then face the same work: today's volume plus the
     headroom share waiting. The policy may complete at most today's volume x (1 + headroom) per day. Same seed everywhere. */
  function hr(o) { return o.params && o.params.headroom != null ? o.params.headroom : A.headroom.v; }
  function baseline(o) { var b = create({ wh: o.wh, seed: o.seed, days: o.days, policy: {}, params: o.params, mode: 'game' }); run(b, b.end); return metrics(b); }
  function compare(o) {
    var st = compareStepper(o); st.advance(Infinity); return st.result();
  }
  function compareStepper(o) {
    var h = hr(o), m0 = baseline(o), mt = m0;
    if (h > 0) { var today = create({ wh: o.wh, seed: o.seed, days: o.days, policy: {}, params: o.params, mode: 'game', offeredHeadroom: h }); run(today, today.end); mt = metrics(today); }
    var pol = create({ wh: o.wh, seed: o.seed, days: o.days, policy: o.policy, params: o.params, mode: 'game', offeredHeadroom: h,
      budget: m0.dayMoving.map(function (v) { return v * (1 + h); }) });
    return { sim: pol, today: mt, base: m0, done: function () { return pol.t >= pol.end - 1e-9; },
      advance: function (min) { run(pol, Math.min(pol.end, pol.t + min)); },
      result: function () { return diff(m0, mt, metrics(pol), h); } };
  }
  function diff(m0, mt, mp, h) {
    var returned = (mt.chargingHours + mt.queueHours + mt.stoppedHours) - (mp.chargingHours + mp.queueHours + mp.stoppedHours);
    var todayVolume = m0.palletMoves, cap = todayVolume * h;
    var extra = Math.max(0, Math.min(mp.palletMoves, todayVolume * (1 + h)) - Math.max(mt.palletMoves, Math.min(todayVolume, mp.palletMoves)));
    return { base: m0, today: mt, policy: mp, robotHoursReturned: returned, extraPalletMoves: extra, todayVolume: todayVolume, cap: cap, headroom: h,
      workRanOut: returned > 1 && (extra >= cap * 0.97 || h === 0 || mp.backlog < 1), palletDelta: mp.palletMoves - mt.palletMoves };
  }

  /* 8.5 calibration check: Today, 20 seeds x 30 days, per warehouse */
  function selfTest(opts) {
    opts = opts || {};
    var seeds = opts.seeds || 20, days = opts.days || 30, out = { pass: true, warehouses: {} };
    ['A', 'B', 'C'].forEach(function (id) {
      var site = W.get(id).siteRow, acc = { mv: 0, ch: 0, em: 0, inc: 0, sched: 0 };
      for (var s = 1; s <= seeds; s++) {
        var S = create({ wh: id, seed: s, days: days, mode: 'game' }); run(S, S.end); var m = metrics(S);
        acc.mv += m.shareMoving; acc.ch += m.shareCharging; acc.em += m.emergencyLowBatteryStops; acc.inc += m.incidents; acc.sched += m.scheduledHours;
      }
      var r = { shareMoving: acc.mv / seeds, shareCharging: acc.ch / seeds, emergency: acc.em / seeds, incidents: acc.inc / seeds, scheduledHours: acc.sched / seeds,
        target: { shareMoving: site.movingShare.v, shareCharging: site.chargingShare.v, emergency: site.lowBatteryStops.v, incidents: site.incidents.v, scheduledHours: site.scheduledHours.v } };
      var emTol = id === 'A' ? 0.25 * r.target.emergency : 3;
      r.checks = {
        shareMoving: Math.abs(r.shareMoving - r.target.shareMoving) <= 0.03,
        shareCharging: Math.abs(r.shareCharging - r.target.shareCharging) <= 0.03,
        emergency: Math.abs(r.emergency - r.target.emergency) <= emTol,
        incidents: Math.abs(r.incidents - r.target.incidents) <= 0.2 * r.target.incidents
      };
      r.pass = r.checks.shareMoving && r.checks.shareCharging && r.checks.emergency && r.checks.incidents;
      if (!r.pass) out.pass = false;
      out.warehouses[id] = r;
    });
    if (typeof console !== 'undefined' && !opts.quiet) console.log('Botsync sim selfTest', JSON.stringify(out));
    return out;
  }

  window.Sim = {
    CAL: CAL, DRIVE_PX_PER_MIN: DRIVE_PX_PER_MIN, create: create, step: step, run: run, metrics: metrics, compare: compare, compareStepper: compareStepper,
    selfTest: selfTest, onShift: onShift, openIncident: openIncident, clearIncident: clearIncident, drawDowntime: drawDowntime, lognormal: lognormal,
    category: category, stream: stream, pickWeighted: pickWeighted, goCharge: goCharge, setPath: setPath, log: log
  };
  window.selfTest = selfTest;
})();
