/* voice.js: the phone and voice scene (section 11). No microphone, no speech recognition, no outside service:
   Tap to speak shows four preset phrases. The model steps are scripted examples. */
(function () {
  'use strict';
  var D = window.BOTSYNC_DATA, App = window.App, UI = window.UI, Sim = window.Sim, Draw = window.Draw, esc = UI.esc;
  var PHRASES = [
    'Bot 5 is stuck at dock 2, recover it.',
    'Reroute bot 5 to bay 4 and move everything to bay 6.',
    'Release the e-stop on bot 3.',
    'Fix the thing at the dock.'
  ];
  var V = { messages: [], chips: [], listening: false, confirm: null, busy: false, pending: null };

  function setup() {
    if (App.wh !== 'A' || !App.live || App.live.wh.id !== 'A') { UI.setWarehouse('A', true); UI.newLive(); }
    var S = App.live, wh = S.wh;
    App.scenarioActive = true; App.sel = null;
    S.robots.forEach(function (r) { if (r.state === 'stopped' && r.incident && !r.incident.scripted) r.timer = 0.01; });
    // Bot 5 stuck at Bay 1 (a dock door); Bot 3 in a safety stop with a person in the field
    place(S.robots[4], wh.station('Bay 1').node); open(S.robots[4], 'ERR_DOCKING_ALIGNMENT_TIMEOUT', 'Bay 1');
    var n3 = wh.station('Bay 9').node; place(S.robots[2], n3); open(S.robots[2], 'ERR_SAFETY_LIDAR_ESTOP', null);
    App.overlays.objects = [{ kind: 'person', x: wh.nodes[n3].x + 40, y: wh.nodes[n3].y - 4 }];
    V.messages = [{ who: 'bot', text: 'Fleet assistant for Warehouse A (S08). Tap the microphone and pick a phrase.', caption: 'scripted' }];
    V.chips = []; V.confirm = null; V.listening = false; V.busy = false;
  }
  function place(r, node) {
    var S = App.live, nd = S.wh.nodes[node];
    if (r.chargerIdx >= 0) { S.chargers[r.chargerIdx] = null; r.chargerIdx = -1; }
    if (r.corridor) { var k = r.corridor.users.indexOf(r.i); if (k >= 0) r.corridor.users.splice(k, 1); r.corridor = null; }
    S.chargeQueue = S.chargeQueue.filter(function (i) { return i !== r.i; });
    r.node = node; r.x = nd.x; r.y = nd.y; r.path = null; r.mission = null; r.state = 'idle'; r.hold = true; r.incident = null; r.carrying = false; r.dwell = false;
  }
  function open(r, code, station) {
    Sim.openIncident(App.live, r, { code: code, recov: 'operator', down: D.recoveryDist.operator.median.v, uAgent: 1, uGate: 1, uConfirm: 1, uTriage: 1, holdForUser: true, scripted: true, station: station }, 'idle');
  }

  function render() {
    UI.renderWorkFrame();
    var col = document.getElementById('phone-col');
    col.innerHTML = '<div id="phone-holder">' + phoneHtml() + '</div>' +
      '<p class="small">In the real version, speech is turned into text by a small model Botsync hosts. Browser speech services are not used because they send audio to an outside provider.</p>' +
      '<div class="box risks"><h3>Risks</h3><ul><li>Noisy floor: a misheard robot number. A confirm step for multi-robot or non-reversible actions.</li><li>Who is allowed to command: sign-in on the phone, role limits.</li><li>A command must never bypass the check.</li><li>Log every command with who, when and the result.</li></ul></div>';
    document.getElementById('side').innerHTML = '<div data-panel="voice"><div class="panel-title"><h2>Voice from a phone</h2><button class="panel-close" id="v-reset">Reset scene</button></div><p>A supervisor handles failures by voice without walking to a screen. Bot 5 is stuck at Bay 1 (a dock door); Bot 3 is in a safety stop.</p><div id="v-pipe"></div></div>';
    document.getElementById('v-reset').onclick = function () { setup(); render(); };
    bindPhone();
  }
  function phoneHtml() { return Draw.htmlPhoneMock({ messages: V.messages, chips: V.chips, listening: V.listening, confirm: V.confirm, reducedMotion: App.reducedMotion, micDisabled: V.busy }); }
  function refreshPhone() { var h = document.getElementById('phone-holder'); if (!h) return; h.innerHTML = phoneHtml(); bindPhone(); var chat = h.querySelector('.phone-chat'); if (chat) chat.scrollTop = chat.scrollHeight; }
  function bindPhone() {
    var h = document.getElementById('phone-holder'); if (!h) return;
    var mic = h.querySelector('.mic-btn');
    if (mic) mic.onclick = function () {
      if (V.busy) return;
      V.listening = true; V.chips = []; refreshPhone();
      setTimeout(function () { V.listening = false; V.chips = PHRASES.slice(); V.chipMode = 'phrase'; refreshPhone(); var c = document.querySelector('.phrase-chip'); if (c) c.focus(); }, 1200);
    };
    h.querySelectorAll('.phrase-chip').forEach(function (b) {
      b.onclick = function () { var i = +b.dataset.phrase; if (V.chipMode === 'robot') chooseRobot(V.chipRobots[i]); else say(i); };
    });
    h.querySelectorAll('[data-confirm]').forEach(function (b) { b.onclick = function () { if (V.pending) { var f = V.pending; V.pending = null; V.confirm = null; V.messages.push({ who: 'user', text: b.dataset.confirm === 'yes' ? 'Yes' : 'No', caption: 'tap' }); refreshPhone(); f(b.dataset.confirm); } }; });
  }
  function reply(text) { V.messages.push({ who: 'bot', text: text, caption: 'scripted' }); refreshPhone(); }
  function robotByLabel(l) { return App.live.robots.filter(function (r) { return r.label === l; })[0]; }

  function stt(text) { return { box: 'stt', status: 'PASS', 'in': 'audio from the phone (scripted; no real microphone)', out: 'text: "' + text + '"' }; }
  function gates(rows) { return rows.map(function (r) { return { check: r[0], result: r[1], measured: r[2], threshold: r[3] }; }); }

  function recoverSteps(bot, station) {
    var stopped = bot && bot.state === 'stopped' && bot.incident, safety = stopped && bot.incident.code === 'ERR_SAFETY_LIDAR_ESTOP';
    var intent = { intent: 'recover_robot', robot: bot ? bot.label : '?', station: station || (stopped && bot.incident.station) || '' };
    var rows = gates([['robot exists', bot ? 'PASS' : 'FAIL', bot ? bot.label : 'none', 'exists'], ['robot is stopped', stopped ? 'PASS' : 'FAIL', bot ? UI.stateName(bot) : '-', 'stopped'], ['action on whitelist', 'PASS', 'recover_robot', 'whitelist'], ['not a safety code', safety ? 'FAIL' : 'PASS', stopped ? bot.incident.code : '-', 'not ERR_SAFETY_LIDAR_ESTOP']]);
    var ok = bot && stopped && !safety;
    var steps = [{ box: 'intent', status: 'PASS', 'in': 'text', out: JSON.stringify(intent) }];
    if (ok) {
      steps.push({ box: 'check', status: 'PASS', 'in': 'intent', out: 'PASS', gates: rows, gatesTitle: 'Deterministic check' },
        { box: 'execute', status: 'PASS', 'in': 'recover ' + bot.label, out: 'recovery runs on the map (agent path, 4 min)', onEnter: function () { UI.executeRecovery(bot, D.recoveryDist.auto.median.v, 'agent'); } },
        { box: 'reply', status: 'INFO', 'in': 'result', out: bot.label + ' is moving again. It took 4 minutes.', onEnter: function () { reply(bot.label + ' is moving again. It took 4 minutes.'); } });
      return { steps: steps, result: { key: 'V-recovered', cls: 'ok', html: '<strong class="state-ok">PASS.</strong> ' + esc(bot.label) + ' recovered from the phone; no walk to a screen. Reply: "' + esc(bot.label) + ' is moving again. It took 4 minutes."' } };
    }
    if (safety) return refuseSteps(bot, steps.concat([]), rows);
    steps.push({ box: 'check', status: 'FAIL', 'in': 'intent', out: 'FAIL: ' + (bot ? bot.label + ' is not stopped' : 'no such robot'), gates: rows, gatesTitle: 'Deterministic check' },
      { box: 'reply', status: 'INFO', 'in': 'fail', out: 'Nothing to recover.', onEnter: function () { reply('I can\'t do that: ' + (bot ? bot.label + ' is not stopped.' : 'I don\'t know that robot.')); } });
    return { steps: steps, result: { key: 'V-nothing', html: 'Check failed; nothing changed.' } };
  }
  function refuseSteps(bot, steps, rows) {
    steps.push({ box: 'check', status: 'FAIL', 'in': 'intent: release e-stop', out: 'FAIL: safety layer. The safety layer never takes input from a model or a phone.', gates: rows, gatesTitle: 'Deterministic check' },
      { box: 'person', status: 'WAITING', 'in': 'refused', out: 'only a person at the robot can confirm the area is clear and reset it',
        approval: { key: 'voice-safety', failed: 'Releasing an e-stop reaches the safety layer, which never takes input from a model or a phone.', rule: 'safety_layer_untouched', why: 'Only a person at the robot can confirm the area is clear. No software path exists.',
          proposal: 'release_estop(' + (bot ? bot.label : '?') + ')', offending: 'release_estop', alternative: 'None in software. Send a person to the robot to check the area and reset it.', noAlternative: true, rejectLabel: 'Close: refused' },
        branch: { reject: [{ box: 'reply', status: 'INFO', 'in': 'refused', out: 'I can\'t do that. Someone has to be at the robot and confirm the area is clear.', onEnter: function () { reply('I can\'t do that. Someone has to be at the robot and confirm the area is clear.'); } }] } });
    return { steps: steps, result: { key: 'V-refused', cls: 'refused', html: '<strong class="state-stopped" data-outcome="refused">Refused.</strong> Matches U9: the safety layer is outside every software level. Nothing changed on the robot.' } };
  }

  function run(text, spec) {
    V.busy = true; refreshPhone();
    var all = [stt(text)].concat(spec.steps);
    return UI.Pipeline.run(document.getElementById('v-pipe'), { title: 'Voice pipeline', layout: 'voice', steps: all, result: spec.result }).then(function () { V.busy = false; refreshPhone(); return App.lastPipeline; });
  }
  function say(i) {
    var text = PHRASES[i];
    V.chips = []; V.messages.push({ who: 'user', text: text, caption: 'speech to text' }); refreshPhone();
    var S = App.live, wh = S.wh;
    if (i === 0) return run(text, recoverSteps(robotByLabel('Bot 5'), 'Bay 1'));
    if (i === 1) {
      var cmds = [{ robot: 'Bot 5', action: 'reroute', to: 'Bay 4' }, { action: 'redirect_all', from: 'current drop-offs', to: 'Bay 6' }];
      var rows = gates([['Bay 4 exists and is open', 'PASS', 'open', 'exists, open'], ['Bay 6 exists and is open', 'PASS', 'open', 'exists, open'], ['no other robot\'s route clashes head-on', 'PASS', 'no clash', 'no clash'], ['changes more than one robot: ask to confirm', 'WAITING', 'yes', 'confirm']]);
      return run(text, { steps: [
        { box: 'intent', status: 'PASS', 'in': 'text', out: cmds.map(function (c) { return JSON.stringify(c); }).join('\n') },
        { box: 'check', status: 'PASS', 'in': 'commands', out: 'PASS; changes more than one robot, so the phone asks to confirm', gates: rows, gatesTitle: 'Deterministic check' },
        { box: 'person', status: 'WAITING', 'in': 'confirm on the phone', out: 'Confirm: send Bot 5 to Bay 4 and all drop-offs to Bay 6?',
          waitFor: function () { return new Promise(function (res) { V.confirm = { text: 'Confirm: send Bot 5 to Bay 4 and all drop-offs to Bay 6?' }; V.pending = res; refreshPhone(); var y = document.querySelector('[data-confirm="yes"]'); if (y) y.focus(); }); },
          branch: {
            yes: [{ box: 'execute', status: 'PASS', 'in': 'confirmed commands', out: 'Bot 5 heads to Bay 4; drop-offs go to Bay 6', onEnter: function () { apply(cmds); } },
              { box: 'reply', status: 'INFO', 'in': 'done', out: 'Done. Bot 5 is going to Bay 4 and all drop-offs now go to Bay 6.', onEnter: function () { reply('Done. Bot 5 is going to Bay 4 and all drop-offs now go to Bay 6.'); } }],
            no: [{ box: 'reply', status: 'INFO', 'in': 'cancelled', out: 'Cancelled. Nothing changed.', onEnter: function () { reply('Cancelled. Nothing changed.'); } }]
          } }],
        result: function (ctrl) { var yes = ctrl.decisions[0] === 'yes'; return { key: yes ? 'V-rerouted' : 'V-cancelled', cls: yes ? 'ok' : '', html: yes ? '<strong class="state-ok">Confirmed and applied.</strong> Anything that changes more than one robot always asks to confirm.' : 'Cancelled on the phone; nothing changed.' }; } });
    }
    if (i === 2) {
      var b3 = robotByLabel('Bot 3');
      var rows3 = gates([['robot exists', 'PASS', 'Bot 3', 'exists'], ['robot is stopped', b3.state === 'stopped' ? 'PASS' : 'FAIL', UI.stateName(b3), 'stopped'], ['action on whitelist', 'FAIL', 'release_estop', 'whitelist'], ['not a safety code', 'FAIL', 'ERR_SAFETY_LIDAR_ESTOP', 'not a safety code']]);
      return run(text, refuseSteps(b3, [{ box: 'intent', status: 'PASS', 'in': 'text', out: JSON.stringify({ intent: 'release_estop', robot: 'Bot 3' }) }], rows3));
    }
    // phrase 4: the model cannot resolve it and asks back
    var stopped = S.robots.filter(function (r) { return r.state === 'stopped'; });
    return run(text, { steps: [
      { box: 'intent', status: 'FAIL', 'in': 'text', out: JSON.stringify({ intent: 'recover_robot', robot: null, station: 'dock (which one?)' }) + '\nunresolved: no robot named, two dock doors' },
      { box: 'person', status: 'WAITING', 'in': 'unresolved intent', out: 'ask back: "Which robot, and which dock?"',
        onEnter: function () { V.chipMode = 'robot'; V.chipRobots = stopped.map(function (r) { return r.label; }); V.chips = stopped.map(function (r) { return r.label + (r.incident && r.incident.station ? ' at ' + r.incident.station : ''); }); reply('Which robot, and which dock?'); } },
      { box: 'reply', status: 'INFO', 'in': 'question', out: 'Which robot, and which dock? (chips for the stopped robots)' }],
      result: { key: 'V-question', html: 'The model could not resolve the request, so it asked a question instead of guessing. Pick a robot on the phone.' } });
  }
  function chooseRobot(label) {
    V.chips = []; V.chipMode = 'phrase'; V.messages.push({ who: 'user', text: label, caption: 'tap' }); refreshPhone();
    var r = robotByLabel(label);
    return run('recover ' + label, recoverSteps(r, r && r.incident ? r.incident.station : ''));
  }
  function apply(cmds) {
    var S = App.live, wh = S.wh, routes = [];
    var b5 = robotByLabel('Bot 5'), st4 = wh.station('Bay 4'), st6 = wh.station('Bay 6');
    if (b5.incident) { b5.incident.holdForUser = false; b5.timer = 0.01; }
    setTimeout(function () { b5.hold = true; b5.mission = { pick: st4, drop: st4, phase: 'toDrop' }; b5.state = 'moving'; Sim.setPath(S, b5, st4.node); }, 100);
    routes.push(wh.path(b5.node, st4.node).map(function (n) { return [wh.nodes[n].x, wh.nodes[n].y]; }));
    S.redirectDrop = 'Bay 6';
    S.robots.forEach(function (o) { if (o.mission && o !== b5) { o.mission.drop = st6; if (o.mission.phase === 'toDrop') Sim.setPath(S, o, st6.node); routes.push(wh.path(o.node, st6.node).map(function (n) { return [wh.nodes[n].x, wh.nodes[n].y]; })); } });
    App.overlays.routes = routes;
  }

  /* for the acceptance tests: say a phrase and answer any confirm automatically */
  function runAuto(i, answer) {
    setup(); render();
    var poll = setInterval(function () { var rj = document.querySelector('#v-pipe .approval #ap-reject:not([disabled])'); if (rj) rj.click(); if (V.pending) { var f = V.pending, a = answer || 'yes'; V.pending = null; V.confirm = null; V.messages.push({ who: 'user', text: a === 'yes' ? 'Yes' : 'No', caption: 'tap' }); refreshPhone(); f(a); } }, 80);
    return say(i).then(function (r) { clearInterval(poll); return { key: r.result, text: document.getElementById('v-pipe').textContent, phone: V.messages.map(function (m) { return m.text; }), visited: r.visited }; });
  }

  UI.register('voice', function () { setup(); render(); });
  App.on('screen', function (k) { if (k !== 'voice' && App.scenarioActive && !(App.sel && App.sel.type === 'scenario')) { if (window.Scenarios) window.Scenarios.stop(); } });
  window.Voice = { render: function () { setup(); render(); }, runAuto: runAuto, say: say, PHRASES: PHRASES, state: V };
})();
