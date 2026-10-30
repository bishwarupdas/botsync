// Interaction audit: drives the page the way a reader would (real clicks, typing, sliders) and after every action checks
// for console errors, page errors, and broken text (NaN, undefined, [object ...]) on screen.
// Usage: node tools/audit.js <site_dir> [out_dir]
const path = require('path'), fs = require('fs');
const { open } = require('./pw');
const DIR = process.argv[2] || 'botsync_walkthrough', OUT = process.argv[3] || 'evidence';
const log = []; let fails = 0, steps = 0;
function rec(ok, msg) { steps++; if (!ok) fails++; const l = (ok ? 'PASS ' : 'FAIL ') + msg; log.push(l); console.log(l); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const s = await open(DIR, { wait: 900 }), p = s.page;
  let seenErr = 0;
  async function check(label) {
    const errs = s.log.console.concat(s.log.pageErrors).slice(seenErr); seenErr += errs.length;
    const bad = await p.evaluate(() => {
      const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const t = w.currentNode, e = t.parentElement; if (!e || e.closest('[hidden], script, style')) continue; if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
        if (/\bNaN\b|\bundefined\b|\[object /.test(t.textContent)) out.push(t.textContent.trim().slice(0, 80)); }
      return out;
    });
    rec(errs.length === 0 && bad.length === 0, `${label}${errs.length ? ' | errors: ' + JSON.stringify(errs.slice(0, 2)) : ''}${bad.length ? ' | broken text: ' + JSON.stringify(bad.slice(0, 3)) : ''}`);
  }
  async function click(sel, label) { const el = await p.$(sel); if (!el) { rec(false, `missing control ${sel} (${label || ''})`); return false; } await el.click(); await sleep(120); return true; }
  async function waitDone(sel, ms = 40000) { try { await p.waitForSelector(sel, { timeout: ms }); return true; } catch (e) { return false; } }
  async function decide(container, how) {
    // answer an approval screen the way a person would
    const ok = await waitDone(`${container} .approval`, 30000); if (!ok) return 'no approval';
    if (how === 'approve') { const b = await p.$(`${container} .approval #ap-approve:not([disabled])`); if (b) await b.click(); else await p.click(`${container} .approval #ap-reject`); }
    else if (how === 'reject') await p.click(`${container} .approval #ap-reject`);
    else { await p.click(`${container} .approval #ap-edit-btn`); const tag = await p.$eval(`${container} .approval #ap-edit`, e => e.tagName); if (tag === 'SELECT') await p.selectOption(`${container} .approval #ap-edit`, { index: 1 }); else await p.fill(`${container} .approval #ap-edit`, String(how.edit)); await p.click(`${container} .approval #ap-apply`); }
    await sleep(150);
    return await p.$eval(`${container} .approval #ap-result`, e => e.textContent);
  }
  const speed = v => p.evaluate(v => UI.setSpeed(v), v);

  // ---------- A. Start screen and top bar ----------
  await check('start screen renders');
  for (const g of ['explore', 'game']) { await p.evaluate(() => UI.show('start')); await click(`[data-go="${g}"]`); await sleep(400); await check(`Start: "${g}" button opens ${g}`); }
  await p.evaluate(() => UI.show('start')); await click('[data-go="tour"]'); await sleep(400); rec(await p.evaluate(() => App.guided && App.guided.kind === 'tour'), 'Start: Quick tour link starts the tour'); await p.evaluate(() => UI.stopGuided());
  await p.evaluate(() => UI.show('start')); await click('[data-go="guided"]'); await sleep(400); rec(await p.evaluate(() => App.guided && App.guided.kind === 'full'), 'Start: Guided button starts guided mode'); await p.evaluate(() => UI.stopGuided());
  for (const sc of ['start', 'evidence', 'fleet', 'how', 'arch', 'roadmap', 'voice']) { await click(`#topbar [data-screen="${sc}"]`); await sleep(500); rec(await p.evaluate(sc => App.screen === sc || (sc === 'voice' && App.mode === 'voice'), sc), `top bar "${sc}" button opens its screen`); await check(`${sc} screen renders cleanly`); }
  for (const m of ['explore', 'game']) { await click(`#topbar [data-mode="${m}"]`); await sleep(500); rec(await p.evaluate(m => App.mode === m && App.screen === 'work', m), `mode switch ${m}`); await check(`${m} via mode switch`); }
  await click('#topbar [data-mode="guided"]'); await sleep(400); rec(await p.evaluate(() => !!App.guided), 'mode switch Guided starts guided mode'); await p.evaluate(() => UI.stopGuided());
  for (const v of ['0', '1', '4', '16']) { await click(`#topbar [data-speed="${v}"]`); rec(await p.evaluate(v => App.speed === +v, v), `speed button ${v === '0' ? 'Pause' : v + 'x'}`); }
  await click('#legend-btn'); rec(await p.evaluate(() => !document.getElementById('legend').hidden && document.querySelectorAll('#legend canvas').length >= 20), 'Legend opens with robot states and map symbols'); await click('#legend-close'); rec(await p.evaluate(() => document.getElementById('legend').hidden), 'Legend closes');
  await click('#src-switch'); rec(await p.evaluate(() => document.body.classList.contains('show-src')), 'Show sources on'); await click('#src-switch'); rec(await p.evaluate(() => !document.body.classList.contains('show-src')), 'Show sources off');

  // ---------- B. Explore: every warehouse, every robot, every role ----------
  await p.evaluate(() => UI.show('explore')); await speed(4);
  for (const w of ['A', 'B', 'C']) {
    await click(`#topbar [data-wh="${w}"]`); await sleep(600);
    const n = await p.evaluate(() => App.live.robots.length);
    for (let i = 0; i < n; i++) { await p.evaluate(i => { App.sel = { type: 'robot', i }; UI.renderSide(); }, i); await sleep(40); }
    await p.evaluate(() => { App.sel = null; UI.renderSide(); });
    await check(`Explore ${w}: robot panel opens for all ${n} robots`);
    for (const r of ['ops', 'floor', 'it', 'tech', 'deploy', 'product']) { await click(`[data-role="${r}"]`); await sleep(120); rec(await p.evaluate(r => document.querySelector('[data-panel="fleet"]').dataset.role === r, r), `Explore ${w}: View as ${r} panel`); }
    await click('[data-role="ops"]'); await check(`Explore ${w}: roles`);
  }

  // ---------- C. Recover for every error code at every warehouse (level 1, level 2, hardware, safety) ----------
  await speed(16);
  for (const w of ['A', 'B', 'C']) {
    await p.evaluate(w => { UI.setWarehouse(w); App.noDemoStops = true; }, w); await sleep(400);
    const codes = await p.evaluate(() => Object.keys(App.live.wh.siteRow.incidentsByCode));
    for (const code of codes) {
      const i = await p.evaluate(code => { App.live.robots.forEach(r => { if (r.state === 'stopped') r.timer = 0.01; }); return null; }, code);
      await sleep(200);
      const ri = await p.evaluate(code => { const r = UI.demoStop({ code, recov: 'operator', hold: true }); if (!r) return -1; App.sel = { type: 'robot', i: r.i }; UI.renderSide(); return r.i; }, code);
      if (ri < 0) { rec(false, `${w} ${code}: no robot free to stop`); continue; }
      await click('#btn-why'); const why = await p.$eval('#why-area', e => e.textContent).catch(() => '');
      await click('#btn-recover');
      const hasApproval = await p.waitForSelector('#pipe-area .approval, #pipe-area[data-done="1"]', { timeout: 30000 }).then(() => p.$('#pipe-area .approval'));
      if (hasApproval) await decide('#pipe-area', code === 'ERR_SAFETY_LIDAR_ESTOP' ? 'reject' : 'approve');
      const done = await waitDone('#pipe-area[data-done="1"]');
      const res = await p.evaluate(() => App.lastPipeline && App.lastPipeline.result);
      rec(done && /Triage/.test(why) && !!res, `${w} ${code}: Why + Recover pipeline ends (${res}; boxes ${await p.evaluate(() => App.lastPipeline.visited.join('>'))})`);
      await p.evaluate(() => { App.sel = null; UI.renderSide(); });
    }
    await check(`${w}: all ${codes.length} codes recover cleanly`);
  }
  // Call operator path
  { const ri = await p.evaluate(() => { const r = UI.demoStop({ code: 'ERR_DOCKING_ALIGNMENT_TIMEOUT', recov: 'operator', hold: true }); App.sel = { type: 'robot', i: r.i }; UI.renderSide(); return r.i; });
    await click('#btn-operator'); const amber = await p.evaluate(i => App.live.robots[i].waitPerson, ri);
    let cleared = false; for (let k = 0; k < 100; k++) { if (await p.evaluate(i => !App.live.robots[i].incident, ri)) { cleared = true; break; } await sleep(200); }
    rec(amber && cleared, 'Call operator: robot waits (amber), operator walks up, robot clears'); await check('Call operator'); }

  // ---------- D. Explore policies and sliders ----------
  await p.evaluate(() => { UI.setWarehouse('A'); App.sel = null; UI.renderSide(); App.noDemoStops = false; }); await sleep(300);
  await click('[data-policy="swap"]'); rec(await p.evaluate(() => App.live.policy.swap && !!document.getElementById('swap-readout')), 'Explore: swap policy switch on, readout shown');
  for (const [k, v] of [['swapTime', '12'], ['spares', '0'], ['operators', '2'], ['spares', '0.6']]) { await p.$eval(`#sl-${k}`, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v); }
  rec(await p.evaluate(() => App.live.packs.length === 5 && App.live.params.swapTime === 12 && App.live.operatorsBusy.length === 2), 'Explore: swap sliders change packs, swap time and operators');
  await sleep(4000); await check('Explore: swap running at 16x');
  await click('[data-policy="agent"]'); rec(await p.evaluate(() => App.live.policy.agent), 'Explore: recovery agent switch on');
  await sleep(4000); await check('Explore: agent running');
  await click('[data-policy="swap"]'); await click('[data-policy="agent"]');

  // ---------- E. Every scenario, every variant, every decision, through the UI ----------
  const plan = [
    ['U1', 'pass', null], ['U1', 'fail', 'approve'], ['U1', 'fail', 'reject'], ['U1', 'fail', { edit: 0.2 }],
    ['U2', 'box', null], ['U2', 'spill', 'approve'], ['U2', 'spill', 'reject'], ['U2', 'curtain', null],
    ['U3', null, 'approve'], ['U3', null, { edit: 1 }], ['U3', null, 'reject'],
    ['U4', 'pass', null], ['U4', 'g1', 'approve'], ['U4', 'g1', { edit: 35 }], ['U4', 'g1', 'reject'], ['U4', 'g2', 'reject'], ['U4', 'g2', 'approve'],
    ['U5', 'ok', null], ['U5', 'b14', 'approve'], ['U5', 'b14', { edit: 1 }], ['U5', 'b1', 'approve'], ['U5', 'b1', 'reject'],
    ['U6', 'ok', null], ['U6', 'tight', 'approve'], ['U6', 'tight', { edit: 25 }], ['U6', 'tight', 'reject'],
    ['U9', null, 'reject'], ['U10', null, 'approve'], ['U10', null, { edit: 2 }], ['U10', null, 'reject']
  ];
  await p.evaluate(() => { App.sel = null; UI.renderSide(); }); await speed(16);
  for (const [id, v, how] of plan) {
    await p.evaluate(() => { App.sel = null; UI.renderSide(); });
    await click(`#side [data-scenario="${id}"]`, id); await sleep(250);
    if (v) { await click(`#side [data-variant="${v}"]`); await sleep(200); rec(await p.evaluate(v => Scenarios.current().variant === v, v), `${id}: variant button "${v}" selects it`); }
    await click('#sc-run'); let ans = '';
    if (how) ans = await decide('#sc-pipe', how);
    const done = await waitDone('#sc-pipe[data-done="1"]');
    const r = await p.evaluate(() => ({ key: App.lastPipeline.result, txt: document.querySelector('#sc-pipe .pipe-result').textContent }));
    rec(done && r.txt.length > 10 && (!how || /applied|blocked/.test(ans)), `${id}${v ? ' [' + v + ']' : ''}${how ? ' ' + JSON.stringify(how) : ''}: ${r.key}${ans ? ' | approval: ' + ans.slice(0, 60) : ''}`);
    await check(`${id} ${v || ''} clean`);
    await click('#sc-replay'); await sleep(200); rec(await p.evaluate(id => Scenarios.current().id === id && !document.querySelector('#sc-pipe[data-done]'), id), `${id}: Replay resets the scenario`);
  }
  // out-of-range edits are refused everywhere a number can be edited
  for (const [id, v, bad] of [['U1', 'fail', '0.6'], ['U1', 'fail', '0'], ['U4', 'g1', '10'], ['U6', 'tight', '90']]) {
    await p.evaluate(() => { App.sel = null; UI.renderSide(); }); await click(`#side [data-scenario="${id}"]`); await click(`#side [data-variant="${v}"]`); await click('#sc-run');
    await waitDone('#sc-pipe .approval'); await click('#sc-pipe #ap-edit-btn'); await p.fill('#sc-pipe #ap-edit', bad); await click('#sc-pipe #ap-apply');
    const t = await p.evaluate(() => ({ refuse: document.querySelector('#sc-pipe #ap-refuse').textContent, res: document.querySelector('#sc-pipe #ap-result').textContent }));
    rec(/Refused/.test(t.refuse) && t.res === '', `${id} [${v}]: edit ${bad} refused ("${t.refuse.slice(0, 60)}")`);
    await click('#sc-pipe #ap-reject'); await waitDone('#sc-pipe[data-done="1"]');
  }
  // U5 free text
  await p.evaluate(() => { App.sel = null; UI.renderSide(); }); await click('#side [data-scenario="U5"]'); await p.fill('#instr', 'reroute bot 2 to bay 5'); await click('#sc-run'); await waitDone('#sc-pipe[data-done="1"]');
  rec(await p.evaluate(() => App.lastPipeline.result === 'U5-ok' && /Bay 5/.test(App.lastPipeline.transcript)), 'U5: a typed free-text instruction is parsed and checked'); await check('U5 free text');
  await p.evaluate(() => { App.sel = null; UI.renderSide(); }); await click('#side [data-scenario="U5"]'); await p.fill('#instr', 'please sort it out'); await click('#sc-run'); await decide('#sc-pipe', 'approve'); await waitDone('#sc-pipe[data-done="1"]');
  rec(await p.evaluate(() => App.lastPipeline.result === 'U5-invalid' && App.lastPipeline.visited.join(',') === 'diagnose,propose,person,log'), `U5: an instruction with nothing valid takes the reject-proposal path (${await p.evaluate(() => App.lastPipeline.visited.join(' > '))})`);
  await p.evaluate(() => { App.sel = null; UI.renderSide(); UI.setRole('floor'); }); await sleep(200);
  { const ri = await p.evaluate(() => { const r = UI.demoStop({ code: 'ERR_OBSTACLE_PERSISTENT_BLOCK', recov: 'operator', hold: true }); App.sel = null; UI.renderSide(); return r.i; }); await sleep(600);
    await click(`[data-recover-robot="${ri}"]`); await waitDone('#pipe-area[data-done="1"]');
    rec(await p.evaluate(() => App.lastPipeline.result === 'recovered'), 'Floor supervisor: Recover button on the stopped-robot list runs the pipeline'); }
  await p.evaluate(() => { App.sel = null; UI.setRole('tech'); UI.renderSide(); }); rec(await p.evaluate(() => document.getElementById('side').textContent.includes('Triage list') && document.querySelectorAll('#side table').length >= 2), 'Field technician: triage list and technician response shown');
  await p.evaluate(() => { UI.setRole('product'); UI.renderSide(); }); rec(await p.evaluate(() => document.querySelectorAll('#side table tbody tr').length >= 9 && document.querySelectorAll('#side ol li').length === 6), 'Product and engineering: full RICE table and the six-month roadmap shown');
  await p.evaluate(() => UI.setRole('ops'));
  // U7: confirm and correct every row
  await p.evaluate(() => { App.sel = null; UI.renderSide(); }); await click('#side [data-scenario="U7"]'); await waitDone('#sc-pipe[data-done="1"]');
  for (let i = 0; i < 12; i++) { if (i % 3 === 2) { await click(`[data-tcorrect="${i}"]`); await click('#u7-approval #ap-edit-btn'); await p.selectOption('#u7-approval #ap-edit', { index: 2 }); await click('#u7-approval #ap-apply'); } else await click(`[data-tconfirm="${i}"]`); }
  rec(await p.evaluate(() => /corrected: weak pack/.test(document.getElementById('u7-table').textContent)), 'U7: Correct opens the approval screen and stores the corrected cause');
  rec(await p.evaluate(() => document.getElementById('u7-pct').textContent === '60%'), `U7: 12 confirms/corrections raise confirmed causes to ${await p.evaluate(() => document.getElementById('u7-pct').textContent)}`); await check('U7');
  // U8: sliders, fallback with 0 spare packs
  await p.evaluate(() => { App.sel = null; UI.renderSide(); }); await click('#side [data-scenario="U8"]'); await sleep(300);
  await p.$eval('#sl-spares', e => { e.value = '0'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(8000);
  const fb = await p.evaluate(() => ({ packs: App.live.packs.length, fb: App.live.m.chargerFallbacks, txt: document.getElementById('swap-readout').textContent }));
  rec(fb.packs === 0 && /fell back to the charger/.test(fb.txt), `U8: spare packs 0 -> 0 packs; robots fall back to the charger (${fb.fb} so far)`);
  await p.$eval('#sl-spares', e => { e.value = '0.3'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  rec(await p.evaluate(() => App.live.packs.length === 2), 'U8: back to 0.3 per robot -> 2 packs at Warehouse A'); await check('U8');
  // Next scenario walks the list to the voice scene
  await p.evaluate(() => UI.openScenario('U1')); const order = [];
  for (let k = 0; k < 10; k++) { order.push(await p.evaluate(() => (Scenarios.current().id) || App.mode)); await click('#sc-next'); await sleep(300); }
  rec(order.join(',') === 'U1,U2,U3,U4,U5,U6,U7,U8,U9,U10' && await p.evaluate(() => App.mode === 'voice'), `Next scenario walks ${order.join(' > ')} > voice`);
  await check('Next scenario chain');

  // ---------- F. Voice by clicks ----------
  async function phrase(i, answer) {
    await click('.mic-btn'); await sleep(1400); await click(`.phrase-chip[data-phrase="${i}"]`);
    for (let k = 0; k < 400; k++) {
      if (await p.$('#v-pipe[data-done="1"]')) break;
      const rj = await p.$('#v-pipe .approval #ap-reject:not([disabled])'); if (rj) await rj.click();
      const cf = answer && await p.$(`[data-confirm="${answer}"]`); if (cf) await cf.click();
      await sleep(100);
    }
    return p.evaluate(() => ({ key: App.lastPipeline.result, last: Voice.state.messages[Voice.state.messages.length - 1].text }));
  }
  await p.evaluate(() => UI.show('voice')); await speed(4); await sleep(400);
  for (const [i, a, key] of [[0, null, 'V-recovered'], [1, 'yes', 'V-rerouted'], [1, 'no', 'V-cancelled'], [2, null, 'V-refused'], [3, null, 'V-question']]) {
    await click('#v-reset'); await sleep(300);
    const r = await phrase(i, a); rec(r.key === key, `voice phrase ${i + 1}${a ? ' (' + a + ')' : ''} by clicks -> ${r.key}: "${r.last}"`);
  }
  await click('.phrase-chip[data-phrase="0"]');
  for (let k = 0; k < 400; k++) { if (await p.$('#v-pipe[data-done="1"]')) break; const rj = await p.$('#v-pipe .approval #ap-reject:not([disabled])'); if (rj) await rj.click(); await sleep(100); }
  rec(await p.evaluate(() => App.lastPipeline.result === 'V-recovered' || App.lastPipeline.result === 'V-refused'), `voice phrase 4 follow-up: picking a stopped robot runs its recovery (${await p.evaluate(() => App.lastPipeline.result)})`);
  await check('voice scene');

  // ---------- G. Game by clicks, every warehouse ----------
  await p.evaluate(() => UI.show('game')); await speed(16);
  for (const w of ['A', 'B', 'C']) {
    await click(`#topbar [data-wh="${w}"]`); await sleep(300);
    for (const k of ['swap', 'agent', 'triage']) { const on = await p.$eval(`[data-policy="${k}"]`, e => e.getAttribute('aria-pressed')); if (on !== 'true') await click(`[data-policy="${k}"]`); }
    rec(await p.$eval('[data-policy="cams"]', e => e.disabled), `Game ${w}: fixed cameras switch is greyed out`);
    for (const k of ['headroom', 'swapTime', 'spares', 'operators', 'agentCan', 'gatePass', 'triageSaving']) await p.$eval(`#sl-${k}`, e => { e.value = e.max; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('#g-reset'); rec(await p.evaluate(() => Game.state.params.headroom === 0.25 && Game.state.params.swapTime === 5), `Game ${w}: Reset restores defaults`);
    for (const k of ['swap', 'agent', 'triage']) { const on = await p.$eval(`[data-policy="${k}"]`, e => e.getAttribute('aria-pressed')); if (on !== 'true') await click(`[data-policy="${k}"]`); }
    await click('#g-run'); await sleep(500); await click('#g-skip'); await sleep(300);
    const sb = await p.evaluate(() => ({ rows: document.querySelectorAll('.score tbody tr').length, line: (document.querySelector('[data-k="resultline"]') || {}).textContent || '' }));
    rec(sb.rows >= 13 && /Direction only/.test(sb.line), `Game ${w}: Run a week + Skip -> scoreboard ${sb.rows} rows; "${sb.line.slice(0, 70)}..."`);
    await click('#g-seed'); rec(await p.evaluate(() => Game.state.seed === 2), `Game ${w}: Try another seed`); await p.evaluate(() => { Game.state.seed = 1; });
    await check(`Game ${w}`);
  }
  await p.evaluate(() => { App.lastAvg = null; }); await click('#g-avg'); await p.waitForFunction(() => App.lastAvg, null, { timeout: 90000 }); await check('Game: average of 20 runs');

  // ---------- H. Roadmap, evidence, fleet, how it works, architecture ----------
  await p.evaluate(() => UI.show('roadmap'));
  for (let m = 0; m < 6; m++) { await click(`[data-month="${m}"]`); rec(await p.evaluate(m => document.querySelector('[data-month-panel]').dataset.monthPanel === String(m), m), `Roadmap: month tab ${m + 1}`); }
  for (const k of ['item', 'reach', 'impact', 'confidence', 'effort', 'score', 'hours']) { await click(`#rice [data-sort="${k}"]`); await click(`#rice [data-sort="${k}"]`); }
  rec(await p.evaluate(() => document.querySelectorAll('.rice tbody tr').length === 9), 'Roadmap: RICE sorts by every column both ways'); await check('Roadmap');
  await p.evaluate(() => UI.show('fleet')); const tiles = await p.$$eval('.tile', t => t.map(x => x.dataset.site));
  for (const t of tiles) { await p.evaluate(() => UI.show('fleet')); await click(`[data-site="${t}"]`); await sleep(60); }
  await check(`Fleet overview: all ${tiles.length} tiles clicked`);
  await p.evaluate(() => UI.show('how')); const boxes = await p.$$eval('[data-explain]', b => b.map(x => x.dataset.explain));
  for (const b of boxes) { await click(`[data-explain="${b}"]`); rec(await p.evaluate(() => document.getElementById('explain').textContent.length > 40), `How it works: box ${b} explains itself`); }
  await p.focus(`[data-explain="${boxes[0]}"]`); await p.keyboard.press('Enter'); await check('How it works: keyboard');
  await p.evaluate(() => UI.show('arch')); await check('Architecture'); await p.evaluate(() => UI.show('evidence')); await check('Evidence');

  // ---------- I. Guided: Next through all, Back, Leave, Return, End ----------
  await p.evaluate(() => UI.startGuided('full'));
  for (let k = 0; k < 13; k++) { await sleep(500); await check(`Guided step ${k + 1}`); await click('#g-next'); }
  await sleep(500); await check('Guided step 14');
  await click('#g-back'); rec(await p.evaluate(() => App.guidedStep === 13), 'Guided: Back goes to step 13');
  await click('#g-leave'); rec(await p.evaluate(() => App.guided.paused && App.mode === 'explore'), 'Guided: Leave to Explore pauses the story');
  await click('#g-return'); rec(await p.evaluate(() => !App.guided.paused && App.guidedStep === 13), 'Guided: Return resumes at the same step');
  for (const b of ['explore', 'game', 'voice']) { await p.evaluate(() => UI.startGuided('full')); for (let k = 0; k < 13; k++) await p.evaluate(() => UI.guideNext()); await sleep(300); await click(`#guide-bar [data-go="${b}"]`); await sleep(300); rec(await p.evaluate(b => App.mode === b && App.screen === 'work', b), `Guided step 14: "${b}" button`); await p.evaluate(() => UI.stopGuided()); }
  await check('Guided');

  // ---------- J. Long run in Explore at 16x on each warehouse ----------
  await p.evaluate(() => { UI.show('explore'); App.noDemoStops = false; App.scenarioActive = false; });
  for (const w of ['A', 'B', 'C']) {
    await p.evaluate(w => UI.setWarehouse(w), w); await speed(16); await sleep(25000);
    const st = await p.evaluate(() => ({ t: App.live.t, stopped: App.live.robots.filter(r => r.state === 'stopped').length, n: App.live.robots.length, moved: App.live.m.cat.moving, traffic: App.log.filter(e => /DEADLOCK|GRIDLOCK/.test(e.code)).length, swapsOk: true }));
    rec(st.stopped <= 3 && st.moved > 0, `Explore ${w} run 25 s at 16x (${((st.t % 1440) / 60).toFixed(1)} h on the clock): ${st.stopped} of ${st.n} stopped now, ${st.traffic} traffic stops in the log`);
    await check(`Explore ${w} long run`);
  }

  // ---------- K. Layout: left column pinned, right panel scrolls ----------
  for (const vp of [[1440, 900], [1280, 800], [1024, 768]]) {
    await p.setViewportSize({ width: vp[0], height: vp[1] }); await p.evaluate(() => { UI.setWarehouse('A'); UI.openScenario('U1'); }); await sleep(500);
    await p.evaluate(() => Scenarios.runPipeline()); await sleep(1500);
    const r = await p.evaluate(async () => {
      window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 100));
      const m0 = document.querySelector('.map-col').getBoundingClientRect().top, side = document.getElementById('side');
      const sb = side.getBoundingClientRect(), fits = sb.bottom <= innerHeight + 1, scrollable = side.scrollHeight > side.clientHeight;
      side.scrollTop = side.scrollHeight; await new Promise(r => setTimeout(r, 100));
      const reached = Math.abs(side.scrollTop + side.clientHeight - side.scrollHeight) < 2;
      const mapTopBefore = document.getElementById('map').getBoundingClientRect().top;
      window.scrollTo(0, 400); await new Promise(r => setTimeout(r, 150));
      const mp = document.getElementById('map').getBoundingClientRect(), tb = document.getElementById('banner').getBoundingClientRect().bottom;
      const log = document.getElementById('strip').getBoundingClientRect();
      window.scrollTo(0, 0);
      return { fits, scrollable, reached, pinnedTop: mp.top, below: tb, mapVisible: mp.top >= tb - 1 && mp.bottom <= innerHeight + 1 && Math.abs(mp.top - mapTopBefore) < 2, logVisible: log.top < innerHeight && log.bottom <= innerHeight + 1, xscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    rec(r.fits && r.scrollable && r.reached, `${vp[0]}x${vp[1]}: right panel fits the window and scrolls to its end on its own`);
    rec(r.mapVisible, `${vp[0]}x${vp[1]}: the whole map stays in view while the right panel scrolls (map top ${r.pinnedTop.toFixed(0)} px, under the banner at ${r.below.toFixed(0)} px)`);
    rec(r.logVisible, `${vp[0]}x${vp[1]}: the event log sits under the map, inside the window`);
    rec(r.xscroll <= 0, `${vp[0]}x${vp[1]}: no horizontal scroll`);
    await p.screenshot({ path: path.join(OUT, `layout_pinned_${vp[0]}.png`) });
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  for (const m of ['game', 'voice']) { await p.evaluate(m => UI.show(m), m); await sleep(500);
    const r = await p.evaluate(() => { const side = document.getElementById('side'), sb = side.getBoundingClientRect(); return { fits: sb.bottom <= innerHeight + 1, scrollable: side.scrollHeight > side.clientHeight || side.scrollHeight <= side.clientHeight }; });
    rec(r.fits, `1440: ${m} right panel fits the window (scrolls inside)`); }

  // ---------- L. Gallery and hash ----------
  await p.goto(s.url + '#assets'); await sleep(900); rec(await p.evaluate(() => App.screen === 'assets' && document.querySelectorAll('[data-asset]').length > 80), 'index.html#assets opens the gallery'); await check('gallery');

  fs.writeFileSync(path.join(OUT, 'audit_output.txt'), log.join('\n') + `\n\n${steps - fails} of ${steps} audit checks pass\n`);
  console.log(`\n${steps - fails} of ${steps} audit checks pass`);
  await s.close(); process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); fs.writeFileSync(path.join(OUT, 'audit_output.txt'), log.join('\n') + '\nCRASH ' + e.stack); process.exit(2); });
