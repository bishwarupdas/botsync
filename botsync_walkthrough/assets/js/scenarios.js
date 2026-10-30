/* scenarios.js: the scripted use cases U1 to U10 (section 9) and the scripted text for any incident.
   Every model output here is fixed text: a scripted example, not a model call. No randomness in the wording. */
(function () {
  'use strict';
  var D = window.BOTSYNC_DATA, SRC = D.SRC;

  /* VLM labels and boxes for each camera scene (scripted examples; labels follow tab incident_evidence) */
  var VLM = {
    fallen_box: { label: 'unmapped_obstacle', conf: 0.88, box: [36, 120, 72, 66], note: 'Small object, lane partly clear.' },
    spilled_pallet: { label: 'damaged_pallet', conf: 0.81, box: [96, 100, 128, 94], note: 'Blocks the full aisle width.' },
    soft_curtain: { label: 'soft_curtain', conf: 0.74, box: [116, 80, 88, 92], note: 'A known cause of false blocks.' },
    glare: { label: 'glare', conf: 0.78, box: [64, 92, 196, 106], note: 'Advisory: it has confused glare with a dirty sensor 39% of the time.' },
    dirty_lens: { label: 'dirty_sensor', conf: 0.62, box: [4, 128, 120, 70], note: 'Low confidence: glare and a dirty sensor look alike to this model. A person decides.' },
    wrapped_pocket: { label: 'wrapped_pallet', conf: 0.79, box: [94, 152, 132, 32], note: 'Wrap over the fork pockets.' },
    skewed_pallet: { label: 'skewed_pallet', conf: 0.79, box: [88, 88, 144, 106], note: 'Pallet turned on the floor.' },
    damaged_pallet: { label: 'damaged_pallet', conf: 0.81, box: [186, 96, 42, 42], note: 'Corner missing.' },
    person_in_field: { label: 'person', conf: 0.93, box: [204, 70, 54, 110], note: 'A person is inside the safety field.' },
    'default': { label: 'nothing_in_view', conf: 0.85, box: [100, 100, 120, 90], note: 'Nothing unusual in front of the robot.' },
    layout: { label: 'layout_change', conf: 0.85, box: [20, 20, 280, 60], note: 'Racks look different from the map.' }
  };

  var ACTIONS = {
    ERR_DOCKING_ALIGNMENT_TIMEOUT: ['clear_costmap', 'backup(1.5 m)', 'rotate(15°)', 'retry_dock'],
    ERR_PALLET_POCKET_NOT_DETECTED: ['backup(0.5 m)', 'rescan_pocket', 'retry_pick'],
    ERR_OBSTACLE_PERSISTENT_BLOCK: ['replan_route(alternate)'],
    ERR_PATH_PLANNING_DEADLOCK: ['wait(20 s)', 'clear_costmap', 'replan_route'],
    ERR_INTERSECTION_GRIDLOCK_TIMEOUT: ['yield_at_intersection', 'replan_route'],
    ERR_LIDAR_DIRT_OBSCURATION: ['navigate_to_service_bay', 'request_operator_wipe_lens', 'resume_mission'],
    ERR_LOCALIZATION_LOST: ['stop', 'relocalize_at_marker', 'resume_mission'],
    ERR_WMS_HANDSHAKE_TIMEOUT: ['retry_wms_handshake', 'resume_mission']
  };
  var ATTEMPTS = {
    ERR_DOCKING_ALIGNMENT_TIMEOUT: 'retry_with_adjusted_pose (failed), restart_nav_stack (failed)',
    ERR_PALLET_POCKET_NOT_DETECTED: 'retry_pick (failed), rescan_pocket (failed)',
    ERR_OBSTACLE_PERSISTENT_BLOCK: 'wait_and_retry (failed), replan_route (no route found)',
    ERR_LIDAR_DIRT_OBSCURATION: 'none: hard stop, not auto-recoverable',
    ERR_SAFETY_LIDAR_ESTOP: 'none: manual reset needed',
    ERR_BATTERY_LOW_CRITICAL: 'none: battery below 10% before reaching a charger'
  };
  var CAUSE_TEXT = {
    ERR_DOCKING_ALIGNMENT_TIMEOUT: 'Likely glare at an afternoon dock door, or a skewed or damaged pallet. Evidence: station glare flag, time of day, similar stops this week. Docking timeouts at glare sites cluster 14:00 to 17:00 (Planted_patterns tab).',
    ERR_BATTERY_LOW_CRITICAL: 'Likely a weak pack or a charge that came too late. Low-battery stops are concentrated in weak packs: 2.70 vs 0.59 stops per robot (Analysis 5).',
    ERR_LIDAR_DIRT_OBSCURATION: 'Likely dust on the lidar window. Repeated on the same robot points to the cleaning schedule.',
    ERR_SAFETY_LIDAR_ESTOP: 'A person or a forklift entered the safety field. A site-process matter, outside every software level.',
    ERR_OBSTACLE_PERSISTENT_BLOCK: 'Likely an unmapped object or a soft curtain in the path.'
  };

  function codeInfo(code) { return D.errorCodes[code] || { cause: 'not in the error_codes tab', severity: 'soft stop' }; }
  function sceneFor(inc, S) {
    if (inc.scene) return inc.scene;
    var st = inc.station && S.wh.station(inc.station);
    switch (inc.code) {
      case 'ERR_DOCKING_ALIGNMENT_TIMEOUT': return st && st.glare && UI.glareOn(S) ? 'glare' : 'skewed_pallet';
      case 'ERR_PALLET_POCKET_NOT_DETECTED': return 'wrapped_pocket';
      case 'ERR_OBSTACLE_PERSISTENT_BLOCK': return 'fallen_box';
      case 'ERR_LIDAR_DIRT_OBSCURATION': return 'dirty_lens';
      case 'ERR_SAFETY_LIDAR_ESTOP': return 'person_in_field';
      case 'ERR_FORK_LIMIT_SWITCH_FAULT': return 'damaged_pallet';
      case 'ERR_LOCALIZATION_LOST': return 'layout';
      default: return 'default';
    }
  }
  function incidentInfo(inc, S, r) {
    var scene = sceneFor(inc, S), vlm = VLM[scene] || VLM['default'], drawScene = (scene === 'layout' ? 'default' : scene);
    var st = inc.station && S.wh.station(inc.station), ci = codeInfo(inc.code);
    return {
      scene: drawScene, sceneLabel: scene.replace(/_/g, ' '), vlm: vlm,
      logs: [
        'Meaning (error_codes tab): ' + UI.esc(ci.cause) + '.',
        'Last recovery attempts <span class="tag scripted">scripted example</span>: ' + UI.esc(ATTEMPTS[inc.code] || 'standard recovery tried once (failed)') + '.',
        'Station: ' + UI.esc(inc.station || 'in the aisle') + (st ? ' (' + st.type.replace('_', ' ') + ')' : '') + ' · glare flag: ' + (st && st.glare ? 'Y' : 'N') + '.'
      ],
      triage: UI.esc(CAUSE_TEXT[inc.code] || 'Cause unconfirmed. ' + ci.cause + '.') + ' 54% of incidents in the data have no confirmed cause (Analysis 1), so this is a suggestion for an engineer to confirm, not a finding.'
    };
  }

  /* ---------- helpers for map actions ---------- */
  function S() { return window.App.live; }
  function robot(n) { return S().robots[n - 1]; }
  function placeRobot(r, node) {
    var s = S(), nd = s.wh.nodes[node];
    if (r.chargerIdx >= 0) { s.chargers[r.chargerIdx] = null; r.chargerIdx = -1; }
    if (r.packId >= 0) { s.packs[r.packId].reserved = false; r.packId = -1; }
    s.chargeQueue = s.chargeQueue.filter(function (i) { return i !== r.i; }); s.swapQueue = s.swapQueue.filter(function (i) { return i !== r.i; });
    if (r.corridor) { var k = r.corridor.users.indexOf(r.i); if (k >= 0) r.corridor.users.splice(k, 1); r.corridor = null; }
    r.node = node; r.x = nd.x; r.y = nd.y; r.path = null; r.mission = null; r.carrying = false; r.dwell = false; r.state = 'idle'; r.incident = null; r.hold = true; r.wait = 0; r.waitPerson = false;
    if (window.UI && UI.Pipeline) { /* reset display position */ }
  }
  function setClock(min) { var s = S(); s.t = Math.floor(s.t / 1440) * 1440 + min; }
  function stop(r, code, extra) {
    var s = S(), inc = { code: code, recov: (extra && extra.recov) || 'operator', down: D.recoveryDist[(extra && extra.recov) || 'operator'].median.v, uAgent: 1, uGate: 1, uConfirm: 1, uTriage: 1, holdForUser: true, scripted: true };
    for (var k in extra) inc[k] = extra[k];
    window.Sim.openIncident(s, r, inc, 'idle');
    return inc;
  }
  function pathPts(path) { var wh = S().wh; return path.map(function (n) { return [wh.nodes[n].x, wh.nodes[n].y]; }); }
  function altPath(from, to, blocked) {
    var wh = S().wh, N = wh.nodes.length, dist = [], prev = [], done = [];
    for (var i = 0; i < N; i++) { dist.push(Infinity); prev.push(-1); done.push(false); }
    dist[from] = 0;
    for (var it = 0; it < N; it++) {
      var u = -1, bd = Infinity; for (var j = 0; j < N; j++) if (!done[j] && dist[j] < bd) { bd = dist[j]; u = j; }
      if (u < 0 || u === to) break; done[u] = true;
      wh.adj[u].forEach(function (e) { if (blocked[wh.edgeKey(u, e.to)]) return; var nd = dist[u] + e.len; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; } });
    }
    if (dist[to] === Infinity) return null;
    var p = [to]; while (p[0] !== from) p.unshift(prev[p[0]]); return p;
  }
  function median(type) { return D.recoveryDist[type === 'technician' ? 'tech' : type].median; }
  function today(type, label) { return 'Today: ' + UI.N(median(type), 'f1', { suffix: ' min' }) + ' (median for ' + (label || type) + ' clearance, incidents tab)'; }
  var N = function (o, f, opt) { return UI.N(o, f, opt); };
  var scr = function (v) { return { v: v, src: SRC.scripted }; };
  var ass = function (v) { return { v: v, src: SRC.assumed }; };
  var AUTO = D.recoveryDist.auto.median, WAIT = D.assumed.approvalWaitMin;
  var seven = { v: AUTO.v + WAIT.v, src: SRC.assumed };

  function runtimeGates(over) {
    over = over || {};
    return [
      { check: 'action is on the whitelist', result: over.whitelist || 'PASS', measured: over.whitelistM || 'all on list', threshold: 'whitelist' },
      { check: 'speed at most 0.3 m/s', result: over.speed || 'PASS', measured: over.speedM || '0.3 m/s', threshold: '0.3 m/s' },
      { check: 'collision check clear', result: over.collision || 'PASS', measured: 'clear', threshold: 'clear' },
      { check: 'safety layer untouched', result: over.safety || 'PASS', measured: over.safetyM || 'untouched', threshold: 'untouched' }
    ];
  }
  function json(o) { return JSON.stringify(o, null, 1); }

  /* ---------- the generic Recover flow for any stop (Explore) ---------- */
  function genericRecover(inc, Sx, r) {
    var lvl = D.codeLevel[inc.code], ci = codeInfo(inc.code), info = incidentInfo(inc, Sx, r);
    var record = { code: inc.code, severity: inc.severity, robot: r.label, station: inc.station || 'aisle', glare: info.logs[2].indexOf('glare flag: Y') >= 0 ? 'Y' : 'N', camera: 'front_depth', vlm: info.vlm.label + ' ' + info.vlm.conf.toFixed(2) + ' (advisory)', level: D.levelNames[lvl] || 'unassigned' };
    var diag = { box: 'diagnose', status: 'INFO', 'in': 'incident ' + inc.code + ' on ' + r.label + ', fleet events, evidence frame', out: json(record) };
    var todayType = inc.recov === 'tech' ? 'tech' : inc.recov;
    if (lvl === '1' && ACTIONS[inc.code]) {
      return {
        title: 'Recover ' + r.label, layout: 'fix',
        steps: [diag,
          { box: 'propose', status: 'PASS', 'in': 'fault record + allowed actions: ' + ACTIONS[inc.code].join(', ') + ', wait, call_operator', out: 'proposal: ' + ACTIONS[inc.code].join(' -> ') + '\nschema check: PASS' },
          { box: 'check', status: 'PASS', 'in': 'proposed actions', out: 'PASS: all four runtime checks passed', gates: runtimeGates(), gatesTitle: 'Gate 1, runtime checks' },
          { box: 'execute', status: 'PASS', 'in': 'approved actions', out: r.label + ' carries out ' + ACTIONS[inc.code].join(', ') + '. The safety layer stays outside the envelope.', onEnter: function () { UI.executeRecovery(r, AUTO.v, 'agent'); } },
          { box: 'log', status: 'INFO', 'in': 'outcome', out: 'recovery_attempts: ' + inc.code + ', agent path, success. Label stored for the evaluation set.' }],
        result: { key: 'recovered', cls: 'ok', html: '<strong class="state-ok">PASS. Recovered.</strong> Agent path ' + N(AUTO, 'f1', { suffix: ' min' }) + ' (auto median, incidents tab) vs ' + today(todayType) + '. Illustrative. Human clicks: 0.' }
      };
    }
    if (lvl === 'safety') return u9Spec(r, true);
    var who = lvl === 'hardware' ? 'tech' : 'operator', whoName = lvl === 'hardware' ? 'a technician' : 'an operator';
    var alt = lvl === 'hardware' ? 'Open a technician ticket with the evidence and the cause; park the robot.' : inc.code === 'ERR_BATTERY_LOW_CRITICAL' ? 'An operator moves the robot to a charger. Nothing on the whitelist can charge a flat pack.' : 'An operator or site engineer fixes the site configuration; the change itself is level-2 offline work.';
    return {
      title: 'Recover ' + r.label, layout: 'fix',
      steps: [diag,
        { box: 'propose', status: 'PASS', 'in': 'fault record + allowed actions', out: 'proposal: call_' + (lvl === 'hardware' ? 'technician' : 'operator') + '\nreason: no action on the whitelist can fix ' + inc.code + ' (' + (D.levelNames[lvl] || lvl) + ')' },
        { box: 'check', status: 'FAIL', 'in': 'proposal', out: 'FAIL: no runtime action can clear this code; a person is needed', gates: runtimeGates({ whitelist: 'FAIL', whitelistM: 'no runtime action' }), gatesTitle: 'Gate 1, runtime checks' },
        { box: 'person', status: 'WAITING', 'in': 'failed proposal, evidence, a ready alternative', out: 'waiting for one click',
          approval: { key: 'generic', failed: 'No action on the whitelist can clear ' + inc.code + '.', rule: 'allowlist_scope_check', why: ci.cause + '. ' + (lvl === 'hardware' ? 'Hardware wear needs a technician (Analysis 9).' : 'This is level-2 work: a parameter or site change made offline, not at runtime.'),
            proposal: 'call_' + (lvl === 'hardware' ? 'technician' : 'operator') + '()', alternative: alt, approveLabel: 'Approve: send ' + whoName },
          branch: {
            approve: [{ box: 'execute', status: 'PASS', 'in': 'approved', out: whoName + ' is on the way; the robot waits (amber) until the work is done.', onEnter: function () { r.waitPerson = true; r.state = 'stopped'; inc.handledBy = who; r.timer = window.Sim.drawDowntime(window.Draw.mulberry32(r.i + 99), who); } },
              { box: 'log', status: 'INFO', 'in': 'outcome', out: 'intervention logged with who, when and the cause. Label stored for the evaluation set.' }],
            reject: [{ box: 'log', status: 'INFO', 'in': 'rejected', out: 'blocked: the robot stays stopped until someone acts. Logged.' }]
          } }],
      result: function (ctrl) { var rej = ctrl.decisions[0] === 'reject'; return { key: rej ? 'blocked' : 'person', cls: rej ? 'refused' : '', html: rej ? '<strong class="state-stopped">Blocked.</strong> Nothing was sent.' : 'A person does the fix. ' + today(who === 'tech' ? 'tech' : 'operator', who === 'tech' ? 'technician' : 'operator') + '. The model only sequenced the work.' }; }
    };
  }

  /* ---------- U9 shared with the generic flow and voice phrase 3 ---------- */
  function u9Spec(r, generic) {
    var ch = D.changes['CHG-013'];
    var before = null;
    return {
      title: 'U9: safety stop, the model is refused', layout: 'fix',
      steps: [
        { box: 'diagnose', status: 'INFO', 'in': 'incident ERR_SAFETY_LIDAR_ESTOP on ' + r.label, out: json({ code: 'ERR_SAFETY_LIDAR_ESTOP', severity: 'hard stop', cause: 'Person or forklift in safety field; manual reset needed', robot: r.label }) },
        { box: 'propose', status: 'PASS', 'in': 'fault record + allowed actions', out: 'proposal (CHG-013): typed edit ' + ch.target + ', ' + ch.lines.v + ' lines: shrink the protective field radius\nschema check: PASS' },
        { box: 'check', status: 'FAIL', 'in': 'typed edit to protective_field_radius', out: 'FAIL: safety layer is never-edit', gatesTitle: 'Gate 1',
          gates: [{ check: 'allowlist_scope_check', result: 'FAIL', measured: '1 target outside', threshold: '0' }, { check: 'typed_edit_schema', result: 'PASS', measured: '0', threshold: '0' }, { check: 'parameter_range_bounds', result: 'PASS', measured: '0', threshold: '0' }, { check: 'safety_layer_untouched', result: 'FAIL', measured: '1 safety file', threshold: '0' }] },
        { box: 'person', status: 'WAITING', 'in': 'refused proposal', out: 'refused: the only path is a person at the robot',
          approval: { key: 'safety', failed: 'The edit reaches the safety layer, which is never editable by a model.', rule: 'safety_layer_untouched', why: 'Only a person at the robot can confirm the area is clear. No software path exists, at any level.',
            proposal: 'set protective_field_radius := smaller value (CHG-013)', offending: 'protective_field_radius', alternative: 'None in software. A person at the robot confirms the area is clear and resets it.', noAlternative: true, rejectLabel: 'Close: refused' },
          branch: { reject: [{ box: 'log', status: 'INFO', 'in': 'refused', out: 'change_requests: CHG-013 rejected, blocked. Nothing changed on the robot.' }] } }
      ],
      result: { key: 'refused', cls: 'refused', html: '<strong class="state-stopped" data-outcome="refused">Refused.</strong> The only path is a person at the robot who confirms the area is clear and resets it. Fleet-wide: ' + N(D.topCodes[3].incidents, 'int') + ' incidents and ' + N(D.topCodes[3].downtimeH, 'f1', { suffix: ' hours' }) + ' (Analysis 2, 9): a site-process matter, outside every software level.' }
    };
  }

  /* =================== the scenarios =================== */
  var SC = {};
  function def(o) { SC[o.id] = o; }

  def({ id: 'U1', short: 'U1 Docking at a glare door', title: 'U1: Docking timeout at a glare door (level 1)', wh: 'C',
    shows: 'A level-1 stop the recovery agent clears in minutes, behind a deterministic check.',
    variants: [{ id: 'pass', label: 'Check passes' }, { id: 'fail', label: 'Make the check fail' }],
    setup: function () { setClock(15 * 60 + 42); var r = robot(7), st = S().wh.station('Bay 2'); placeRobot(r, st.node); stop(r, 'ERR_DOCKING_ALIGNMENT_TIMEOUT', { station: 'Bay 2', scene: 'glare' }); return r; },
    spec: function (r, v) {
      var rec = { code: 'ERR_DOCKING_ALIGNMENT_TIMEOUT', severity: 'soft stop', robot: 'Bot 7', station: 'Bay 2 (dock door)', glare: 'Y', camera: 'front_depth', time: '15:42', last_attempts: ['retry_with_adjusted_pose: failed', 'restart_nav_stack: failed'] };
      var steps = [
        { box: 'diagnose', status: 'INFO', 'in': 'incident on Bot 7 at Bay 2, fleet events, front_depth frame', out: json(rec) },
        { box: 'propose', status: 'PASS', 'in': 'fault record + VLM label glare (0.78, advisory) + allowed actions', out: v === 'fail' ? 'proposal: clear_costmap -> backup(1.5 m) at 0.6 m/s -> rotate(15°) -> retry_dock\nschema check: PASS' : 'proposal: clear_costmap -> backup(1.5 m) -> rotate(15°) -> retry_dock\nschema check: PASS' }
      ];
      if (v !== 'fail') {
        steps.push({ box: 'check', status: 'PASS', 'in': 'proposed actions', out: 'PASS: actions on whitelist; speed <= 0.3 m/s; collision check clear; safety layer untouched', gates: runtimeGates(), gatesTitle: 'Gate 1, runtime checks' },
          { box: 'execute', status: 'PASS', 'in': 'approved actions', out: 'Bot 7 backs up 1.5 m at 0.3 m/s, turns 15°, docks at Bay 2.', onEnter: function () { UI.executeRecovery(r, AUTO.v, 'agent'); } },
          { box: 'log', status: 'INFO', 'in': 'outcome', out: 'recovery_attempts: agent path, success, 4 min. Label "glare" stored for the evaluation set.' });
        return { title: 'U1 pipeline', layout: 'fix', steps: steps,
          result: { key: 'U1-pass', cls: 'ok', html: '<strong class="state-ok">PASS.</strong> Cleared in ' + N(AUTO, 'f1', { suffix: ' min' }) + ' (agent path, auto median) vs ' + N(median('operator'), 'f1', { suffix: ' min' }) + ' (operator median today, incidents tab). Illustrative. Human clicks: 0.' } };
      }
      steps.push({ box: 'check', status: 'FAIL', 'in': 'proposed actions', out: 'FAIL: speed 0.6 m/s is above the 0.3 m/s limit\nfallback: standard recovery restart_nav_stack -> failed; help call raised', gates: runtimeGates({ speed: 'FAIL', speedM: '0.6 m/s' }), gatesTitle: 'Gate 1, runtime checks' },
        { box: 'person', status: 'WAITING', 'in': 'failed proposal, evidence, a ready alternative', out: 'one screen; waiting for one click',
          approval: { key: 'U1', failed: 'speed 0.6 m/s is above the 0.3 m/s limit', rule: 'runtime speed limit (speed at most 0.3 m/s)', why: 'A recovery move faster than the limit could hit a person or rack before the safety layer reacts. The standard recovery (restart_nav_stack) already failed.',
            proposal: 'clear_costmap; backup(1.5 m) at 0.6 m/s; rotate(15°); retry_dock', offending: '0.6 m/s', alternative: 'clear_costmap; backup(1.5 m) at 0.3 m/s; rotate(15°); retry_dock', altValue: 0.3,
            edit: { type: 'number', label: 'backup speed', unit: 'm/s', min: 0, max: 0.3, exclusiveMin: true, step: 0.05, value: 0.3, rangeText: 'range: above 0 and at most 0.3 m/s' } },
          branch: {
            approve: [{ box: 'execute', status: 'PASS', 'in': 'corrected proposal (0.3 m/s)', out: 'Bot 7 backs up at 0.3 m/s, turns, docks.', onEnter: function () { UI.executeRecovery(r, AUTO.v, 'agent+click'); } }, { box: 'log', status: 'INFO', 'in': 'outcome', out: 'recovery_attempts: approved after one click, 7 min. The failed proposal and the fix are stored as a label.' }],
            reject: [{ box: 'log', status: 'INFO', 'in': 'rejected', out: 'help call: the operator walks up (today\'s path).', onEnter: function () { r.waitPerson = true; r.incident.handledBy = 'operator'; r.timer = median('operator').v; } }]
          } });
      return { title: 'U1 pipeline (check fails)', layout: 'fix', steps: steps,
        result: function (ctrl) {
          if (ctrl.decisions[0] === 'reject') return { key: 'U1-fail-operator', cls: '', html: '<strong class="state-stopped">FAIL</strong>, operator called: ' + N(median('operator'), 'f1', { suffix: ' min' }) + ' (operator median). Illustrative.' };
          return { key: 'U1-fail-approved', cls: 'ok', html: '<strong>FAIL, then one-click approval:</strong> ' + N(seven, 'f0', { suffix: ' min' }) + ' (' + N(AUTO, 'f0', { noTag: true }) + ' min agent + ' + N(WAIT, 'f0', { suffix: ' min', noTag: true }) + ' wait for a person' + UI.tag('assumed') + ') with 1 human click, vs ' + N(median('operator'), 'f1', { suffix: ' min' }) + ' if the operator is called. Illustrative.' };
        } };
    } });

  def({ id: 'U2', short: 'U2 Something in front', title: 'U2: Something in front of the robot (the VLM names it)', wh: 'A',
    shows: 'The vision model names what blocks the robot, and the action depends on what it is. The model never overrides the safety layer.',
    variants: [{ id: 'box', label: 'Fallen cardboard box' }, { id: 'spill', label: 'Spilled pallet' }, { id: 'curtain', label: 'Soft curtain' }],
    setup: function (v) {
      var s = S(), wh = s.wh, a = wh.station('Bay 4'), b = wh.station('Bay 7'), p = wh.path(a.node, b.node);
      var r = robot(3); placeRobot(r, p[1]);
      var n1 = wh.nodes[p[1]], n2 = wh.nodes[p[2]];
      window.App.overlays.objects = [{ kind: v === 'spill' ? 'spill' : v === 'curtain' ? 'curtain' : 'box', x: n1.x + (n2.x - n1.x) * 0.45, y: n1.y + (n2.y - n1.y) * 0.45, angle: Math.atan2(n2.y - n1.y, n2.x - n1.x) + Math.PI / 2 }];
      r.angle = Math.atan2(n2.y - n1.y, n2.x - n1.x);
      this.ctx = { path: p, blocked: wh.edgeKey(p[1], p[2]), target: b.node };
      stop(r, 'ERR_OBSTACLE_PERSISTENT_BLOCK', { station: 'aisle between Bay 4 and Bay 7', scene: v === 'spill' ? 'spilled_pallet' : v === 'curtain' ? 'soft_curtain' : 'fallen_box' });
      return r;
    },
    spec: function (r, v) {
      var self = this, scene = v === 'spill' ? 'spilled_pallet' : v === 'curtain' ? 'soft_curtain' : 'fallen_box', vlm = VLM[scene];
      var diag = { box: 'diagnose', status: 'INFO', 'in': 'incident on Bot 3 between Bay 4 and Bay 7, front camera frame', out: json({ code: 'ERR_OBSTACLE_PERSISTENT_BLOCK', severity: 'soft stop', robot: 'Bot 3', where: 'aisle between Bay 4 and Bay 7', vlm: vlm.label + ' ' + vlm.conf.toFixed(2) + ' (advisory)' }) };
      var blocked = {}; blocked[self.ctx.blocked] = true;
      if (v === 'box') {
        var alt = altPath(r.node, self.ctx.target, blocked);
        return { title: 'U2 pipeline: fallen box', layout: 'fix', steps: [diag,
          { box: 'propose', status: 'PASS', 'in': 'fault record + VLM label unmapped_obstacle (0.88) + allowed actions', out: 'proposal: replan_route(alternate) around the box; log a pick-up task for a person\nschema check: PASS', onEnter: function () { window.App.overlays.routes = alt ? [pathPts(alt)] : []; } },
          { box: 'check', status: 'PASS', 'in': 'alternate route', out: 'PASS: alternate route clearance >= aisle minimum (2.4 m for A); runtime checks pass', gatesTitle: 'Checks', gates: [{ check: 'alternate route clearance >= aisle minimum', result: 'PASS', measured: '2.4 m aisle, lane clear', threshold: '2.4 m' }].concat(runtimeGates()) },
          { box: 'execute', status: 'PASS', 'in': 'approved route', out: 'Bot 3 drives around on the dashed route.', onEnter: function () { r.incident.handledBy = 'agent'; r.state = 'recovering'; r.timer = 0.2; setTimeout(function () { r.hold = false; }, 50); } },
          { box: 'log', status: 'INFO', 'in': 'outcome', out: 'logged. Task for a person: pick the box up later (no hurry; the lane is passable).' }],
          result: { key: 'U2-box', cls: 'ok', html: '<strong class="state-ok">PASS.</strong> Robot drives around. ' + today('operator') + '; here no person was needed at the robot. Illustrative.' }, onDone: function () { UI.pushLog({ robot: 'Bot 3', code: 'ERR_OBSTACLE_PERSISTENT_BLOCK', outcome: 'replanned around box; person to pick it up later' }); } };
      }
      if (v === 'spill') {
        var others = S().robots.filter(function (o) { return o.i !== r.i && o.state !== 'stopped'; }).slice(0, 2);
        return { title: 'U2 pipeline: spilled pallet', layout: 'fix', steps: [diag,
          { box: 'propose', status: 'PASS', 'in': 'fault record + VLM label damaged_pallet (0.81): blocks the full aisle width', out: 'proposal: hold Bot 3 and call a person; reroute other robots around this aisle\nschema check: PASS' },
          { box: 'check', status: 'PASS', 'in': 'reroute for the other robots', out: 'PASS for the reroute of the others; Bot 3 holds (no route past a full-width spill)', gatesTitle: 'Checks', gates: runtimeGates(),
            onEnter: function () { var rts = []; others.forEach(function (o) { var tgt = S().wh.station('Bay 9').node, ap = altPath(o.node, tgt, blocked); if (ap) rts.push(pathPts(ap)); }); window.App.overlays.routes = rts; r.waitPerson = true; } },
          { box: 'person', status: 'WAITING', 'in': 'the aisle is fully blocked', out: 'a person clears the spill',
            approval: { key: 'U2', failed: 'No route past the spill: the aisle is fully blocked.', rule: 'path clearance >= aisle minimum (2.4 m)', why: 'Driving over a spilled pallet can damage the robot and the load; only a person can clear it.', proposal: 'hold(Bot 3); reroute(others, avoid aisle)', alternative: 'Keep Bot 3 holding, keep the others rerouted, send a person to clear the spill.', approveLabel: 'Approve: send a person' },
            branch: { approve: [{ box: 'execute', status: 'PASS', 'in': 'approved', out: 'operator walks up and clears the spill; Bot 3 resumes after.', onEnter: function () { r.incident.handledBy = 'operator'; r.timer = median('operator').v; r.hold = false; } }, { box: 'log', status: 'INFO', 'in': 'outcome', out: 'operator walk-up logged; label stored.' }],
              reject: [{ box: 'log', status: 'INFO', 'in': 'rejected', out: 'blocked: Bot 3 stays stopped.' }] } }],
          result: function (ctrl) { return { key: ctrl.decisions[0] === 'reject' ? 'U2-spill-blocked' : 'U2-spill', cls: '', html: 'A person clears it (operator walk-up counted). ' + today('operator') + '. The other robots keep working on the rerouted paths.' }; } };
      }
      return { title: 'U2 pipeline: soft curtain', layout: 'fix', steps: [diag,
        { box: 'propose', status: 'PASS', 'in': 'fault record + VLM label soft_curtain (0.74)', out: 'proposal: wait(10 s) [scripted wait length], then replan_route and pass through the curtain strips\nschema check: PASS' },
        { box: 'check', status: 'PASS', 'in': 'proposal', out: 'PASS: runtime checks pass', gates: runtimeGates(), gatesTitle: 'Gate 1, runtime checks' },
        { box: 'execute', status: 'PASS', 'in': 'approved', out: 'Bot 3 waits briefly, then proceeds.', onEnter: function () { r.incident.handledBy = 'agent'; r.state = 'recovering'; r.timer = 0.3; setTimeout(function () { r.hold = false; }, 50); } },
        { box: 'log', status: 'INFO', 'in': 'outcome', out: 'logged: soft curtain, false block. Label stored.' }],
        result: { key: 'U2-curtain', cls: 'ok', html: '<strong class="state-ok">PASS.</strong> Robot proceeds. The wait length is a scripted example ' + UI.tag('scripted') + '. ' + today('operator') + '. Illustrative.' } };
    },
    body: function (r, v) { return '<p class="small">The model never overrides the safety layer.</p>'; }
  });

  def({ id: 'U3', short: 'U3 Dirty lidar window', title: 'U3: Dirty lidar window (a person is needed)', wh: 'C',
    shows: 'The model sequences the work; a person still decides the label and does the physical task.',
    setup: function () { var r = robot(11); placeRobot(r, S().wh.stations[12].node); stop(r, 'ERR_LIDAR_DIRT_OBSCURATION', { scene: 'dirty_lens', station: S().wh.stations[12].name }); return r; },
    spec: function (r) {
      var wh = S().wh;
      return { title: 'U3 pipeline', layout: 'fix', steps: [
        { box: 'diagnose', status: 'INFO', 'in': 'incident on Bot 11, front camera frame', out: json({ code: 'ERR_LIDAR_DIRT_OBSCURATION', severity: 'hard stop (not auto-recoverable)', robot: 'Bot 11', vlm: 'dirty_sensor 0.62 (below the 0.70 advisory threshold)' }) },
        { box: 'person', status: 'WAITING', 'in': 'low-confidence label', out: 'a person decides the label',
          approval: { key: 'U3', failed: 'VLM confidence 0.62 is below the 0.70 advisory threshold.', rule: 'vlm advisory threshold 0.70 (assumed)', why: 'Low confidence: glare and a dirty sensor look alike to this model (glare labelled dirty_sensor 39% of the time, Planted_patterns tab). A person decides.',
            proposal: 'label := dirty_sensor (0.62)', offending: '0.62', alternative: 'label := dirty_sensor, confirmed by a person', altValue: 'dirty_sensor', approveLabel: 'Confirm "dirty"',
            edit: { type: 'choice', label: 'label', choices: ['dirty_sensor', 'glare'], rangeText: 'allowed labels: dirty_sensor, glare' } },
          branch: {
            approve: u3Rest(r, wh), edit: u3Rest(r, wh),
            reject: [{ box: 'log', status: 'INFO', 'in': 'no label', out: 'blocked: the robot waits for an operator.' }]
          } }],
        result: function (ctrl) {
          if (ctrl.decisions[0] === 'reject') return { key: 'U3-blocked', cls: 'refused', html: 'Blocked; an operator walks up.' };
          return { key: 'U3-done', cls: 'ok', html: 'The model sequenced the work; a person still did the physical task. Fleet-wide this code costs ' + N(D.topCodes[5].downtimeH, 'f1', { suffix: ' h' }) + ' over ' + N(D.topCodes[5].incidents, 'int') + ' incidents (Analysis 2).<div class="box"><h4>Ticket for the maintenance team ' + UI.tag('scripted') + '</h4><pre>Bot 11, Warehouse C (S20). Cause: dust on the lidar window, confirmed by a person.\nEvidence: front camera frame, VLM dirty_sensor 0.62, person-confirmed.\nDone: lens wiped at the service bay. Check the cleaning schedule for this aisle.</pre></div>' };
        } };
    } });
  function u3Rest(r, wh) {
    return [
      { box: 'propose', status: 'PASS', 'in': 'fault record + confirmed label', out: 'proposal: navigate_to_service_bay -> request_operator_wipe_lens -> resume_mission\nschema check: PASS' },
      { box: 'check', status: 'PASS', 'in': 'proposal', out: 'PASS: navigation at <= 0.3 m/s on a cleared path', gates: runtimeGates(), gatesTitle: 'Gate 1, runtime checks' },
      { box: 'execute', status: 'PASS', 'in': 'approved', out: 'Bot 11 drives to the service bay; an operator wipes the lens; Bot 11 resumes.', onEnter: function () {
        var s = S(), inc = r.incident; r.incident = null; r.state = 'toService'; window.Sim.setPath(s, r, wh.serviceBay.node);
        window.App.overlays.objects = [{ kind: 'operator', x: wh.serviceBay.x - 6, y: wh.serviceBay.y - 2 }];
        var t0 = setInterval(function () { if (r.state === 'stopped' && !r.incident) { clearInterval(t0); setTimeout(function () { window.App.overlays.objects = []; r.state = 'idle'; r.hold = false; UI.pushLog({ robot: 'Bot 11', code: 'ERR_LIDAR_DIRT_OBSCURATION', outcome: 'lens wiped at the service bay; resumed' }); }, window.App.reducedMotion ? 300 : 2500); } }, 200);
      } },
      { box: 'log', status: 'INFO', 'in': 'outcome', out: 'ticket created for the maintenance team; the person-confirmed label joins the evaluation set.' }];
  }

  def({ id: 'U4', short: 'U4 Offline change', title: 'U4: Offline change to a parameter or tree (level 2)', wh: 'C',
    shows: 'Changes go through Gate 1 and Gate 2 offline. The gates block what should not ship.',
    variants: [{ id: 'pass', label: 'Passing change (glare doors)' }, { id: 'g1', label: 'Blocked at Gate 1: charge threshold' }, { id: 'g2', label: 'Blocked at Gate 2: node code' }],
    setup: function () { return null; },
    spec: function (r, v) {
      var G1 = D.gates.gate1, G2 = D.gates.gate2;
      function g1rows(fail) { return G1.map(function (g) { var f = fail && fail.indexOf(g) >= 0; return { check: g, result: f ? 'FAIL' : 'PASS', measured: f ? '1' : '0', threshold: '0' }; }); }
      function g2rows(vals, failName) { return G2.map(function (g) { return { check: g.name, result: g.name === failName ? 'FAIL' : 'PASS', measured: (vals[g.name].v > 0 && g.name === 'replay_regression' ? '+' : '') + vals[g.name].v, threshold: (g.op === '>=' ? '>= ' : '<= ') + g.threshold.v }; }); }
      if (v === 'pass' || !v) {
        var c1 = D.changes['CHG-001'];
        return { title: 'U4: passing change (CHG-001)', layout: 'change', steps: [
          { box: 'diagnose', status: 'INFO', 'in': 'repeat incidents', out: 'trigger pattern: ' + c1.pattern + ' (' + c1.incidents.v + ' incidents in the pattern)' },
          { box: 'propose', status: 'PASS', 'in': 'pattern + editable allowlist', out: 'typed edit: ' + c1.target + ', ' + c1.lines.v + ' lines' },
          { box: 'gate1', status: 'PASS', 'in': 'typed edit', out: 'Gate 1 PASS', gates: g1rows(), gatesTitle: 'Gate 1' },
          { box: 'gate2', status: 'PASS', 'in': 'typed edit', out: 'Gate 2 PASS', gates: g2rows(c1.gate2), gatesTitle: 'Gate 2 (offline)' },
          { box: 'release', status: 'PASS', 'in': 'passed both gates', out: 'canary at site ' + c1.canary + ' -> released' },
          { box: 'log', status: 'INFO', 'in': 'outcome', out: 'post-release incidents ' + c1.delta.v + '% (scripted scenario, not measured)' }],
          result: { key: 'U4-pass', cls: 'ok', html: '<strong class="state-ok">PASS, released.</strong> Canary at ' + c1.canary + ', then released. Post-release incidents ' + N(c1.delta, 'raw', { suffix: '%' }) + ' ' + UI.tag('scenario') + '.' } };
      }
      if (v === 'g1') {
        var c9 = D.changes['CHG-009'];
        return { title: 'U4: blocked at Gate 1 (CHG-009)', layout: 'change', steps: [
          { box: 'diagnose', status: 'INFO', 'in': 'repeat incidents', out: 'trigger pattern: ' + c9.pattern + ' (' + c9.incidents.v + ' incidents in the pattern)' },
          { box: 'propose', status: 'PASS', 'in': 'pattern + editable allowlist', out: 'typed edit: ' + c9.target + ', ' + c9.lines.v + ' lines' },
          { box: 'gate1', status: 'FAIL', 'in': 'typed edit', out: 'Gate 1 FAIL: allowlist_scope_check: ' + c9.reason + '. Nothing deploys.', gates: g1rows(['allowlist_scope_check']), gatesTitle: 'Gate 1' },
          { box: 'person', status: 'WAITING', 'in': 'blocked edit', out: 'one screen',
            approval: { key: 'U4-g1', failed: 'allowlist_scope_check: ' + c9.reason, rule: 'allowlist_scope_check', why: 'The minimum state-of-charge floor protects the pack; a model may not move it.',
              proposal: 'charge_trigger_soc_threshold: 25 -> 20\nmin_soc_safety_floor: 10 -> 5', offending: 'min_soc_safety_floor: 10 -> 5', alternative: 'charge_trigger_soc_threshold: 25 -> 30 (raise the trigger instead of lowering the floor)\nmin_soc_safety_floor: unchanged', altValue: 30,
              edit: { type: 'number', label: 'charge trigger', unit: '%', min: 25, max: 40, step: 1, value: 30, rangeText: 'range 25 to 40 % (scripted example limits); the floor cannot be edited' } },
            branch: { approve: [{ box: 'log', status: 'INFO', 'in': 'alternative', out: 'the alternative goes back through Gate 1 and Gate 2 (not shown). The original edit stays blocked.' }], reject: [{ box: 'log', status: 'INFO', 'in': 'rejected', out: 'blocked. Nothing deploys.' }] } }],
          result: { key: 'U4-g1', cls: 'refused', html: '<strong class="state-stopped">FAIL at Gate 1 (allowlist_scope_check). Nothing deploys.</strong><p class="box"><strong>Software cannot remove the charging loss; it is a rest-deficit problem, which is why battery swapping is the recommendation.</strong></p>' } };
      }
      var c3 = D.changes['CHG-003'];
      return { title: 'U4: blocked at Gate 2 (CHG-003)', layout: 'change', steps: [
        { box: 'diagnose', status: 'INFO', 'in': 'repeat incidents', out: 'trigger pattern: ' + c3.pattern + ' (' + c3.incidents.v + ' incidents)' },
        { box: 'propose', status: 'PASS', 'in': 'pattern', out: 'edit: ' + c3.target + ', ' + c3.lines.v + ' lines (level 3, node code)' },
        { box: 'gate1', status: 'PASS', 'in': 'edit', out: 'Gate 1 PASS', gates: g1rows(), gatesTitle: 'Gate 1' },
        { box: 'gate2', status: 'FAIL', 'in': 'edit', out: 'Gate 2 FAIL: boundary_diff: 1 out-of-envelope diff: touched lift speed limit constant', gates: g2rows(c3.gate2, 'boundary_diff'), gatesTitle: 'Gate 2 (offline)' },
        { box: 'person', status: 'WAITING', 'in': 'failed change', out: 'human review required',
          approval: { key: 'U4-g2', failed: 'boundary_diff: 1 out-of-envelope diff (threshold 0): the change touched the lift speed limit constant.', rule: 'boundary_diff', why: 'Level 3 changes need a person to approve, and nothing may change the motion envelope.',
            proposal: 'pallet_pose_estimator: 142 lines changed\n  ... pose filter changes ...\n  LIFT_SPEED_LIMIT constant touched', offending: 'LIFT_SPEED_LIMIT constant touched', alternative: 'Drop the hunk that touches the lift speed limit constant; re-run Gate 2 before any review.', rejectLabel: 'Reject' },
          branch: { approve: [{ box: 'log', status: 'INFO', 'in': 'alternative', out: 'sent back for a fresh Gate 2 run; nothing deploys until it passes.' }], reject: [{ box: 'log', status: 'INFO', 'in': 'rejected', out: 'human decision: rejected -> blocked.' }] } }],
        result: function (ctrl) { return { key: 'U4-g2', cls: 'refused', html: '<strong class="state-stopped">FAIL at Gate 2 (boundary_diff).</strong> Human review required -> ' + (ctrl.decisions[0] === 'reject' ? 'rejected -> blocked.' : 'sent back; still blocked until a new Gate 2 run passes.') }; } };
    },
    body: function () {
      var c8 = D.changes['CHG-008'];
      return '<div class="box"><h4>Rolled back example (CHG-008) ' + UI.tag('scenario') + '</h4><p>' + UI.esc(c8.target) + ' edit (' + UI.esc(c8.pattern) + ') passed both gates, went to canary at ' + c8.canary + '; incidents rose ' + N(c8.delta, 'raw', { suffix: '%' }) + ' -> rolled back. The canary exists for a reason.</p></div>';
    } });

  def({ id: 'U5', short: 'U5 Typed instruction', title: 'U5: Typed fleet instruction', wh: 'A',
    shows: 'A sentence becomes typed commands; deterministic checks run before any robot moves.',
    variants: [{ id: 'ok', label: 'reroute bot 5 to bay 4 and move everything to bay 6' }, { id: 'b14', label: 'reroute bot 5 to bay 14' }, { id: 'b1', label: 'move everything to bay 1' }],
    setup: function () { window.App.overlays.closed['Bay 1'] = true; return robot(5); },
    body: function (r, v) {
      var txt = { ok: 'reroute bot 5 to bay 4 and move everything to bay 6', b14: 'reroute bot 5 to bay 14', b1: 'move everything to bay 1' }[v || 'ok'];
      return '<label for="instr" class="small">Instruction (the model is scripted; free text is parsed by a fixed rule for this demo)</label><input class="instr" id="instr" value="' + UI.esc(txt) + '"><p class="small">Bay 1 is marked closed for this scenario (scripted state).</p>';
    },
    spec: function (r) {
      var raw = (document.getElementById('instr') || { value: '' }).value.toLowerCase(), wh = S().wh;
      var m1 = raw.match(/bot\s*(\d+)\s*to\s*bay\s*(\d+)/), m2 = raw.match(/(?:everything|all)[^0-9]*bay\s*(\d+)/);
      var cmds = [];
      if (m1) cmds.push({ robot: 'Bot ' + m1[1], action: 'reroute', to: 'Bay ' + m1[2] });
      if (m2) cmds.push({ action: 'redirect_all', from: 'current drop-offs', to: 'Bay ' + m2[1] });
      var problems = [];
      cmds.forEach(function (c) {
        var st = wh.station(c.to), bot = c.robot && S().robots.filter(function (x) { return x.label === c.robot; })[0];
        if (c.robot && !bot) problems.push({ c: c, why: c.robot + ' does not exist at this site', rule: 'robot exists' });
        else if (!st) problems.push({ c: c, why: c.to + ' does not exist at this site (A has ' + wh.stations.length + ' bays)', rule: 'bay exists' });
        else if (window.App.overlays.closed[c.to]) problems.push({ c: c, why: c.to + ' is a dock door that is closed', rule: 'bay is open' });
      });
      var checks = cmds.map(function (c) { var bad = problems.filter(function (p) { return p.c === c; })[0]; return { check: c.to + ' exists and is open', result: bad ? 'FAIL' : 'PASS', measured: bad ? bad.why : 'open', threshold: 'exists, open' }; });
      checks.push({ check: 'no other robot\'s route clashes head-on', result: 'PASS', measured: 'no clash', threshold: 'no clash' });
      function apply(cmdsToApply) {
        var s = S(), routes = [];
        cmdsToApply.forEach(function (c) {
          var st = wh.station(c.to); if (!st) return;
          if (c.robot) { var b = s.robots.filter(function (x) { return x.label === c.robot; })[0]; if (b && b.state !== 'stopped') { b.hold = true; b.mission = { pick: st, drop: st, phase: 'toDrop' }; b.state = 'moving'; window.Sim.setPath(s, b, st.node); routes.push(pathPts(b.path)); } }
          else { s.redirectDrop = c.to; s.robots.forEach(function (o) { if (o.mission && !o.hold) { o.mission.drop = st; if (o.mission.phase === 'toDrop') window.Sim.setPath(s, o, st.node); routes.push(pathPts(wh.path(o.node, st.node))); } }); }
        });
        window.App.overlays.routes = routes;
      }
      if (!cmds.length) {
        return { title: 'U5 pipeline (nothing valid)', layout: 'fix', labels: { diagnose: ['Read the instruction', 'typed by a supervisor'] }, kinds: { diagnose: 'CODE' }, who: { diagnose: 'Plain code takes the supervisor\'s typed text and the current robot states. No model yet.' }, steps: [
          { box: 'diagnose', status: 'INFO', 'in': 'typed instruction', out: '"' + raw + '"' },
          { box: 'propose', status: 'FAIL', 'in': 'instruction + list of allowed commands', out: 'nothing valid: no robot or bay found\nschema check: FAIL -> reject proposal' },
          { box: 'person', status: 'WAITING', 'in': 'rejected proposal', out: 'the supervisor is asked to retype',
            approval: { key: 'U5-invalid', failed: 'The model produced no valid command: no robot or bay in "' + raw + '".', rule: 'typed command schema', why: 'Nothing moves on a guess; a person states what they meant.',
              proposal: raw || '(empty)', alternative: 'Ask the supervisor to retype, for example: "reroute bot 5 to bay 4"', approveLabel: 'Ask to retype' },
            branch: { approve: [{ box: 'log', status: 'INFO', 'in': 'retype requested', out: 'logged; no robot moved' }], reject: [{ box: 'log', status: 'INFO', 'in': 'dropped', out: 'blocked; no robot moved' }] } }],
          result: { key: 'U5-invalid', cls: 'refused', html: '<strong class="state-stopped">Nothing valid.</strong> The schema check rejected the proposal; no robot moved.' } };
      }
      var steps = [
        { box: 'diagnose', status: 'INFO', 'in': 'typed instruction', out: '"' + raw + '"', labelsNote: true },
        { box: 'propose', status: cmds.length ? 'PASS' : 'FAIL', 'in': 'instruction + list of allowed commands', out: cmds.length ? cmds.map(function (c) { return JSON.stringify(c); }).join('\n') + '\nschema check: PASS' : 'nothing valid: no robot or bay found' }
      ];
      if (!problems.length && cmds.length) {
        steps.push({ box: 'check', status: 'PASS', 'in': 'typed commands', out: 'PASS: all checks pass', gates: checks, gatesTitle: 'Deterministic checks' },
          { box: 'execute', status: 'PASS', 'in': 'commands', out: 'robots move: route lines updated on the map', onEnter: function () { apply(cmds); } },
          { box: 'log', status: 'INFO', 'in': 'outcome', out: 'command logged with who, when and the result' });
        return { title: 'U5 pipeline', layout: 'fix', labels: { diagnose: ['Read the instruction', 'typed by a supervisor'] }, kinds: { diagnose: 'CODE' }, who: { diagnose: 'Plain code takes the supervisor\'s typed text and the current robot states. No model yet.' }, steps: steps,
          result: { key: 'U5-ok', cls: 'ok', html: '<strong class="state-ok">PASS.</strong> Instruction applied in one step; checks run before the robots move.' } };
      }
      var p0 = problems[0] || { c: { to: '?' }, why: 'no valid command', rule: 'schema' };
      var isMissing = p0.rule === 'bay exists';
      var approval = isMissing ?
        { key: 'U5', failed: p0.why + '. Nearest open bays: 3, 4, 5, 6.', rule: p0.rule, why: 'A robot sent to a bay that does not exist would stop and wait; the check catches it before anything moves.', proposal: JSON.stringify(p0.c), offending: p0.c.to,
          alternative: JSON.stringify({ robot: p0.c.robot, action: p0.c.action, to: 'Bay 4' }), altValue: 'Bay 4', approveLabel: 'Pick Bay 4', edit: { type: 'choice', label: 'bay', choices: ['Bay 3', 'Bay 4', 'Bay 5', 'Bay 6'], rangeText: 'open bays: 3, 4, 5, 6' } } :
        { key: 'U5', failed: p0.why + '.', rule: p0.rule, why: 'Drop-offs at a closed dock door would pile up with nowhere to go.', proposal: JSON.stringify(p0.c), offending: p0.c.to, alternative: JSON.stringify({ action: 'redirect_all', from: 'current drop-offs', to: 'Bay 6' }), altValue: 'Bay 6', approveLabel: 'Use Bay 6',
          edit: { type: 'choice', label: 'bay', choices: ['Bay 3', 'Bay 4', 'Bay 5', 'Bay 6'], rangeText: 'open bays: 3, 4, 5, 6' } };
      steps.push({ box: 'check', status: 'FAIL', 'in': 'typed commands', out: 'FAIL: ' + p0.why, gates: checks, gatesTitle: 'Deterministic checks' },
        { box: 'person', status: 'WAITING', 'in': 'failed command', out: 'one click picks a bay', approval: approval,
          branch: { approve: function (dec) { return okBranch(dec); }, edit: function (dec) { return okBranch(dec); }, reject: [{ box: 'log', status: 'INFO', 'in': 'rejected', out: 'blocked: no robot moved.' }] } });
      function okBranch(dec) {
        var fixed = cmds.map(function (c) { return c === p0.c ? Object.assign({}, c, { to: dec.value }) : c; }).filter(function (c) { return wh.station(c.to) && !window.App.overlays.closed[c.to]; });
        return [{ box: 'execute', status: 'PASS', 'in': JSON.stringify(fixed), out: 'robots move to ' + dec.value, onEnter: function () { apply(fixed); } }, { box: 'log', status: 'INFO', 'in': 'outcome', out: 'logged; the correction is stored as a label' }];
      }
      return { title: 'U5 pipeline (check fails)', layout: 'fix', labels: { diagnose: ['Read the instruction', 'typed by a supervisor'] }, kinds: { diagnose: 'CODE' }, who: { diagnose: 'Plain code takes the supervisor\'s typed text and the current robot states. No model yet.' }, steps: steps,
        result: function (ctrl) { var rej = ctrl.decisions[0] === 'reject'; return { key: isMissing ? 'U5-b14' : 'U5-b1', cls: rej ? 'refused' : 'ok', html: '<strong class="state-stopped">FAIL:</strong> ' + UI.esc(p0.why) + '. ' + (rej ? 'Blocked; no robot moved.' : 'Fixed with one click; instruction applied; checks ran before the robots moved.') }; } };
    } });

  def({ id: 'U6', short: 'U6 Task planning', title: 'U6: Agentic task planning (a business goal to missions)', wh: 'B',
    shows: 'The model breaks a goal into missions; hard limits are checked; close calls go to a person.',
    variants: [{ id: 'ok', label: 'Plan passes' }, { id: 'tight', label: 'Tight plan' }],
    setup: function () { [12, 14].forEach(function (n) { var r = robot(n); placeRobot(r, S().wh.chargers[n === 12 ? 0 : 1].node); r.state = 'charging'; r.timer = 60; r.chargeFrom = 0.4; r.chargerIdx = n === 12 ? 0 : 1; S().chargers[r.chargerIdx] = r.i; r.hold = false; }); var b7 = robot(7); b7.battery = 0.27; return null; },
    body: function () { return '<p><strong>Goal (illustrative):</strong> "Move 120 inbound pallets from Dock 2 to racks A and B before the 6 pm truck."</p><p class="small"><em>No order or warehouse-system data exists in the dummy set, so this job comes last and is the least certain.</em></p><div id="u6-gantt"></div>'; },
    spec: function (r, v) {
      var tight = v === 'tight';
      function gantt(extra) {
        var rows = [{ robot: 'Bot 1', bars: [{ start: 0, end: 70, label: 'A: 15' }] }, { robot: 'Bot 2', bars: [{ start: 0, end: 70, label: 'A: 15' }] }, { robot: 'Bot 3', bars: [{ start: 5, end: 75, label: 'A: 15' }] }, { robot: 'Bot 4', bars: [{ start: 5, end: 75, label: 'A: 15' }] },
          { robot: 'Bot 5', bars: [{ start: 0, end: 80, label: 'B: 20' }] }, { robot: 'Bot 6', bars: [{ start: 0, end: 80, label: 'B: 20' }] },
          { robot: 'Bot 7', bars: extra ? [{ start: 0, end: 30, label: 'charge' }, { start: 30, end: 115, label: 'B: 20' }] : [{ start: 10, end: tight ? 175 : 95, label: 'B: 20', close: tight }] },
          { robot: 'Bot 12', bars: [{ start: 0, end: 60, label: 'charging' }] }, { robot: 'Bot 14', bars: [{ start: 0, end: 60, label: 'charging' }] }];
        return '<h4>Plan ' + UI.tag('scripted') + '</h4>' + window.Draw.svgGantt(rows, { width: 440, max: 190, deadline: 180, deadlineLabel: '18:00 truck' }) + '<p class="small">Minutes after 15:00 (scripted example).</p>';
      }
      var limits = [{ check: 'each mission has a robot with enough battery', result: tight ? 'WAITING' : 'PASS', measured: tight ? 'Bot 7 below the charge threshold' : 'yes', threshold: 'above trigger' },
        { check: 'no load above 1,400 kg', result: 'PASS', measured: 'max load within rating', threshold: '1,400 kg' }, { check: 'no mission through a closed zone or one with people working', result: 'PASS', measured: 'none', threshold: 'none' },
        { check: 'no two robots in the same aisle at once', result: 'PASS', measured: 'none', threshold: 'none' }, { check: 'plan finishes before the deadline', result: tight ? 'WAITING' : 'PASS', measured: tight ? '5 min to spare' : 'yes', threshold: '18:00' }];
      var steps = [
        { box: 'diagnose', status: 'INFO', 'in': 'business goal', out: 'goal: 120 pallets, Dock 2 -> racks A and B, deadline 18:00' },
        { box: 'propose', status: 'PASS', 'in': 'goal + robots, batteries, charging windows', out: 'plan: two batches of 60 (rack A, rack B), heaviest first\nBot 12 and Bot 14 are charging; Bot 7 is low and gets a charge before its run\nmissions ordered with start times\nschema check: PASS', onEnter: function () { var g = document.getElementById('u6-gantt'); if (g) g.innerHTML = gantt(!tight); } }
      ];
      function startPlan() { var s = S(); s.robots.slice(0, 7).forEach(function (o) { if (o.state === 'idle') o.hold = false; }); s.pending += 12; }
      if (!tight) {
        steps.push({ box: 'check', status: 'PASS', 'in': 'plan', out: 'PASS: all hard limits hold', gates: limits, gatesTitle: 'Hard limits only' },
          { box: 'execute', status: 'PASS', 'in': 'plan', out: 'missions start on the map', onEnter: startPlan },
          { box: 'log', status: 'INFO', 'in': 'outcome', out: 'planned vs actual stored (scripted values)' });
      } else {
        steps.push({ box: 'check', status: 'FAIL', 'in': 'plan', out: 'close to a limit: 5 minutes to spare and Bot 7 below the battery threshold', gates: limits, gatesTitle: 'Hard limits only' },
          { box: 'person', status: 'WAITING', 'in': 'plan close to a limit', out: 'one screen',
            approval: { key: 'U6', failed: 'The plan finishes with 5 minutes to spare and uses Bot 7 below the battery threshold.', rule: 'battery above trigger; finish before deadline', why: 'A late truck or a flat robot mid-batch would miss the deadline.',
              proposal: 'Bot 7: B batch, start 15:10, no charge', offending: 'no charge', alternative: 'Bot 7: charge 30 min first, then B batch; finishes 18:00 - 5 min becomes a margin from the extra slot', altValue: 30,
              edit: { type: 'number', label: 'Bot 7 charge slot', unit: 'min', min: 20, max: 40, step: 5, value: 30, rangeText: 'range 20 to 40 min (scripted example limits)' } },
            onDone: null, branch: {
              approve: [{ box: 'execute', status: 'PASS', 'in': 'revised plan', out: 'missions start with an extra charge slot for Bot 7', onEnter: function () { var g = document.getElementById('u6-gantt'); if (g) g.innerHTML = gantt(true); startPlan(); } }, { box: 'log', status: 'INFO', 'in': 'outcome', out: 'decision and plan stored' }],
              reject: [{ box: 'log', status: 'INFO', 'in': 'rejected', out: 'blocked; the supervisor plans by hand' }] } });
      }
      return { title: 'U6 pipeline', layout: 'fix', labels: { diagnose: ['Goal in', 'business goal, scripted'], check: ['Hard-limit check', 'deterministic'], execute: ['Missions start', 'fleet manager'] }, kinds: { diagnose: 'DATA', propose: 'LLM', check: 'CODE', execute: 'ROBOT' }, who: { diagnose: 'A supervisor\'s business goal plus robot states, batteries and charging windows.', propose: 'A small self-hosted LLM drafts the mission plan.', check: 'Plain rules: battery floors, charger slots, robot limits. No model.', execute: 'The fleet manager starts the missions on the robots.' }, steps: steps,
        result: function (ctrl) {
          var pv = window.Draw.svgComparisonBars([{ a: 175, b: 168, aText: 'planned 175 min', bText: 'actual 168 min', diffText: '' }, { a: 120, b: 120, aText: 'planned 120 pallets', bText: 'actual 120 pallets', diffText: '' }], { width: 420 });
          var rej = ctrl.decisions[0] === 'reject';
          return { key: tight ? (rej ? 'U6-tight-blocked' : 'U6-tight') : 'U6-ok', cls: rej ? 'refused' : 'ok', html: (tight ? '<strong class="state-wait">Close to a limit</strong>: a person approved a revised plan. ' : '<strong class="state-ok">PASS.</strong> ') + 'Planned vs actual ' + UI.tag('scripted') + pv + '<p class="small">These limits can be tuned. No order or warehouse-system data exists in the dummy set, so this job comes last and is the least certain.</p>' };
        } };
    } });

  var TRIAGE = [
    { wh: 'C', robot: 'Bot 7', code: 'ERR_DOCKING_ALIGNMENT_TIMEOUT', cause: 'glare', ev: 'glare flag on Bay 2, time 15:40, 6 similar this week', conf: 0.78 },
    { wh: 'C', robot: 'Bot 11', code: 'ERR_LIDAR_DIRT_OBSCURATION', cause: 'dirty window; check cleaning schedule', ev: 'same robot, third time in 10 days', conf: 0.70 },
    { wh: 'A', robot: 'Bot 2', code: 'ERR_BATTERY_LOW_CRITICAL', cause: 'pack health 78%, replace', ev: 'weak pack, two stops this week', conf: 0.82 },
    { wh: 'A', robot: 'Bot 6', code: 'ERR_PALLET_POCKET_NOT_DETECTED', cause: 'wrapped pallet pocket', ev: 'camera frame shows wrap over pockets', conf: 0.74 },
    { wh: 'B', robot: 'Bot 4', code: 'ERR_FORK_LIMIT_SWITCH_FAULT', cause: 'limit switch wear', ev: 'repeat on same robot, high lift cycles', conf: 0.66 },
    { wh: 'C', robot: 'Bot 3', code: 'ERR_LOCALIZATION_LOST', cause: 'layout change in a rack aisle', ev: 'new racks near Bay 13 this week', conf: 0.71 },
    { wh: 'B', robot: 'Bot 9', code: 'ERR_WMS_HANDSHAKE_TIMEOUT', cause: 'WMS API slow at shift start', ev: '06:02 timestamp, 3 similar at 06:00-06:10', conf: 0.69 },
    { wh: 'A', robot: 'Bot 1', code: 'ERR_PATH_PLANNING_DEADLOCK', cause: 'narrow aisle head-on wait', ev: '2.4 m aisle, two robots in the same aisle', conf: 0.72 },
    { wh: 'C', robot: 'Bot 14', code: 'ERR_DOCKING_ALIGNMENT_TIMEOUT', cause: 'skewed pallet', ev: 'camera frame: pallet turned 15°, morning, no glare', conf: 0.75 },
    { wh: 'B', robot: 'Bot 2', code: 'ERR_SAFETY_LIDAR_ESTOP', cause: 'forklift crossing; site process', ev: 'forklift traffic logged nearby', conf: 0.80 },
    { wh: 'C', robot: 'Bot 9', code: 'ERR_LIFT_MOTOR_OVERCURRENT', cause: 'lift motor wear under heavy loads', ev: 'current rising over two weeks', conf: 0.63 },
    { wh: 'A', robot: 'Bot 8', code: 'ERR_OBSTACLE_PERSISTENT_BLOCK', cause: 'soft curtain at the conveyor', ev: 'same spot, curtain in frame', conf: 0.73 }
  ];
  var CORRECTIONS = ['glare', 'dirty window', 'weak pack', 'damaged pallet', 'layout change', 'site process', 'hardware wear', 'unknown'];
  def({ id: 'U7', short: 'U7 Triage across the fleet', title: 'U7: Root-cause triage across the fleet (reads only)', wh: null,
    shows: 'The model reads incidents and suggests causes; an engineer confirms or corrects each in one click. It only reads, so it carries no risk to the robots.',
    setup: function () { this.state = { done: {} }; return null; },
    body: function () {
      var self = this, rows = TRIAGE.map(function (t, i) {
        return '<tr data-row="' + i + '"><td>' + t.wh + ' ' + t.robot + '</td><td class="mono small">' + t.code + '</td><td>' + UI.esc(t.cause) + '</td><td class="small">' + UI.esc(t.ev) + '</td><td class="n">' + N(scr(t.conf), 'f2') + '</td><td class="tri-act"><button data-tconfirm="' + i + '">Confirm</button> <button data-tcorrect="' + i + '">Correct</button></td></tr>';
      }).join('');
      return '<p>12 incidents arrive marked "no confirmed cause" (the real share is ' + N(D.fleet.incidentsNoConfirmedCause, 'pct0') + ', Analysis 1).</p>' +
        '<div class="box"><strong>Confirmed causes: <span id="u7-pct">' + N({ v: D.assumed.confirmedCauseStart.v, src: SRC.a1 }, 'pct0') + '</span></strong> climbing toward ' + N(D.assumed.confirmedCauseTarget, 'pct0') + ' as you click (start ' + N(D.assumed.confirmedCauseStart, 'pct0') + ' is the complement of the 54%).</div>' +
        '<div id="u7-approval"></div><table class="compact" id="u7-table"><thead><tr><th>where</th><th>code</th><th>likely cause ' + UI.tag('scripted') + '</th><th>evidence used</th><th class="n">conf.</th><th>engineer</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<p>Engineering hours saved: ' + N({ v: D.assumed.triageSaving.v * D.support.noFaultFoundEngHours.v, src: SRC.assumed }, 'f0', { suffix: ' h', noTag: true }) + ' (assumed ' + N(D.assumed.triageSaving, 'pct0', { noTag: true }) + ' of ' + N(D.support.noFaultFoundEngHours, 'int', { suffix: ' h' }) + ')' + UI.tag('assumed') + '.</p>' +
        '<p>No-fault-found: ' + N(D.support.noFaultFoundShare, 'pct2') + ' of tickets (' + N(D.support.noFaultFoundTickets, 'int') + ' of ' + N(D.support.tickets, 'int') + ') used ' + N(D.support.noFaultFoundEngHours, 'int') + ' of ' + N(D.support.engHoursAllTickets, 'f1') + ' engineering hours (Analysis 7).</p>';
    },
    bind: function (root) {
      var self = this;
      function upd() {
        var n = Object.keys(self.state.done).length, a = D.assumed.confirmedCauseStart.v, b = D.assumed.confirmedCauseTarget.v;
        document.getElementById('u7-pct').innerHTML = N({ v: a + (b - a) * n / TRIAGE.length, src: SRC.simulated }, 'pct0');
      }
      root.addEventListener('click', function (e) {
        var c = e.target.closest('[data-tconfirm]'), k = e.target.closest('[data-tcorrect]');
        if (c) { var i = +c.dataset.tconfirm; self.state.done[i] = 'confirmed'; UI.click(1); c.parentNode.innerHTML = '<span class="state-ok">confirmed</span>'; upd(); }
        if (k) {
          var j = +k.dataset.tcorrect, t = TRIAGE[j], cell = k.parentNode, box = document.getElementById('u7-approval');
          cell.innerHTML = '<span class="state-wait">correcting (below)</span>';
          UI.approval(box, { key: 'U7', failed: 'The engineer disagrees with the suggested cause for ' + t.robot + ' (' + t.code + ').', rule: 'engineer confirmation', why: 'Only confirmed causes go into incidents.root_cause_confirmed and the evaluation set.',
            proposal: 'cause := ' + t.cause + ' (' + t.conf.toFixed(2) + ')', offending: t.cause, alternative: 'cause := unknown; keep the incident open for an engineer to look at', altValue: 'unknown', approveLabel: 'Mark as unknown',
            edit: { type: 'choice', label: 'corrected cause', choices: CORRECTIONS, rangeText: 'allowed causes: ' + CORRECTIONS.join(', ') } }, function (dec) {
            if (dec.kind === 'reject') { cell.innerHTML = '<span>left unconfirmed</span>'; return; }
            self.state.done[j] = 'corrected'; cell.innerHTML = '<span>corrected: ' + UI.esc(dec.value) + '</span>'; upd();
          });
          box.scrollIntoView({ block: 'nearest' });
        }
      });
    },
    spec: function () {
      return { title: 'U7 pipeline', layout: 'fix', labels: { execute: ['Nothing executes', 'reads and suggests only'] }, kinds: { execute: '' }, who: { execute: 'Triage only reads logs and suggests a cause. No robot moves.' }, steps: [
        { box: 'diagnose', status: 'INFO', 'in': '12 incidents, no confirmed cause', out: 'fault records with evidence (station flags, timestamps, repeats, pack health)' },
        { box: 'propose', status: 'PASS', 'in': 'records', out: 'a likely cause, the evidence used and a confidence per incident (table below)' },
        { box: 'check', status: 'PASS', 'in': 'suggestions', out: 'PASS: read-only output; schema valid; no action on any robot' },
        { box: 'person', status: 'PASS', 'in': 'suggestions', out: 'an engineer confirms or corrects each row in one click (below)' },
        { box: 'log', status: 'INFO', 'in': 'decisions', out: 'confirmed causes feed incidents.root_cause_confirmed and the evaluation set' }],
        result: { key: 'U7', cls: 'ok', html: 'Triage only reads and suggests: no risk to the robots, and no robot hours. Its benefit is engineering time and confirmed causes.' } };
    } });

  def({ id: 'U8', short: 'U8 Battery swap (the recommendation)', title: 'U8: Battery swap with a person in the loop (the recommendation)', wh: 'A',
    shows: 'Robots at 25% get a charged pack from a person at the swap bay instead of charging for 100 minutes. It works only if a charged pack is waiting.',
    setup: function () {
      window.App.forceSwapBay = true;
      cur.restoreSwap = !window.App.policy.swap;   // leaving U8 puts the switch back the way it was
      if (!window.App.policy.swap) { window.App.policy.swap = true; S().policy.swap = true; UI.syncPacks(); }
      window.App.statsFrom = { t: S().t, cat: JSON.parse(JSON.stringify(S().m.cat)), sched: S().m.sched };
      var low = robot(4); if (low.state === 'idle' || low.state === 'moving') low.battery = Math.min(low.battery, 0.37);
      return null;
    },
    body: function () {
      var c = D.charging, A = D.assumed, P = UI.PDEF;
      return '<div class="box"><h4>Policy</h4><div class="policy-row">' + UI.switchHtml('swap', 'Battery swap (a person swaps in a charged pack, instead of a 100-minute charge)', window.App.policy.swap) + '</div>' +
        UI.sliderHtml('swapTime', P.swapTime, window.App.params.swapTime, 'Swap time', UI.FMT.swapTime) + UI.sliderHtml('spares', P.spares, window.App.params.spares, 'Spare packs per robot', UI.FMT.spares) + UI.sliderHtml('operators', P.operators, window.App.params.operators, 'Operators at the swap bay', UI.FMT.operators) +
        '<h4>Live readout ' + UI.tag('simulated') + '</h4><div data-live="swapReadout">' + UI.swapReadout() + '</div>' +
        '<p class="small">Move the spare-pack slider to 0: robots fall back to the charger and the flat-battery stops return.</p>' +
        '<p class="small">The six-step strip above the map lights each step of a swap as it happens; the total time follows the swap-time slider. Pack weight is not in the data; engineering has to confirm one operator can handle it.</p></div>' +
        '<div class="box"><h4>What the case targets</h4><p>Pilot charging share from about ' + N(A.targetChargingFrom, 'pct0') + ' to under ' + N(A.targetChargingShare, 'pct0') + '; emergency low-battery stops per robot from ' + N(c.byPattern['24x7'].stopsPerRobot, 'f2') + ' to under ' + N(A.targetStopsPerRobot, 'int') + ' (assumed targets).</p>' +
        '<p>Ceiling: about ' + N(c.ceilingIfEveryChargeBecameASwap24x7, 'int') + ' hours a month at the 24x7 sites if every charge became a swap (Analysis 4); a ceiling, not a forecast.</p></div>' +
        '<div class="box"><h4>Static facts (data)</h4><ul><li>24x7 sites charge ' + N(c.byPattern['24x7'].share, 'pct1') + ' of scheduled time vs ' + N(c.byPattern['16x7'].share, 'pct1') + ' at the 16-hour sites.</li><li>' + N(c.aboveThe16HourRate, 'int') + ' hours a month above the 16-hour rate.</li><li>' + N(c.byPattern['24x7'].stopsPerRobot, 'f2') + ' emergency stops per robot vs about ' + N(c.sixteenHourStopsPerRobotAbout, 'f2') + '.</li><li>' + N(c.weakPacks, 'int') + ' weak packs stop ' + N(c.lowBatteryStopsPerRobotWeak, 'f2') + ' vs ' + N(c.lowBatteryStopsPerRobotHealthy, 'f2') + ' per robot (Analysis 5).</li></ul></div>' +
        '<div class="box"><h4>Phase 2</h4><p>Automated swap station: only if the month-4 gate passes (swap time near target, charging share down, no pack damage).</p></div>';
    },
    bind: function (root) { UI.bindPolicy(root); },
    noPipeline: true });

  def({ id: 'U9', short: 'U9 Safety stop (refused)', title: 'U9: Safety stop: the model is refused', wh: 'B',
    shows: 'Safety stops are outside the envelope. The model\'s proposal is refused; only a person at the robot resets it.',
    setup: function () {
      var r = robot(2), wh = S().wh, nd = wh.stations[6].node; placeRobot(r, nd);
      window.App.overlays.objects = [{ kind: 'person', x: wh.nodes[nd].x + 40, y: wh.nodes[nd].y - 2 }]; r.angle = 0;
      stop(r, 'ERR_SAFETY_LIDAR_ESTOP', { scene: 'person_in_field', recov: 'operator' }); return r;
    },
    body: function () { return '<p class="small">Person in the safety field. Only a person at the robot can reset this.</p>'; },
    spec: function (r) { return u9Spec(r); } });

  def({ id: 'U10', short: 'U10 Vision path', title: 'U10: Vision path (VLM) end to end', wh: 'A',
    shows: 'How a frame becomes a label: capture, blur, name, store, confirm, and into the evaluation set.',
    setup: function () { return null; },
    body: function () {
      return '<div class="box"><h4>Three ways to get images</h4><ol><li><strong>Now:</strong> the robot\'s own camera captures a frame at each incident (advisory).</li><li><strong>Later, only at the worst sites:</strong> fixed premises cameras.</li><li><strong>After the server model works:</strong> a tiny model on the robot.</li></ol></div>' +
        '<canvas id="u10-cam" class="cam" width="320" height="200" aria-label="captured frame"></canvas><canvas id="u10-blur" width="260" height="120" aria-label="blur demo"></canvas>' +
        '<p>Model label matches the human label ' + N(D.support.vlmMatch, 'pct0') + ' of the time (Analysis 7). Known weak spot: glare labelled dirty_sensor ' + N(D.planted.glareLabelledDirty, 'pct0') + ' of the time (Planted_patterns tab).</p>';
    },
    spec: function () {
      function cam(showVlm) { var c = document.getElementById('u10-cam'); if (!c) return; var ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); window.Draw.drawCameraScene(ctx, 0, 0, 0, 'fallen_box', { time: '15:42', vlm: VLM.fallen_box, showVlm: showVlm }); }
      function blur(st) { var c = document.getElementById('u10-blur'); if (!c) return; var ctx = c.getContext('2d'); window.Draw.drawBlurDemo(ctx, 0, 0, 0, st, {}); }
      return { title: 'U10 vision path', layout: 'voice', labels: { stt: ['Capture a frame', 'robot front camera'], intent: ['Blur faces, badges', 'before storage'], check: ['Server model names it', 'small self-hosted VLM'], execute: ['Label stored', 'advisory only'], person: ['Person confirms', 'or corrects'], reply: ['Joins the eval set', 'labelled example'] }, kinds: { stt: 'ROBOT', intent: 'CODE', check: 'VLM', execute: 'DATA', person: 'PERSON', reply: 'DATA' }, who: { stt: 'The robot\'s front camera takes one frame at the incident.', intent: 'Plain image code blurs faces and badges before anything is stored. No model decides this.', check: 'A small self-hosted VLM names what is in the frame, with a confidence.', execute: 'The label is stored next to the incident. It is advice only; it moves nothing.', person: 'An operator confirms the label or corrects it.', reply: 'The labelled frame joins the evaluation set used to test the next model.' },
        steps: [
          { box: 'stt', status: 'INFO', 'in': 'incident ERR_OBSTACLE_PERSISTENT_BLOCK', out: 'frame captured (front camera)', onEnter: function () { cam(false); blur('before'); } },
          { box: 'intent', status: 'PASS', 'in': 'frame', out: 'faces and badges blurred before storage', onEnter: function () { blur('after'); } },
          { box: 'check', status: 'PASS', 'in': 'blurred frame', out: 'label unmapped_obstacle, confidence 0.88', onEnter: function () { cam(true); } },
          { box: 'execute', status: 'PASS', 'in': 'label', out: 'label stored with the incident (advisory; it acts on nothing alone)' },
          { box: 'person', status: 'WAITING', 'in': 'stored label', out: 'a person confirms or corrects',
            approval: { key: 'U10', failed: 'Labels join the evaluation set only after a person checks them.', rule: 'human label required', why: 'The model matches people 81% of the time; it needs a human-labelled set before it can be trusted further.', proposal: 'label := unmapped_obstacle (0.88)', alternative: 'label := unmapped_obstacle (confirmed)', altValue: 'unmapped_obstacle', approveLabel: 'Confirm',
              edit: { type: 'choice', label: 'label', choices: ['unmapped_obstacle', 'damaged_pallet', 'soft_curtain', 'glare', 'dirty_sensor'], rangeText: 'allowed labels from the evaluation set' } },
            branch: { approve: [{ box: 'reply', status: 'INFO', 'in': 'confirmed label', out: 'the labelled frame joins the evaluation set' }], edit: [{ box: 'reply', status: 'INFO', 'in': 'corrected label', out: 'the corrected frame joins the evaluation set' }], reject: [{ box: 'reply', status: 'INFO', 'in': 'discarded', out: 'frame discarded; nothing stored for evaluation' }] } }],
        result: { key: 'U10', cls: 'ok', html: 'Frame to label to evaluation set, with faces blurred and a person in the loop. Customer pictures stay on Botsync-controlled machines.' } };
    } });

  /* V (voice from a phone) is registered by voice.js; it plays in this same player */
  var ORDER = ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10', 'V'];
  function list() { return ORDER.filter(function (id) { return SC[id]; }).map(function (id) { return { id: id, short: SC[id].short }; }); }

  /* ---------- scenario player (9.0) ---------- */
  var cur = { id: null, variant: null, robot: null };
  function stopScenario() {
    var A = window.App; A.scenarioActive = false; A.forceSwapBay = false; A.pipelineRunning = false;
    if (cur.restoreSwap) { cur.restoreSwap = false; A.policy.swap = false; if (A.live) { A.live.policy.swap = false; } }
    if (A.live) { A.overlays.routes = []; A.overlays.objects = []; A.overlays.closed = {}; A.live.closed = A.overlays.closed; A.live.redirectDrop = null; A.live.robots.forEach(function (r) { r.hold = false; r.waitPerson = false; if (r.incident && r.incident.scripted) { r.incident.holdForUser = false; r.timer = 0.01; } }); }
    cur.id = null;
  }
  function renderPlayer(side, id) {
    if (id === 'voice') id = 'V';
    var sc = SC[id], A = window.App;
    if (cur.id !== id) {
      stopScenario();
      cur.id = id; cur.variant = cur.nextVariant || (sc.variants ? sc.variants[0].id : null); cur.nextVariant = null;
      if (sc.wh && (sc.wh !== A.wh || !A.live || A.live.wh.id !== sc.wh)) { UI.setWarehouse(sc.wh, true); UI.newLive(); A.sel = { type: 'scenario', id: id }; UI.renderWorkFrame(); }
      prepare(sc);
    }
    var idx = ORDER.indexOf(id), prev = ORDER[idx - 1], next = ORDER[idx + 1];
    var nav = '<div class="sc-nav"><button id="sc-prev"' + (prev ? '' : ' disabled') + '>&#8592; Prev' + (prev ? ' (' + prev + ')' : '') + '</button>' +
      '<label class="sc-pick-l">Scenario <select id="sc-pick" aria-label="Jump to a scenario">' + list().map(function (s, k) { return '<option value="' + s.id + '"' + (s.id === id ? ' selected' : '') + '>' + (k + 1) + '. ' + UI.esc(s.short) + '</option>'; }).join('') + '</select></label>' +
      '<span class="sc-count small">' + (idx + 1) + ' of ' + ORDER.length + '</span>' +
      '<button id="sc-next"' + (next ? '' : ' disabled') + '>Next' + (next ? ' (' + next + ')' : '') + ' &#8594;</button></div>';
    side.innerHTML = '<div data-panel="scenario" data-scenario="' + id + '"><div class="panel-title"><h2>' + UI.esc(sc.title) + '</h2><button class="panel-close" data-close="1">Back to fleet (Esc)</button></div>' + nav +
      '<p>' + UI.esc(sc.shows) + '</p>' +
      (sc.variants ? '<div class="variants" role="group" aria-label="Variant">' + sc.variants.map(function (v) { return '<button class="seg" data-variant="' + v.id + '" aria-pressed="' + (v.id === cur.variant) + '">' + UI.esc(v.label) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="btn-row">' + (sc.noPipeline ? '' : '<button class="primary" id="sc-run">' + (sc.runLabel || (cur.robot ? 'Recover' : 'Run')) + '</button>') + '<button id="sc-replay">Replay</button></div>' +
      '<div id="sc-body"></div><div id="sc-pipe"></div></div>';
    var body = document.getElementById('sc-body');
    var bodyHtml = sc.body ? sc.body.call(sc, cur.robot, cur.variant) : '';
    if (cur.robot && cur.robot.incident) {
      body.innerHTML = '<div id="sc-inc"></div>' + bodyHtml;
      var info = incidentInfo(cur.robot.incident, S(), cur.robot);
      document.getElementById('sc-inc').innerHTML = '<div class="box thick"><h3 class="state-stopped">' + cur.robot.label + ' stopped</h3><p><code>' + cur.robot.incident.code + '</code> · ' + cur.robot.incident.severity + '</p><canvas class="cam" id="sc-cam" width="320" height="200" aria-label="front camera view"></canvas>' +
        '<div class="box"><h4>What the VLM says ' + UI.tag('scripted') + '</h4><p>Label <code>' + info.vlm.label + '</code>, confidence ' + N(scr(info.vlm.conf), 'f2') + '. ' + UI.esc(info.vlm.note) + '</p><p class="small">Advisory: not acting on this alone.</p></div><div class="box"><h4>What the logs say</h4><ul>' + info.logs.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul></div></div>';
      UI.drawCam(info, '#sc-cam');
    } else body.innerHTML = bodyHtml;
    if (sc.bind) sc.bind.call(sc, body);
    var run = document.getElementById('sc-run'); if (run) run.onclick = function () { runPipeline(); };
    document.getElementById('sc-replay').onclick = function () { cur.id = null; renderPlayer(side, id); };
    document.getElementById('sc-next').onclick = function () { if (next) UI.openScenario(next); };
    document.getElementById('sc-prev').onclick = function () { if (prev) UI.openScenario(prev); };
    document.getElementById('sc-pick').onchange = function () { UI.openScenario(this.value); };
    var vb = document.querySelector('#topbar [data-screen="voice"]'); if (vb) vb.classList.toggle('on', id === 'V');
    $$(side, '[data-variant]').forEach(function (b) { b.onclick = function () { cur.nextVariant = b.dataset.variant; var keep = cur.id; cur.id = null; renderPlayer(side, keep); }; });
    if (id === 'U7') runPipeline();
  }
  function $$(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function prepare(sc) {
    var A = window.App; A.scenarioActive = true;
    S().robots.forEach(function (r) { if (r.state === 'stopped' && r.incident && !r.incident.scripted) { r.timer = 0.01; } });
    cur.robot = sc.setup ? sc.setup.call(sc, cur.variant) : null;
    if (cur.robot) { A.selRobot = cur.robot.i; }
    UI.pushLog({ robot: cur.robot ? cur.robot.label : '', code: cur.robot && cur.robot.incident ? cur.robot.incident.code : '', outcome: 'scenario ' + sc.id + ' started' });
  }
  function runPipeline() {
    var sc = SC[cur.id]; if (!sc || sc.noPipeline) return Promise.resolve();
    var run = document.getElementById('sc-run'); if (run) run.disabled = true;
    if (sc.run) return sc.run.call(sc, cur.variant).then(function (c) { var b = document.getElementById('sc-run'); if (b) b.disabled = false; return c; });
    var spec = sc.spec.call(sc, cur.robot, cur.variant);
    spec.title = spec.title || sc.title;
    window.App.pipelineRunning = true;
    return UI.Pipeline.run(document.getElementById('sc-pipe'), spec).then(function (c) { window.App.pipelineRunning = false; return c; });
  }
  /* For the acceptance tests: run a scenario to its end, deciding approvals automatically */
  function runAuto(id, variant, decision) {
    UI.openScenario(id);
    if (variant) { cur.nextVariant = variant; cur.id = null; renderPlayer(document.getElementById('side'), id); }
    var stopAuto = false;
    var poll = setInterval(function () {
      if (stopAuto) return;
      var ap = document.querySelector('#sc-pipe .approval');
      if (ap && !ap.dataset.auto) {
        ap.dataset.auto = '1';
        var d = decision || 'approve';
        if (d === 'approve') { var b = ap.querySelector('#ap-approve'); if (b && !b.disabled) b.click(); else ap.querySelector('#ap-reject').click(); }
        else if (d === 'reject') ap.querySelector('#ap-reject').click();
        else if (d.edit != null) { ap.querySelector('#ap-edit-btn').click(); ap.querySelector('#ap-edit').value = d.edit; ap.querySelector('#ap-apply').click(); }
      }
    }, 60);
    return runPipeline().then(function () { stopAuto = true; clearInterval(poll); return { key: window.App.lastPipeline.result, variant: cur.variant, text: window.App.lastPipeline.transcript + '\n' + document.getElementById('sc-body').textContent + '\n' + document.getElementById('sc-pipe').textContent, visited: window.App.lastPipeline.visited }; });
  }

  window.Scenarios = {
    VLM: VLM, get list() { return list(); }, ORDER: ORDER, register: function (id, d) { d.id = id; SC[id] = d; }, defs: SC, TRIAGE: TRIAGE, incidentInfo: incidentInfo, genericRecover: genericRecover, u9Spec: u9Spec,
    renderPlayer: renderPlayer, stop: stopScenario, runAuto: runAuto, runPipeline: runPipeline, current: function () { return cur; },
    refresh: function () { var el = document.querySelector('[data-live="swapReadout"]'); if (el && cur.id === 'U8') { var h = UI.swapReadout(); if (el.innerHTML !== h) el.innerHTML = h; } }
  };
})();
