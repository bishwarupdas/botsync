/* game.js: Game mode (section 10). Today and the chosen policy run on the same seed, so the difference comes from the policy. */
(function () {
  'use strict';
  var D = window.BOTSYNC_DATA, Draw = window.Draw, App = window.App, UI = window.UI, Sim = window.Sim, N = UI.N, sim = UI.sim, esc = UI.esc, tag = UI.tag, A = D.assumed;
  var WEEK_SECONDS_AT_1X = 36, DAYS = 7;
  var G = { policy: { swap: true, agent: false, triage: false, cams: false }, params: {}, seed: 1, stepper: null, last: null, avg: null, running: false };
  function defaults() { G.params = { headroom: A.headroom.v, swapTime: A.swapTimeMin.v, spares: A.sparePacksPerRobot.v, operators: A.swapOperators.v, agentCan: A.agentCan.v, gatePass: A.gatePass.v, triageSaving: A.triageSaving.v, camUplift: A.camUplift.v }; }
  defaults();
  /* Best case (added after review): every switch on and every assumption at the most favourable end of its allowed range.
     Swap time is best at its minimum; every other slider at its maximum. An upper bound for play, not a forecast. */
  var BEST_LOW = { swapTime: true };
  function bestCase() {
    G.policy = { swap: true, agent: true, triage: true, cams: true };
    var P = UI.PDEF; Object.keys(G.params).forEach(function (k) { if (P[k]) G.params[k] = BEST_LOW[k] ? P[k].min : P[k].max; });
    G.best = true;
  }

  function idleSim() { App.gameSim = Sim.create({ wh: App.wh, seed: G.seed, days: DAYS, mode: 'game', policy: G.policy, params: G.params }); }

  function render() {
    var side = document.getElementById('side'), P = UI.PDEF, F = UI.FMT;
    UI.renderWorkFrame();
    if (!G.running) idleSim();
    var site = window.Warehouses.get(App.wh).siteRow;
    side.innerHTML = '<div data-panel="game"><div class="panel-title"><h2>Game: compare policies</h2></div>' +
      '<p>1. Pick a warehouse (top bar). Now: <strong>Warehouse ' + App.wh + ', ' + esc(site.site_id + ' ' + site.site_name) + ', ' + esc(site.shift_pattern) + '</strong>.</p>' +
      '<h3>2. Pick a policy</h3><div class="policy-row">' + UI.switchHtml('swap', 'Battery swap (a person swaps in a charged pack, instead of a 100-minute charge)', G.policy.swap) + UI.switchHtml('agent', 'Recovery agent (AI proposes a fix for a stopped robot; fixed rules check it before the robot moves)', G.policy.agent) + UI.switchHtml('triage', 'Triage (AI suggests why each incident happened; an engineer confirms; no robot moves)', G.policy.triage) +
      UI.switchHtml('cams', 'Fixed cameras around the site (extra camera views that help the recovery agent)', G.policy.cams, false, 'Gives the recovery agent a second view of docking, pallet-pocket and obstacle stops, so it can propose a fix more often. Works only with the recovery agent on. Costs money at every site, and the case does not size the gain: the roadmap keeps it for later, after the robot\'s own camera.') + '</div>' +
      '<p class="note-line" id="cams-warn" hidden>Fixed cameras on their own change nothing: only the recovery agent uses the pictures. Turn on Recovery agent too.</p>' +
      '<h3>3. Assumptions</h3>' +
      UI.sliderHtml('headroom', P.headroom, G.params.headroom, 'Work waiting beyond today\'s volume', F.headroom).replace('</div>', '<div class="note"><strong>Freed time becomes pallets only if work is waiting.</strong></div></div>') +
      gated('swap', UI.sliderHtml('swapTime', P.swapTime, G.params.swapTime, 'Swap time', F.swapTime) + UI.sliderHtml('spares', P.spares, G.params.spares, 'Spare packs per robot', F.spares) +
        UI.sliderHtml('operators', P.operators, G.params.operators, 'Operators at the swap bay', F.operators).replace('</div>', '<div class="note">One operator swaps one robot at a time. A second operator only helps when robots queue at the bay: compare "Average wait for a free operator" in the results.</div></div>'), 'Battery swap') +
      gated('agent', UI.sliderHtml('agentCan', P.agentCan, G.params.agentCan, 'Agent can propose a fix', F.agentCan) + UI.sliderHtml('gatePass', P.gatePass, G.params.gatePass, 'Gate pass rate', F.gatePass), 'Recovery agent') +
      gated('cams', UI.sliderHtml('camUplift', P.camUplift, G.params.camUplift, 'Fixed cameras: extra chance the agent can propose a fix on camera-dependent stops', F.camUplift).replace('<span class="tag assumed">assumed</span>', '<span class="tag assumed">assumed (author estimate)</span>'), 'Fixed cameras') +
      gated('triage', UI.sliderHtml('triageSaving', P.triageSaving, G.params.triageSaving, 'Triage saving on no-fault-found hours', F.triageSaving), 'Triage') +
      '<div class="btn-row"><button id="g-reset">Reset to defaults</button><button id="g-best" title="Every switch on, every assumption at its most favourable end, then run a week">Best case</button></div>' +
      (G.best ? '<p class="note-line" id="g-best-note"><strong>Best case set:</strong> every switch is on and every assumption sits at the most favourable end of its range (swap ' + G.params.swapTime + ' min, ' + G.params.operators + ' operators, ' + (+G.params.spares).toFixed(2) + ' spare packs per robot, agent ' + Math.round(G.params.agentCan * 100) + '%, gate ' + Math.round(G.params.gatePass * 100) + '%, cameras +' + Math.round(G.params.camUplift * 100) + ' points, ' + Math.round(G.params.headroom * 100) + '% work waiting). It is an upper bound for play, not a forecast. Change anything to leave it.</p>' : '') +
      '<h3>4. Run</h3><div class="btn-row"><button class="primary" id="g-run">Run a week</button><button id="g-skip" disabled>Skip to result</button><button id="g-avg">Average of 20 runs</button><button id="g-seed">Try another seed</button></div>' +
      '<p class="small">Seed <span id="g-seedv">' + G.seed + '</span>. Today and your policy use the same seed. Speed in the top bar sets the animation (a week takes about ' + WEEK_SECONDS_AT_1X + ' s at 1x).</p>' +
      '<div class="progress" aria-label="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="g-prog" style="width:0%"></div></div>' +
      '<div id="g-out" aria-live="polite">' + (G.last ? scoreboard(G.last) : '') + (G.avg ? avgTable(G.avg) : '') + '</div>' + staticBoxes() + '</div>';
    bind(side);
    renderLogic();
  }
  /* "How the Game works", under the map (added after review): the rules the two runs follow, with the current values.
     Lines for switches that are off are dimmed; every number comes from data.js or the sliders. */
  function logicHtml() {
    var P = G.policy, p = G.params, pc = function (v) { return Math.round(v * 100) + '%'; }, li = function (on, key, title, body) { return '<li class="gl-' + key + (on === false ? ' gl-off' : '') + '"><strong>' + title + '</strong>' + (on === false ? ' <span class="small">(off)</span>' : on ? ' <span class="small gl-on">(on)</span>' : '') + ' ' + body + '</li>'; };
    return '<h3>How the Game works</h3>' +
      '<ol class="gl">' +
      li(null, 'runs', 'Two runs, same week.', '"Today" (no policy) and "Your policy" run on the same seed: the same robots, the same work and the same stops, drawn in advance. So any difference comes from the policy, not from luck.') +
      li(null, 'work', 'Work.', 'Missions arrive at the site at its calibrated rate. Both runs face today\'s volume plus ' + pc(p.headroom) + ' of work waiting. Your policy can finish at most today\'s volume &times; (1 + ' + pc(p.headroom) + '); time freed beyond that turns idle, not into pallets. Pallet moves = moving hours &times; ' + N(A.palletsPerMovingHour, 'raw') + '.') +
      li(null, 'charge', 'Charging today.', 'Below its charge trigger a robot drives to a free charger (1 per ' + N(A.robotsPerCharger, 'int', { noTag: true }) + ' robots, assumed) and charges ' + N(A.chargeTimeMin, 'int', { noTag: true }) + ' min; waiting for a charger counts as idle. Run flat, and it is an emergency stop that needs a person.') +
      li(!!P.swap, 'swap', 'Battery swap.', 'At the trigger, if a charged spare is waiting, the robot goes to the swap bay instead, waits for a free operator (' + p.operators + ' at the bay; each swaps one robot at a time), and the swap takes ' + p.swapTime + ' min. The spent pack recharges on the rack. ' + (+p.spares).toFixed(2) + ' spare packs per robot; with none charged, the robot falls back to the charger.') +
      li(!!P.agent, 'agent', 'Recovery agent.', 'For a level-1 stop that today needs an operator or remote person: ' + pc(p.agentCan) + ' of the time the agent can propose a fix; ' + pc(p.gatePass) + ' of those pass the check and clear in ' + N(D.recoveryDist.auto.median, 'f0', { suffix: ' min' }) + '; the rest need one click (+' + N(A.approvalWaitMin, 'int', { noTag: true }) + ' min). Otherwise the stop takes today\'s path (operator walk-up). Safety stops are never touched.') +
      li(!!P.cams, 'cams', 'Fixed cameras.', 'Only with the recovery agent: on docking, pallet-pocket and obstacle stops the agent\'s chance rises by +' + Math.round(p.camUplift * 100) + ' points (an author estimate; the case does not size it).' + (P.cams && !P.agent ? ' <strong>The agent is off, so this changes nothing.</strong>' : '')) +
      li(!!P.triage, 'triage', 'Triage.', 'Returns no robot time. It cuts engineering hours on no-fault-found tickets by ' + pc(p.triageSaving) + ' and raises confirmed causes.') +
      li(null, 'score', 'Scoreboard.', 'Robot time returned = moving hours gained over Today. Shares are of scheduled shift time; off-shift hours (the map shows "Off shift") are not counted.') +
      '</ol><p class="small">Every rule above uses an assumed or measured value from the data; see "Limits of this simulation" in the panel for what is not modelled.</p>';
  }
  function renderLogic() { var el = document.getElementById('game-logic'); if (el && App.mode === 'game') el.innerHTML = logicHtml(); }
  function staticBoxes() {
    return '<div class="box"><h3>Limits of this simulation</h3><p>The sim does not model: ageing packs (the ' + N(D.charging.weakPacks, 'int') + ' weak packs and their ' + N(D.charging.lowBatteryStopsPerRobotWeak, 'f2') + ' vs ' + N(D.charging.lowBatteryStopsPerRobotHealthy, 'f2') + ' stops per robot are shown as data, not simulated), the real number of chargers (assumed 1 per 3 robots), mission-level demand by hour, network faults, traffic with people and forklifts (except the e-stop scene), or technician travel.</p>' +
      '<p>With the assumed 1 charger per 3 robots, robots at the 16-hour sites (B and C) queue for chargers in the afternoon far more than the 0.2-minute wait in the data. That queue is time a swap can return, so the sim overstates the swap at B and C. Read the results as direction only.</p></div>' +
      '<div class="box"><h3>What would change my mind</h3><ul><li>A real swap taking much longer than ' + N(A.targetSwapMin, 'int', { suffix: ' minutes' }) + '.</li><li>A spare-pack need well above ' + N({ v: A.sparePacksPerRobot.v, src: A.sparePacksPerRobot.src }, 'raw') + ' per robot.</li><li>A pack that cannot be handled safely by one person.</li></ul></div>' +
      '<div class="box"><h3>What argues against</h3><p>Swapping only helps the 24-hour sites (' + N(D.charging.byPattern['24x7'].sites, 'int') + ' of ' + N(D.fleet.sites, 'int') + ' sites, ' + N(D.charging.robotsAt24x7Sites, 'int') + ' of ' + N(D.fleet.robots, 'int') + ' robots); the 16-hour sites already charge at ' + N(D.charging.byPattern['16x7'].share, 'pct1') + '.</p></div>';
  }
  /* sliders belong to a policy: greyed out (and not used) while that policy is off */
  function gated(key, html, name) { return '<div class="gated" data-gate="' + key + '"><p class="small dim gate-note">Used only when ' + esc(name) + ' is on.</p>' + html + '</div>'; }
  function updateGates(root) {
    root.querySelectorAll('.gated').forEach(function (g) {
      var on = !!G.policy[g.dataset.gate]; g.classList.toggle('off', !on);
      g.querySelectorAll('input').forEach(function (i) { i.disabled = !on; });
    });
    var w = root.querySelector('#cams-warn'); if (w) w.hidden = !(G.policy.cams && !G.policy.agent);
  }
  function leaveBest() { if (!G.best) return; G.best = false; var n = document.getElementById('g-best-note'); if (n) n.remove(); }
  function bind(root) {
    root.querySelectorAll('[data-policy]').forEach(function (b) {
      if (b.disabled) return;
      b.onclick = function () { var k = b.dataset.policy; G.policy[k] = !G.policy[k]; b.setAttribute('aria-pressed', String(G.policy[k])); updateGates(root); renderLogic(); leaveBest(); };
    });
    updateGates(root);
    root.querySelectorAll('input[data-param]').forEach(function (inp) {
      inp.oninput = function () { var k = inp.dataset.param; G.params[k] = +inp.value; document.getElementById('slv-' + k).textContent = UI.FMT[k](+inp.value); renderLogic(); leaveBest(); };
    });
    document.getElementById('g-reset').onclick = function () { defaults(); G.best = false; render(); };
    document.getElementById('g-best').onclick = function () { if (G.running) return; bestCase(); render(); runWeek(); };
    document.getElementById('g-run').onclick = function () { runWeek(); };
    document.getElementById('g-skip').onclick = function () { if (G.stepper) { G.stepper.advance(Infinity); finishWeek(); } };
    document.getElementById('g-avg').onclick = function () { runAverage(); };
    document.getElementById('g-seed').onclick = function () { G.seed = G.seed % 997 + 1; document.getElementById('g-seedv').textContent = G.seed; };
  }
  function opts(seed) { return { wh: App.wh, seed: seed, days: DAYS, policy: JSON.parse(JSON.stringify(G.policy)), params: JSON.parse(JSON.stringify(G.params)) }; }
  function runWeek() {
    G.stepper = Sim.compareStepper(opts(G.seed)); G.running = true; G.t0 = performance.now();
    App.gameSim = G.stepper.sim; window.UI.sizeMap();
    document.getElementById('g-skip').disabled = false; document.getElementById('g-run').disabled = true;
    document.getElementById('g-out').innerHTML = '<p>Running a simulated week on Warehouse ' + App.wh + '...</p>';
  }
  function frame(dtReal) {
    if (!G.running || !G.stepper) return;
    var perSec = DAYS * 1440 / WEEK_SECONDS_AT_1X, min = dtReal * perSec * App.speed;
    if (min > 0) G.stepper.advance(min);
    var p = G.stepper.sim.t / (DAYS * 1440), pr = document.getElementById('g-prog'); if (pr) pr.style.width = (100 * p).toFixed(1) + '%';
    var cl = document.getElementById('clock'); if (cl) cl.textContent = 'simulated day ' + (Math.min(DAYS, Math.floor(G.stepper.sim.t / 1440) + 1)) + ', ' + UI.clock(G.stepper.sim.t);
    if (G.stepper.done()) finishWeek();
  }
  function finishWeek() {
    G.running = false; G.last = G.stepper.result(); G.last.ms = performance.now() - G.t0; G.last.wh = App.wh; G.last.switches = JSON.parse(JSON.stringify(G.policy)); G.last.params = JSON.parse(JSON.stringify(G.params)); G.last.best = !!G.best;
    window.App.lastGame = { ms: G.last.ms, returned: G.last.robotHoursReturned, extra: G.last.extraPalletMoves, todayVolume: G.last.todayVolume, headroom: G.last.headroom, wh: App.wh, policy: G.last.switches };
    var pr = document.getElementById('g-prog'); if (pr) pr.style.width = '100%';
    var sk = document.getElementById('g-skip'), rn = document.getElementById('g-run'), out = document.getElementById('g-out');
    if (sk) sk.disabled = true; if (rn) rn.disabled = false; if (out) out.innerHTML = scoreboard(G.last);
  }

  function row(label, a, b, f, diffF, opt) {
    opt = opt || {};
    var d = b - a, df = diffF || f, sign = d > 0 ? '+' : '';
    return '<tr><td>' + label + '</td><td class="n">' + (a == null ? '' : N(sim(a), f)) + '</td><td class="n">' + N(sim(b), f) + '</td><td class="n"><strong>' + (a == null ? '' : sign + UI.fmtNum(d, df)) + '</strong></td></tr>';
  }
  function only(label, v, f) { return '<tr><td>' + label + '</td><td class="n">no swap bay</td><td class="n">' + N(sim(v), f) + '</td><td class="n"></td></tr>'; }
  function scoreboard(r) {
    var t = r.today, p = r.policy, P = r.switches || G.policy, ppm = A.palletsPerMovingHour.v;
    var html = '<h3>Scoreboard: Warehouse ' + (r.wh || App.wh) + ', one week' + (r.best ? ', <span data-k="best">best case</span>' : '') + ' ' + tag('simulated') + '</h3><table class="score"><thead><tr><th></th><th class="n">Today</th><th class="n">Your policy</th><th class="n">difference</th></tr></thead><tbody>' +
      '<tr><td><strong>Robot time returned (hours)</strong></td><td class="n"></td><td class="n">' + N(sim(r.robotHoursReturned), 'f1') + '</td><td class="n"><strong data-k="returned">' + UI.fmtNum(r.robotHoursReturned, 'f1') + '</strong></td></tr>' +
      '<tr><td><strong>Extra pallet moves</strong> (capped by headroom)</td><td class="n"></td><td class="n">' + N(sim(r.extraPalletMoves), 'int') + '</td><td class="n"><strong data-k="extra">' + UI.fmtNum(r.extraPalletMoves, 'int') + '</strong></td></tr>' +
      row('Pallet moves', t.palletMoves, p.palletMoves, 'int') + row('Share moving', t.shareMoving, p.shareMoving, 'pct1') + row('Share charging', t.shareCharging, p.shareCharging, 'pct1') +
      row('Share stopped', t.shareStopped, p.shareStopped, 'pct2') + row('Emergency low-battery stops', t.emergencyLowBatteryStops, p.emergencyLowBatteryStops, 'int') +
      row('Incident downtime hours', t.downtimeHours, p.downtimeHours, 'f1') + row('Operator walk-ups', t.operatorWalkUps, p.operatorWalkUps, 'int') + row('Human clicks', t.humanClicks, p.humanClicks, 'int');
    if (P.swap) html += row('Swaps done', 0, p.swapsDone, 'int') + '<tr><td>Operators at the swap bay</td><td class="n"></td><td class="n">' + N(sim(p.operators), 'int') + '</td><td class="n"></td></tr>' +
      only('Operator busy (share of the shift, each)', p.operatorBusyShare, 'pct0') + only('Average wait for a free operator (min per swap)', p.swapWaitPerSwap, 'f1') + row('Swap queue minutes (all robots)', 0, p.swapWaitMinutesTotal, 'int') + row('Fell back to the charger', 0, p.chargerFallbacks, 'int');
    if (P.cams) html += '<tr><td>Camera-dependent stops a person handles today (docking, pallet pocket, obstacle)</td><td class="n">' + N(sim(t.camEligible), 'int') + '</td><td class="n"></td><td class="n"></td></tr>' +
      '<tr><td>Of those, fixed by the agent only because a fixed camera saw them</td><td class="n"></td><td class="n">' + N(sim(p.camAssisted), 'int') + '</td><td class="n"><strong data-k="cams">' + (P.agent ? '+' + p.camAssisted : 'needs the agent') + '</strong></td></tr>';
    if (P.triage) html += '<tr><td colspan="4"><em>Triage is a different kind of benefit: it returns no robot time.</em></td></tr>' + row('Engineering hours on no-fault-found tickets (fleet, 30 days)', t.noFaultFoundEngineeringHours, p.noFaultFoundEngineeringHours, 'f1') + row('Confirmed causes', t.confirmedCausePercent, p.confirmedCausePercent, 'pct0');
    html += '</tbody></table>';
    html += '<p class="small">Both columns face the same work: today\'s volume (' + N(sim(r.todayVolume), 'int') + ' pallet moves, from the calibrated Today run) plus ' + N(sim(r.headroom), 'pct0') + ' waiting. Your policy may complete at most today\'s volume x (1 + headroom). Pallet moves = moving hours x ' + N(A.palletsPerMovingHour, 'raw') + '.</p>';
    if (r.workRanOut && r.robotHoursReturned > 1) html += '<p class="note-line" data-k="ranout"><strong>Work ran out: freed time became idle time, not pallets.</strong></p>';
    html += Draw.svgComparisonBars([
      { a: t.shareMoving * 100, b: p.shareMoving * 100, aText: 'Today moving ' + (t.shareMoving * 100).toFixed(1) + '%', bText: 'Your policy ' + (p.shareMoving * 100).toFixed(1) + '%', diffText: ((p.shareMoving - t.shareMoving) * 100 >= 0 ? '+' : '') + ((p.shareMoving - t.shareMoving) * 100).toFixed(1) + ' pts' },
      { a: t.shareCharging * 100, b: p.shareCharging * 100, aText: 'Today charging ' + (t.shareCharging * 100).toFixed(1) + '%', bText: 'Your policy ' + (p.shareCharging * 100).toFixed(1) + '%', diffText: ((p.shareCharging - t.shareCharging) * 100 >= 0 ? '+' : '') + ((p.shareCharging - t.shareCharging) * 100).toFixed(1) + ' pts' },
      { a: t.emergencyLowBatteryStops, b: p.emergencyLowBatteryStops, aText: 'Today ' + t.emergencyLowBatteryStops + ' emergency stops', bText: 'Your policy ' + p.emergencyLowBatteryStops, diffText: (p.emergencyLowBatteryStops - t.emergencyLowBatteryStops >= 0 ? '+' : '') + (p.emergencyLowBatteryStops - t.emergencyLowBatteryStops) }
    ], { width: 440 }) + '<p class="small">Outline bar: Today. Solid bar: your policy. Simulated.</p>';
    html += '<div class="result-line" data-k="resultline">' + resultLine(r, P) + '</div>';
    if (P.agent) html += '<p class="small"><strong>Voice:</strong> a supervisor could start these recoveries from a phone instead of walking to a screen. Walk-ups avoided where the recovery agent handled the stop: ' + N(sim(p.walkUpsAvoided), 'int') + '. No time saving is claimed for voice.</p>';
    html += '<p class="small">Game results are a simulation using assumptions: direction, not a forecast. The swap is a proposal; this does not show that it works.</p>';
    return html;
  }
  function resultLine(r, P) {
    var t = r.today, p = r.policy, wh = r.wh || App.wh, bits = [];
    var pct = function (v) { return (v * 100).toFixed(1) + '%'; };
    if (P.swap) bits.push('On Warehouse ' + wh + ', battery swap ' + (p.shareMoving >= t.shareMoving ? 'raised' : 'changed') + ' the moving share from ' + pct(t.shareMoving) + ' to ' + pct(p.shareMoving) + ' and the charging share from ' + pct(t.shareCharging) + ' to ' + pct(p.shareCharging) + '. With only ' + p.packsInUse + ' spare pack' + (p.packsInUse === 1 ? '' : 's') + ' it fell back to the charger ' + p.chargerFallbacks + ' times' + (p.packsInUse === 0 ? ', so nothing changed' : '') + '; emergency low-battery stops went from ' + t.emergencyLowBatteryStops + ' to ' + p.emergencyLowBatteryStops + '.');
    if (P.agent) bits.push('The recovery agent handled ' + p.agentHandled + ' stops (' + p.humanClicks + ' needed a one-click approval); operator walk-ups went from ' + t.operatorWalkUps + ' to ' + p.operatorWalkUps + '.');
    if (P.swap) bits.push('With ' + p.operators + ' operator' + (p.operators === 1 ? '' : 's') + ' at the bay, each was busy ' + Math.round(p.operatorBusyShare * 100) + '% of the shift and a robot waited ' + p.swapWaitPerSwap.toFixed(1) + ' min on average for a free operator' + (p.operators === 1 && p.swapWaitPerSwap < 1 ? ', so a second operator would add little here.' : '.'));
    if (P.cams) bits.push(P.agent ? 'Fixed cameras let the agent fix ' + p.camAssisted + ' more camera-dependent stops (of ' + p.camEligible + ' that needed a person), using the assumed +' + Math.round((r.params || G.params).camUplift * 100) + ' points (an author estimate, not data). Few such stops need a person in a week at one site, so the gain is small, while the cameras cost money at every site (cost is not in the data): this is why the roadmap keeps fixed cameras for later.' : 'Fixed cameras changed nothing: only the recovery agent uses the pictures, and it is off.');
    if (P.triage) bits.push('Triage returned no robot time; it cut engineering hours on no-fault-found tickets from ' + t.noFaultFoundEngineeringHours.toFixed(0) + ' to ' + p.noFaultFoundEngineeringHours.toFixed(0) + ' (fleet, 30 days) and raised confirmed causes to ' + Math.round(p.confirmedCausePercent * 100) + '%.');
    if (!P.swap && !P.agent && !P.triage && !P.cams) bits.push('No policy is on, so the two runs are the same.');
    bits.push('Robot time returned: ' + r.robotHoursReturned.toFixed(1) + ' hours; extra pallet moves: ' + Math.round(r.extraPalletMoves) + (r.workRanOut && r.robotHoursReturned > 1 ? ' (work ran out)' : '') + '.');
    if (r.best) bits.push('This is the best case: every assumption at its most favourable end, so read it as a ceiling. Defaults give the more likely direction.');
    bits.push('Direction only: swap time, spare packs and the agent\'s success rate are assumed.');
    return bits.join(' ');
  }

  function runAverage() {
    var seeds = 20, i = 0, acc = [], btn = document.getElementById('g-avg'), t0 = performance.now(); btn.disabled = true;
    var o = opts(0);
    (function chunk() {
      var c = Sim.compare(Object.assign({}, o, { seed: i + 1 })); acc.push(c); i++;
      var pr = document.getElementById('g-prog'); if (pr) { pr.style.width = (100 * i / seeds) + '%'; pr.parentNode.setAttribute('aria-valuenow', String(Math.round(100 * i / seeds))); }
      if (i < seeds) setTimeout(chunk, 0);
      else {
        G.avg = { list: acc, wh: App.wh, ms: performance.now() - t0, policy: JSON.parse(JSON.stringify(G.policy)) }; btn.disabled = false;
        window.App.lastAvg = { ms: G.avg.ms, n: acc.length };
        var out = document.getElementById('g-out'); if (out) out.innerHTML = (G.last ? scoreboard(G.last) : '') + avgTable(G.avg);   // the reader may have left the Game screen
      }
    })();
  }
  function avgTable(a) {
    function stat(fn) { var v = a.list.map(fn), m = v.reduce(function (x, y) { return x + y; }, 0) / v.length; return { m: m, lo: Math.min.apply(null, v), hi: Math.max.apply(null, v) }; }
    function line(label, fn, f) { var s = stat(fn); return '<tr><td>' + label + '</td><td class="n">' + N(sim(s.m), f) + '</td><td class="n">' + UI.fmtNum(s.lo, f) + ' to ' + UI.fmtNum(s.hi, f) + '</td></tr>'; }
    return '<h3>Average of ' + a.list.length + ' runs (seeds 1 to ' + a.list.length + '), Warehouse ' + a.wh + ' ' + tag('simulated') + '</h3><table class="score" data-k="avg"><thead><tr><th>difference (policy minus Today)</th><th class="n">mean</th><th class="n">range</th></tr></thead><tbody>' +
      line('Robot time returned (hours)', function (c) { return c.robotHoursReturned; }, 'f1') + line('Extra pallet moves', function (c) { return c.extraPalletMoves; }, 'int') +
      line('Share moving (points)', function (c) { return 100 * (c.policy.shareMoving - c.today.shareMoving); }, 'f1') + line('Share charging (points)', function (c) { return 100 * (c.policy.shareCharging - c.today.shareCharging); }, 'f1') +
      line('Emergency low-battery stops', function (c) { return c.policy.emergencyLowBatteryStops - c.today.emergencyLowBatteryStops; }, 'f1') + line('Operator walk-ups', function (c) { return c.policy.operatorWalkUps - c.today.operatorWalkUps; }, 'f1') +
      (a.policy.swap ? line('Average wait for a free operator (min per swap)', function (c) { return c.policy.swapWaitPerSwap; }, 'f1') + line('Operator busy (share of the shift, each)', function (c) { return c.policy.operatorBusyShare; }, 'pct0') : '') +
      (a.policy.cams && a.policy.agent ? line('Stops fixed thanks to fixed cameras', function (c) { return c.policy.camAssisted; }, 'f1') : '') +
      '</tbody></table><p class="small">Computed in ' + (a.ms / 1000).toFixed(1) + ' s, one seed at a time so the page stays responsive. Direction only.</p>';
  }

  UI.register('game', function () { render(); });
  App.on('warehouse', function () { if (App.screen === 'work' && App.mode === 'game') { G.running = false; G.last = null; G.avg = null; render(); } });
  window.Game = { bestCase: bestCase, renderLogic: renderLogic, frame: frame, state: G, render: render, runWeek: runWeek, runAverage: runAverage, defaults: defaults };
})();
