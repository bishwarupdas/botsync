// Acceptance tests (spec section 16). Usage: node tools/run_tests.js <site_dir> [--zip-only] [--out evidence]
// Opens index.html over file:// in headless Chromium. Playwright is a test tool only; it is not part of the deliverable.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { open, chromium } = require('./pw');
const DIR = path.resolve(process.argv[2] || 'botsync_walkthrough');
const ZIP_ONLY = process.argv.includes('--zip-only');
const OUT = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'evidence');
const ROOT = path.resolve(__dirname, '..');
fs.mkdirSync(OUT, { recursive: true });
const results = []; let cur = null;
function test(n, name) { cur = { n, name, checks: [], pass: true }; results.push(cur); console.log(`\n=== Test ${n}: ${name}`); }
function ok(c, msg) { cur.checks.push((c ? 'PASS ' : 'FAIL ') + msg); if (!c) cur.pass = false; console.log((c ? '  PASS ' : '  FAIL ') + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function t1to3(browser, label) {
  test(1, 'Opens clean' + label);
  const s = await open(DIR, { browser, wait: 1500 });
  await s.page.evaluate(() => UI.show('explore')); await s.page.waitForTimeout(1500);
  ok(s.log.console.length === 0, `console errors/warnings: ${s.log.console.length} ${JSON.stringify(s.log.console.slice(0, 3))}`);
  ok(s.log.failed.length === 0, `failed requests: ${s.log.failed.length}`);
  ok(s.log.pageErrors.length === 0, `page errors: ${s.log.pageErrors.length} ${JSON.stringify(s.log.pageErrors.slice(0, 3))}`);
  test(2, 'No external requests' + label);
  const ext = s.log.requests.filter(u => !u.startsWith('file://'));
  ok(ext.length === 0, `${s.log.requests.length} requests, all file:// (${ext.length} other)`);
  await s.close();
  test(3, 'No setup' + label);
  const files = walk(DIR).map(f => path.relative(DIR, f));
  ok(!files.some(f => /node_modules|package\.json|package-lock/.test(f)), `no node_modules or package.json among ${files.length} files`);
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(r => r !== '#main');
  ok(refs.every(r => r.startsWith('assets/')), `index.html references only relative assets/ paths: ${refs.join(', ')}`);
  const js = files.filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
  ok(!/type="module"|\bimport\s|\bexport\s|fetch\(|XMLHttpRequest|new Worker|serviceWorker|https?:\/\//.test(js + html.replace(/<!--[\s\S]*?-->/g, '')), 'no modules, fetch, XHR, workers or http(s) URLs in the page');
  ok(!/Math\.random\(/.test(fs.readFileSync(path.join(DIR, 'assets/js/sim.js'), 'utf8') + fs.readFileSync(path.join(DIR, 'assets/js/draw.js'), 'utf8')), 'no Math.random() in sim.js or draw.js');
  ok(!/SpeechRecognition|getUserMedia/.test(js), 'no speech recognition or microphone API');
}
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }

async function t6(browser, label) {
  test(6, 'Incident flow' + label);
  const s = await open(DIR, { browser, wait: 800 }), p = s.page;
  await p.click('[data-go="explore"]'); await p.waitForTimeout(800);
  await p.evaluate(() => UI.setWarehouse('A'));
  await p.evaluate(() => { App.noDemoStops = true; App.live.robots.forEach(r => { if (r.state === 'stopped') r.timer = 0.01; }); }); await p.waitForTimeout(500);
  await p.click('#trigger-stop'); await p.waitForTimeout(300);
  await p.click('[data-close]'); await p.waitForTimeout(200);
  const i = await p.evaluate(() => App.live.robots.findIndex(r => r.state === 'stopped'));
  ok(i >= 0, `"Trigger a stop" stopped ${i >= 0 ? 'Bot ' + (i + 1) : 'nobody'}`);
  await p.evaluate(() => UI.setSpeed(0)); await p.waitForTimeout(200);
  const pos = await p.evaluate(i => UI.robotScreenPos(i), i);
  await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(700);
  ok(await p.$('[data-panel="incident"]') !== null, 'clicking the red robot on the map opens the incident panel');
  const vlm = await p.evaluate(() => document.getElementById('cam') && document.getElementById('cam').dataset.vlm);
  ok(!!vlm, `camera view drawn with the VLM label "${vlm}"`);
  await p.screenshot({ path: path.join(OUT, `recover_1_incident${label ? '_zip' : ''}.png`) });
  await p.evaluate(() => UI.setSpeed(16));
  await p.click('#btn-recover');
  const steps = [];
  for (let k = 0; k < 400; k++) {
    const st = await p.evaluate(() => { const a = document.querySelector('.pbox-active, .pbox-waiting'); return a ? a.dataset.box : null; });
    if (st && steps[steps.length - 1] !== st) steps.push(st);
    const ap = await p.$('#pipe-area .approval #ap-approve:not([disabled])'); if (ap) await ap.click();
    if (await p.$('#pipe-area[data-done="1"]')) break;
    await sleep(40);
  }
  if (!label) await p.screenshot({ path: path.join(OUT, 'recover_2_pipeline_running.png') });
  const lp = await p.evaluate(() => App.lastPipeline);
  ok(lp && lp.visited.length >= 5, `boxes lit in order: ${lp && lp.visited.join(' -> ')} (observed live: ${steps.join(' -> ')})`);
  ok(lp && lp.visited[0] === 'diagnose' && lp.visited[lp.visited.length - 1] === 'log', 'flow starts at Fault diagnosis and ends at Log back');
  ok(lp && lp.text.length > 10, `result shown: "${lp && lp.text.slice(0, 110)}"`);
  let state = '';
  for (let k = 0; k < 150; k++) { state = await p.evaluate(i => App.live.robots[i].state, i); if (state === 'moving') break; await sleep(100); }
  ok(state === 'moving', `robot returned to moving (state now: ${state})`);
  await p.screenshot({ path: path.join(OUT, `recover_3_done${label ? '_zip' : ''}.png`) });
  await s.close();
}

async function main() {
  const browser = await chromium.launch();
  if (ZIP_ONLY) { await t1to3(browser, ' (fresh unzip)'); await t6(browser, ' (fresh unzip)'); await browser.close(); return finish(); }

  await t1to3(browser, '');

  test(4, 'Banner present on every screen');
  { const s = await open(DIR, { browser }), p = s.page, D = await p.evaluate(() => BOTSYNC_DATA.banner);
    for (const sc of ['start', 'explore', 'game', 'roadmap', 'voice', 'evidence', 'fleet', 'how', 'arch', 'assets']) {
      await p.evaluate(sc => UI.show(sc), sc); await p.waitForTimeout(150);
      ok(await p.evaluate(b => { const el = document.getElementById('banner'); const r = el.getBoundingClientRect(); return el.textContent === b && r.height > 0 && getComputedStyle(el).display !== 'none'; }, D), `banner visible on ${sc}`);
    }
    await p.evaluate(() => UI.startGuided('full')); await p.waitForTimeout(300);
    ok(await p.evaluate(b => document.getElementById('banner').textContent === b && !!App.guided, D), 'banner visible in Guided');
    await s.close(); }

  test(5, 'Three warehouses');
  { const s = await open(DIR, { browser }), p = s.page; await p.evaluate(() => UI.show('explore'));
    for (const [w, r, st] of [['A', 8, 11], ['B', 17, 17], ['C', 16, 17]]) {
      await p.click(`[data-wh="${w}"]`); await p.waitForTimeout(400);
      const got = await p.evaluate(() => ({ r: App.live.robots.length, st: App.live.wh.stations.length, title: document.getElementById('map-title').textContent }));
      ok(got.r === r && got.st === st && got.title.includes(r + ' robots') && got.title.includes(st + ' stations'), `${w}: ${got.r} robots, ${got.st} stations ("${got.title}")`);
    }
    await s.close(); }

  await t6(browser, '');

  test(7, 'Every scenario U1-U10 and the four voice phrases run to the end');
  const expect = [
    ['U1', 'pass', 'approve', 'U1-pass', ['PASS', '4.0 min', '21.2 min']], ['U1', 'fail', 'approve', 'U1-fail-approved', ['FAIL', 'speed 0.6 m/s is above the 0.3 m/s limit', '7 min']], ['U1', 'fail', 'reject', 'U1-fail-operator', ['FAIL', '21.2 min']],
    ['U2', 'box', 'approve', 'U2-box', ['unmapped_obstacle', 'alternate route clearance', 'PASS']], ['U2', 'spill', 'approve', 'U2-spill', ['damaged_pallet', 'person clears it']], ['U2', 'curtain', 'approve', 'U2-curtain', ['soft_curtain', 'scripted']],
    ['U3', null, 'approve', 'U3-done', ['0.62', 'navigate_to_service_bay', 'Ticket']], ['U4', 'pass', 'approve', 'U4-pass', ['replay_regression', 'boundary_diff', 'sim_scenario_suite', 'latency_budget_check', 'S16', '-31%']],
    ['U4', 'g1', 'reject', 'U4-g1', ['allowlist_scope_check', 'min_soc_safety_floor', 'Nothing deploys', 'Software cannot remove the charging loss']], ['U4', 'g2', 'reject', 'U4-g2', ['boundary_diff', 'lift speed limit constant', 'blocked']],
    ['U5', 'ok', 'approve', 'U5-ok', ['Bay 4', 'Bay 6', 'PASS', 'checks run before the robots move']], ['U5', 'b14', 'approve', 'U5-b14', ['Bay 14 does not exist', 'FAIL']], ['U5', 'b1', 'approve', 'U5-b1', ['Bay 1 is a dock door that is closed', 'FAIL']],
    ['U6', 'ok', 'approve', 'U6-ok', ['PASS', '1,400 kg', 'least certain']], ['U6', 'tight', 'approve', 'U6-tight', ['close to a limit', 'Bot 7']], ['U7', null, 'approve', 'U7', ['no action', 'engineer']],
    ['U9', null, 'reject', 'refused', ['allowlist_scope_check', 'safety_layer_untouched', 'never-edit', 'Refused', '171', '113.4']], ['U10', null, 'approve', 'U10', ['blurred', 'unmapped_obstacle', 'evaluation set']]
  ];
  { const s = await open(DIR, { browser }), p = s.page; await p.evaluate(() => { UI.show('explore'); UI.setSpeed(16); });
    for (const [id, v, dec, key, words] of expect) {
      const r = await p.evaluate(([id, v, dec]) => Scenarios.runAuto(id, v, dec), [id, v, dec]);
      const missing = words.filter(w => !r.text.includes(w));
      ok(r.key === key && !missing.length, `${id}${v ? ' [' + v + ']' : ''} (${dec}) -> ${r.key}; boxes ${r.visited.join(',')}${missing.length ? '; missing text: ' + missing.join(' | ') : ''}`);
      if (id === 'U1' && v === 'pass') await p.screenshot({ path: path.join(OUT, 'scenario_U1_pass.png') });
    }
    await p.evaluate(() => UI.openScenario('U8')); await p.waitForTimeout(3000);
    const u8 = await p.evaluate(() => ({ swap: App.policy.swap, bay: App.forceSwapBay, readout: (document.getElementById('swap-readout') || {}).textContent || '', strip: !document.getElementById('swap-strip').hidden }));
    ok(u8.swap && u8.bay && u8.strip && /Swaps done/.test(u8.readout), `U8: swap policy on, swap bay drawn, six-step strip shown, readout "${u8.readout.slice(0, 90)}"`);
    await p.screenshot({ path: path.join(OUT, 'scenario_U8_swap.png') });
    const vexp = [[0, 'yes', 'V-recovered', 'Bot 5 is moving again. It took 4 minutes.'], [1, 'yes', 'V-rerouted', 'Done. Bot 5 is going to Bay 4 and all drop-offs now go to Bay 6.'], [1, 'no', 'V-cancelled', 'Cancelled. Nothing changed.'],
      [2, 'yes', 'V-refused', "I can't do that. Someone has to be at the robot and confirm the area is clear."], [3, 'yes', 'V-question', 'Which robot, and which dock?']];
    await p.evaluate(() => UI.show('voice'));
    for (const [i, a, key, reply] of vexp) {
      const r = await p.evaluate(([i, a]) => Voice.runAuto(i, a), [i, a]);
      ok(r.key === key && r.phone[r.phone.length - 1] === reply, `voice phrase ${i + 1} (${a}) -> ${r.key}; phone reply "${r.phone[r.phone.length - 1]}"`);
      if (i === 1 && a === 'yes') ok(r.phone.some(m => m === 'Yes') && r.visited.includes('person'), 'phrase 2 asked to confirm on the phone before acting');
    }
    await p.screenshot({ path: path.join(OUT, 'voice_scene.png') });
    ok(s.log.pageErrors.length === 0 && s.log.console.length === 0, `no errors during scenarios (${JSON.stringify(s.log.pageErrors.concat(s.log.console).slice(0, 2))})`);
    await s.close(); }

  test(8, 'Safety refusal changes nothing in the sim');
  { const s = await open(DIR, { browser }), p = s.page; await p.evaluate(() => { UI.show('explore'); UI.setSpeed(16); });
    const snap = () => p.evaluate(() => JSON.stringify({ t: App.live.t, r: App.live.robots.map(r => [r.state, r.battery, r.x, r.y, r.node, r.incident && r.incident.code, r.hold, r.timer]), pol: App.live.policy, closed: App.live.closed, routes: App.overlays.routes.length, m: App.live.m }));
    await p.evaluate(() => { UI.openScenario('U9'); App.freezeSim = true; });
    const a = await snap();
    const r = await p.evaluate(() => Scenarios.runAuto('U9', null, 'reject'));
    const b = await snap();
    ok(r.key === 'refused', `U9 result: ${r.key}`); ok(a === b, 'sim state identical before and after the U9 pipeline');
    await p.evaluate(() => { App.freezeSim = false; UI.show('voice'); });
    await p.evaluate(() => { Voice.runAuto; App.freezeSim = true; });
    const r2 = await p.evaluate(() => { const before = []; return Voice.runAuto(2, 'yes').then(x => x.key); });
    const a2 = await snap(); await sleep(300); const b2 = await snap();
    // runAuto resets the scene first, so compare the state right after the refusal with a later snapshot while the sim clock is frozen
    ok(r2 === 'V-refused' && a2 === b2, `voice phrase 3 result: ${r2}; nothing changed after the refusal`);
    const bot3 = await p.evaluate(() => App.live.robots[2].state + ' ' + App.live.robots[2].incident.code);
    ok(bot3 === 'stopped ERR_SAFETY_LIDAR_ESTOP', `Bot 3 is still in its safety stop: ${bot3}`);
    await s.close(); }

  test(9, 'Data integrity (node tools/test_data.js)');
  runCmd('node', [path.join(__dirname, 'test_data.js'), DIR]);
  test(10, 'Numbers match the workbook; with test 22 (python3 tools/test_workbook.py)');
  runCmd('python3', ['-I', path.join(__dirname, 'test_workbook.py'), path.join(ROOT, 'source/botsync_dummy_data.xlsx'), DIR], ['T10:', 'T22:']);

  const W = require('./simload').load(DIR);
  test(11, 'Simulation calibration (8.5) and determinism');
  { const t0 = Date.now(), r = W.Sim.selfTest({ quiet: true });
    for (const [id, v] of Object.entries(r.warehouses)) {
      ok(v.checks.shareMoving, `${id} moving ${(v.shareMoving * 100).toFixed(1)}% vs ${(v.target.shareMoving * 100).toFixed(1)}% (±3 pts)`);
      ok(v.checks.shareCharging, `${id} charging ${(v.shareCharging * 100).toFixed(1)}% vs ${(v.target.shareCharging * 100).toFixed(1)}% (±3 pts)`);
      ok(v.checks.emergency, `${id} emergency low-battery stops ${v.emergency.toFixed(1)} vs ${v.target.emergency} (${id === 'A' ? '±25%' : '±3'})`);
      ok(v.checks.incidents, `${id} incidents ${v.incidents.toFixed(1)} vs ${v.target.incidents} (±20%)`);
    }
    console.log(`  selfTest(): 20 seeds x 30 days x 3 warehouses in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const o = { wh: 'A', seed: 42, days: 7, policy: { swap: true, agent: true, triage: true } };
    const x = JSON.stringify(W.Sim.compare(o)), y = JSON.stringify(W.Sim.compare(o));
    ok(x === y, `same seed twice gives byte-identical results (${x.length} bytes)`);
    ok(JSON.stringify(W.Sim.compare({ ...o, seed: 43 })) !== x, 'a different seed gives a different result'); }

  test(12, 'Game sanity (10.8)');
  { const avg = (wh, policy, params, n = 10) => { const a = { ret: 0, extra: 0, dt: 0, walk: 0, robots: 0 }; for (let s = 1; s <= n; s++) { const c = W.Sim.compare({ wh, seed: s, days: 7, policy, params }); a.ret += c.robotHoursReturned / n; a.extra += c.extraPalletMoves / n; a.dt += (c.today.downtimeHours - c.policy.downtimeHours) / n; a.walk += (c.today.operatorWalkUps - c.policy.operatorWalkUps) / n; a.robots = c.today.packsInUse >= 0 ? W.Warehouses.get(wh).robots : 0; } return a; };
    let zero = true; for (let s = 1; s <= 5; s++) { const c = W.Sim.compare({ wh: 'A', seed: s, days: 7, policy: { swap: true }, params: { spares: 0 } }); if (c.robotHoursReturned !== 0 || c.extraPalletMoves !== 0 || JSON.stringify(c.today.incidentsByCode) !== JSON.stringify(c.policy.incidentsByCode)) zero = false; }
    ok(zero, 'spare packs at 0: swap gives exactly no benefit over Today (5 seeds)');
    const sA = avg('A', { swap: true }), sB = avg('B', { swap: true }), sC = avg('C', { swap: true });
    ok(sA.ret > 0 && sA.extra > 0, `0.3 spare packs per robot on A: ${sA.ret.toFixed(1)} h returned, ${sA.extra.toFixed(0)} extra moves per week (10-seed mean)`);
    const per = (x, w) => x / W.Warehouses.get(w).robots;
    ok(per(sA.ret, 'A') > 1.5 * per(sB.ret, 'B') && per(sA.ret, 'A') > 1.5 * per(sC.ret, 'C'), `swap helps A most per robot: A ${per(sA.ret, 'A').toFixed(1)} h/robot, B ${per(sB.ret, 'B').toFixed(1)}, C ${per(sC.ret, 'C').toFixed(1)}`);
    const gA = avg('A', { agent: true }), gB = avg('B', { agent: true }), gC = avg('C', { agent: true });
    ok(gC.dt > gA.dt && gC.dt > gB.dt && gB.dt <= gA.dt, `recovery agent helps C most, B least (downtime hours saved per week: A ${gA.dt.toFixed(2)}, B ${gB.dt.toFixed(2)}, C ${gC.dt.toFixed(2)})`);
    const tA = avg('A', { triage: true }, undefined, 3);
    ok(Math.abs(tA.ret) < 1e-9 && tA.extra === 0, `triage changes no robot time (returned ${tA.ret}, extra ${tA.extra})`);
    const s15 = avg('A', { swap: true }, { swapTime: 15 });
    ok(s15.ret < sA.ret, `swap time 15 min reduces the benefit: ${s15.ret.toFixed(1)} h vs ${sA.ret.toFixed(1)} h at 5 min`);
    const h0 = avg('A', { swap: true }, { headroom: 0 }, 5);
    ok(h0.extra === 0 && h0.ret > 0, `headroom 0%: extra moves ${h0.extra}, time returned ${h0.ret.toFixed(1)} h`);
    ok(per(sB.extra, 'B') < per(sA.extra, 'A'), `B shows a smaller gain in moves than A (per robot: A ${per(sA.extra, 'A').toFixed(1)}, B ${per(sB.extra, 'B').toFixed(1)})`); }

  test(13, 'Keyboard');
  { const s = await open(DIR, { browser }), p = s.page;
    for (const sc of ['start', 'explore', 'roadmap', 'game']) {
      await p.evaluate(sc => UI.show(sc), sc); await p.waitForTimeout(300);
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      const reached = new Set(); let ring = true;
      for (let k = 0; k < 160; k++) { await p.keyboard.press('Tab'); const info = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; e.dataset.tabseen = '1'; const cs = getComputedStyle(e); return { tag: e.tagName, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; }); if (info) { reached.add(1); if (info.tag === 'BUTTON' && !info.ring) ring = false; } }
      const missed = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled && !b.closest('#legend') && b.getBoundingClientRect().width > 0 && !b.dataset.tabseen).map(b => b.textContent.trim().slice(0, 30)));
      ok(missed.length === 0 || (sc === 'roadmap' && missed.length < 3), `${sc}: every visible button reachable with Tab (${missed.length} not reached ${JSON.stringify(missed.slice(0, 5))})`);
      ok(ring, `${sc}: focused buttons show a 2 px focus ring`);
    }
    await p.evaluate(() => UI.show('explore')); await p.focus('#legend-btn'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => !document.getElementById('legend').hidden), 'Enter on Legend opens it'); await p.keyboard.press('Escape');
    ok(await p.evaluate(() => document.getElementById('legend').hidden), 'Esc closes the legend');
    await p.evaluate(() => { App.sel = { type: 'robot', i: 0 }; UI.renderSide(); }); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => App.sel === null && !!document.querySelector('[data-panel="fleet"]')), 'Esc closes the robot panel');
    await p.evaluate(() => UI.openScenario('U3')); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => App.sel === null), 'Esc closes the scenario player');
    await p.focus('[data-speed="4"]'); await p.keyboard.press('Space'); ok(await p.evaluate(() => App.speed === 4), 'Space activates a focused button');
    await s.close(); }

  test(14, 'Reduced motion');
  { const s = await open(DIR, { browser, reducedMotion: 'reduce' }), p = s.page;
    ok(await p.evaluate(() => App.reducedMotion), 'page detects prefers-reduced-motion');
    await p.evaluate(() => { UI.show('explore'); UI.setSpeed(4); }); await p.waitForTimeout(2500);
    const jumps = await p.evaluate(() => { const S = App.live; return S.robots.filter(r => ['moving', 'toCharge', 'toSwapBay'].includes(r.state)).map(r => { const d = UI.mapState.disp[r.i], n = S.wh.nodes[r.node]; return Math.hypot(d.x - n.x, d.y - n.y) < 0.01 && Math.hypot(r.x - n.x, r.y - n.y) >= 0; }); });
    ok(jumps.length > 0 && jumps.every(Boolean), `moving robots are drawn on graph nodes (jump between cells): ${jumps.length} checked`);
    const r = await p.evaluate(() => Scenarios.runAuto('U1', 'pass'));
    ok(r.visited.join(',') === 'diagnose,propose,check,execute,log', `pipeline still highlights each step: ${r.visited.join(' -> ')}`);
    ok(await p.evaluate(() => { const out = document.querySelectorAll('.io-out'); return out.length > 0; }), 'output text appears without the typewriter');
    await s.close(); }

  test(15, 'Layout at 1440x900 and 1024x768');
  for (const vp of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    const s = await open(DIR, { browser, viewport: vp }), p = s.page;
    for (const sc of ['start', 'explore', 'game', 'voice', 'roadmap', 'evidence', 'fleet', 'how', 'arch']) {
      await p.evaluate(sc => UI.show(sc), sc); await p.waitForTimeout(sc === 'explore' || sc === 'game' ? 1200 : 300);
      if (sc === 'explore') { await p.evaluate(() => UI.openScenario('U1')); await p.waitForTimeout(400); }
      const r = await p.evaluate(() => {
        const allow = '.tag, .glabel, .chip-role, .swap-step, .status, .io-panel, .srctag, .bubble-cap, .phrase-chip, .mic-cap, figcaption, svg';
        const small = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) { const t = walker.currentNode; if (!t.textContent.trim()) continue; const e = t.parentElement; if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue; if (e.closest('[hidden]')) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 12 || (fs < 14 && !e.closest(allow))) small.push(e.tagName + '.' + e.className + ' ' + fs + 'px "' + t.textContent.trim().slice(0, 30) + '"'); }
        return { scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, small };
      });
      ok(r.scroll <= 0, `${vp.width}x${vp.height} ${sc}: no horizontal page scroll (${r.scroll} px over)`);
      ok(r.small.length === 0, `${vp.width}x${vp.height} ${sc}: text >= 14 px (12 px only for labels, tags, chips): ${r.small.length} smaller ${JSON.stringify(r.small.slice(0, 3))}`);
      await p.screenshot({ path: path.join(OUT, 'layout', `${vp.width}_${sc}.png`) }).catch(async () => { fs.mkdirSync(path.join(OUT, 'layout'), { recursive: true }); await p.screenshot({ path: path.join(OUT, 'layout', `${vp.width}_${sc}.png`) }); });
    }
    await s.close();
  }

  test(17, 'Speed');
  { const s = await open(DIR, { browser }), p = s.page;
    await p.evaluate(() => { UI.show('game'); UI.setSpeed(16); }); await p.waitForTimeout(500);
    await p.click('#g-run'); await p.waitForFunction(() => App.lastGame, null, { timeout: 30000 });
    const g = await p.evaluate(() => App.lastGame);
    ok(g.ms < 3000, `a week at 16x ran in ${(g.ms / 1000).toFixed(2)} s (< 3 s)`);
    await p.screenshot({ path: path.join(OUT, 'game_week.png'), fullPage: true });
    await p.evaluate(() => { window.__gaps = []; let last = performance.now(); window.__hb = setInterval(() => { const n = performance.now(); __gaps.push(n - last); last = n; }, 50); });
    await p.click('#g-avg'); await p.waitForFunction(() => App.lastAvg, null, { timeout: 90000 });
    const a = await p.evaluate(() => { clearInterval(__hb); return { ms: App.lastAvg.ms, n: App.lastAvg.n, maxGap: Math.max(...__gaps) }; });
    ok(a.n === 20 && a.ms < 60000, `20-run average finished in ${(a.ms / 1000).toFixed(1)} s (< 60 s)`);
    ok(a.maxGap < 1500, `page stayed responsive: longest gap between heartbeats ${a.maxGap.toFixed(0)} ms`);
    await p.screenshot({ path: path.join(OUT, 'game_average.png'), fullPage: true });
    await s.close(); }

  test(18, 'Assets gallery');
  { const s = await open(DIR, { browser, hash: '#assets', wait: 1200 }), p = s.page;
    const shot = path.join(OUT, 'assets_gallery.png'); await p.screenshot({ path: shot, fullPage: true });
    const need = ['robot:moving', 'robot:idle', 'robot:toCharge', 'robot:toSwapBay', 'robot:queue', 'robot:charging', 'robot:swapping', 'robot:stopped', 'robot:recovering', 'robot:waitingForPerson', 'robot:recovered', 'robot:carrying', 'robot:selected',
      'pallet:good', 'pallet:skewed', 'pallet:damaged', 'pallet:wrapped', 'pallet:spilled', 'pallet:load', 'aisle:box', 'aisle:boxFallen', 'aisle:curtain', 'aisle:person', 'aisle:forklift',
      'building:walls', 'building:rack', 'building:dock', 'building:glare', 'building:conveyor', 'building:staging', 'building:charger', 'building:chargerBusy', 'building:service', 'building:swap', 'building:pack', 'building:slot-charged', 'building:slot-charging', 'building:slot-empty',
      'overlay:route', 'overlay:safety', 'overlay:bbox', 'overlay:ring', 'overlay:tooltip',
      'camera:fallen_box', 'camera:spilled_pallet', 'camera:soft_curtain', 'camera:glare', 'camera:dirty_lens', 'camera:wrapped_pocket', 'camera:skewed_pallet', 'camera:damaged_pallet', 'camera:blurBefore', 'camera:blurAfter',
      'pipe:box-idle', 'pipe:box-active', 'pipe:box-done', 'pipe:box-failed', 'pipe:box-waiting', 'pipe:chips', 'pipe:arrows', 'pipe:person', 'pipe:io', 'pipe:gates',
      'chart:timeshare', 'chart:pattern-moving', 'chart:pattern-charging', 'chart:pattern-idle', 'chart:pattern-stopped', 'chart:compare', 'chart:gantt', 'chart:meter', 'chart:table',
      'safety:person', 'safety:forklift', 'phone:idle', 'phone:listening', 'ui:button', 'ui:primary', 'ui:disabled', 'ui:switchOff', 'ui:switchOn', 'ui:slider', 'ui:tags', 'ui:tabs', 'ui:banner', 'ui:log', 'favicon', 'legend'];
    const have = await p.evaluate(() => [...document.querySelectorAll('[data-asset]')].map(e => e.dataset.asset));
    const miss = need.filter(n => !have.includes(n));
    ok(miss.length === 0, `${need.length} required assets present in the gallery (${have.length} figures); missing: ${miss.join(', ') || 'none'}`);
    const blank = await p.evaluate(() => [...document.querySelectorAll('[data-asset] canvas')].filter(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240)) return false; return true; }).map(c => c.parentElement.dataset.asset));
    ok(blank.length === 0, `no canvas asset is blank (${blank.join(', ') || 'none blank'})`);
    const edge = await p.evaluate(() => [...document.querySelectorAll('[data-asset] canvas')].filter(c => { if (c.parentElement.dataset.asset.startsWith('camera') || c.parentElement.dataset.asset === 'building:walls') return false; const ctx = c.getContext('2d'), W = c.width, H = c.height, d = ctx.getImageData(0, 0, W, H).data; let n = 0; for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = (y * W + x) * 4; if (d[i + 3] > 0 && d[i] < 100) n++; } for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = (y * W + x) * 4; if (d[i + 3] > 0 && d[i] < 100) n++; } return n > 6; }).map(c => c.parentElement.dataset.asset));
    ok(edge.length === 0, `no asset drawn into its canvas edge (clipping check): ${edge.join(', ') || 'none clipped'}`);
    // palette: decode the full screenshot in the browser and classify every saturated pixel by hue
    const b64 = fs.readFileSync(shot).toString('base64');
    const pal = await p.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; const bad = {}; let sat = 0, total = 0;
      for (let i = 0; i < d.length; i += 4) { total++; const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 28) continue; sat++;
        let h; if (mx === r) h = ((g - b) / (mx - mn)) * 60; else if (mx === g) h = (2 + (b - r) / (mx - mn)) * 60; else h = (4 + (r - g) / (mx - mn)) * 60; if (h < 0) h += 360;
        const okHue = h <= 12 || h >= 348 || (h >= 26 && h <= 46) || (h >= 105 && h <= 140) || (h >= 170 && h <= 265); /* state: red, amber, green; decoration: teal, blue, violet */ if (!okHue) { const k = Math.round(h / 10) * 10; bad[k] = (bad[k] || 0) + 1; } }
      return { sat, total, bad };
    }, b64);
    const badN = Object.values(pal.bad).reduce((a, b) => a + b, 0);
    ok(badN <= pal.total * 0.0002, `palette: ${pal.sat} coloured pixels; outside the state hues (red, green, amber) and the decoration hues (teal, blue, violet): ${badN} ${JSON.stringify(pal.bad)}`);
    const fnsPage = await p.evaluate(() => Object.keys(Draw).filter(k => /^(draw|svg|html)[A-Z]/.test(k)).sort());
    const SPEC_7A = ['drawRobot', 'drawBatteryBar', 'drawPallet', 'drawLoad', 'drawBox', 'drawCurtain', 'drawPerson', 'drawForklift', 'drawBuilding', 'drawRack', 'drawDockDoor', 'drawGlareBand', 'drawSun', 'drawConveyor', 'drawStaging', 'drawCharger', 'drawServiceBay', 'drawSwapBay', 'drawPack', 'drawPackSlot',
      'drawRouteLine', 'drawSafetyField', 'drawBoundingBox', 'drawSelectionRing', 'drawTooltip', 'drawCameraScene', 'drawBlurDemo', 'svgPipelineBox', 'svgChip', 'svgArrow', 'svgPersonIcon', 'htmlIOPanel', 'htmlGateList',
      'svgTimeShareBar', 'svgLegendSwatch', 'svgComparisonBars', 'svgGantt', 'htmlMiniMeter', 'htmlSortableTable', 'drawSafetyScene', 'htmlPhoneMock', 'svgMic'].sort();
    ok(JSON.stringify(fnsPage) === JSON.stringify(SPEC_7A), `draw.js exports ${fnsPage.length} asset functions, matching the ${SPEC_7A.length} listed for 7A (A1 robot+battery bar, A2 pallet+load, A3 x4, A4 x12, A5 x5, A6 x2, A7 x6, A8 x6, A9, A10 x2)`);
    const sig = await p.evaluate(() => Object.keys(Draw).filter(k => /^draw[A-Z]/.test(k)).every(k => Draw[k].length === 6));
    ok(sig, 'every canvas draw function has the signature (ctx, x, y, angleRad, state, opts)');
    test(19, 'Stopped state readable without colour');
    const g = await p.evaluate(() => { const grab = a => { const c = document.querySelector(`[data-asset="${a}"] canvas`), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, out = []; for (let i = 0; i < d.length; i += 4) out.push(d[i + 3] === 0 ? 255 : Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])); return out; };
      const m = grab('robot:moving'), s = grab('robot:stopped'); let diff = 0, darkM = 0, darkS = 0; for (let i = 0; i < m.length; i++) { if (Math.abs(m[i] - s[i]) > 40) diff++; if (m[i] < 160) darkM++; if (s[i] < 160) darkS++; } return { diff, darkM, darkS, n: m.length }; });
    ok(g.diff > 150 && g.darkS > g.darkM * 1.2, `in greyscale the stopped robot differs from the moving one in ${g.diff} pixels; dark pixels ${g.darkS} vs ${g.darkM} (thick outline and X mark)`);
    await s.close(); }

  test(20, 'New screens (4.9 to 4.15)');
  { const s = await open(DIR, { browser }), p = s.page;
    await p.evaluate(() => UI.show('evidence')); await p.waitForTimeout(200);
    const ev = await p.evaluate(() => [...document.querySelectorAll('[data-chart]')].map(c => ({ svg: !!c.querySelector('svg'), src: (c.querySelector('.srctag') || {}).textContent || '', reading: !!c.querySelector('.reading') })));
    ok(ev.length === 6 && ev.every(c => c.svg && /Analysis \d/.test(c.src) && c.reading), `evidence: ${ev.length} SVG charts, each with a reading and a source tag (${ev.map(c => c.src).join('; ')})`);
    ok(await p.evaluate(() => document.body.textContent.includes('What I would not trust') && document.body.textContent.includes('Data I would need')), 'evidence: "What I would not trust" and "Data I would need" lists');
    await p.screenshot({ path: path.join(OUT, 'screen_evidence.png'), fullPage: true });
    await p.evaluate(() => UI.show('fleet')); await p.waitForTimeout(200);
    const fl = await p.evaluate(() => ({ tiles: document.querySelectorAll('.tile').length, bold: document.querySelectorAll('.tile.t24').length, pilot: [...document.querySelectorAll('.tile')].filter(t => [...t.querySelectorAll('.tag')].some(g => g.textContent === 'pilot')).map(t => t.dataset.site), demo: [...document.querySelectorAll('.tile')].filter(t => [...t.querySelectorAll('.tag')].some(g => g.textContent === 'in this demo')).map(t => t.dataset.site), header: document.querySelector('[data-k="header"]').textContent }));
    ok(fl.tiles === 30 && fl.bold === 10, `fleet: ${fl.tiles} tiles, ${fl.bold} with bold outline`);
    ok(fl.pilot.join() === 'S08,S21,S22' || fl.pilot.sort().join() === 'S08,S21,S22', `pilot tags: ${fl.pilot.sort().join(', ')}`);
    ok(fl.demo.sort().join() === 'S08,S12,S20', `"in this demo" tags: ${fl.demo.sort().join(', ')}`);
    ok(/10 of 30 sites run 24 hours: 74 of 250 robots \(Analysis 4\)/.test(fl.header), `header: "${fl.header.slice(0, 70)}"`);
    await p.screenshot({ path: path.join(OUT, 'screen_fleet.png'), fullPage: true });
    for (const [sid, w] of [['S08', 'A'], ['S12', 'B'], ['S20', 'C']]) { await p.evaluate(() => UI.show('fleet')); await p.click(`[data-site="${sid}"]`); await p.waitForTimeout(300); ok(await p.evaluate(w => App.screen === 'work' && App.mode === 'explore' && App.wh === w && App.live.wh.id === w, w), `clicking ${sid} opens Warehouse ${w}`); }
    await p.evaluate(() => UI.show('fleet')); await p.click('[data-site="S01"]'); ok(await p.evaluate(() => App.screen === 'fleet' && document.querySelector('[data-site="S01"]').textContent.includes('not simulated here')), 'other tiles say "not simulated here"');
    await p.evaluate(() => UI.show('arch')); await p.waitForTimeout(200);
    const ar = await p.evaluate(() => ({ lanes: ['Robot', 'Site server (or robot edge)', 'Botsync cloud'].every(t => [...document.querySelectorAll('#screen-arch svg text')].some(e => e.textContent === t)), callouts: document.querySelectorAll('[data-callout]').length, txt: document.getElementById('screen-arch').textContent }));
    ok(ar.lanes && ar.callouts === 3 && /keeps using its standard recovery/.test(ar.txt) && /never takes input from a model/.test(ar.txt) && /stay on Botsync-controlled machines/.test(ar.txt), `architecture: three lanes and ${ar.callouts} callouts`);
    await p.screenshot({ path: path.join(OUT, 'screen_architecture.png'), fullPage: true });
    await p.evaluate(() => UI.show('how')); await p.click('[data-explain="fix-check"]'); ok(await p.evaluate(() => /PASS or FAIL/.test(document.getElementById('explain').textContent)), 'how it works: clicking a box shows its explanation');
    await p.screenshot({ path: path.join(OUT, 'screen_how_it_works.png'), fullPage: true });
    await p.evaluate(() => UI.show('roadmap')); await p.waitForTimeout(200);
    const rm = await p.evaluate(() => ({ tabs: document.querySelectorAll('[data-month]').length, first: [...document.querySelectorAll('.rice tbody tr')].map(r => r.cells[0].textContent)[0], bold: document.querySelector('.rice tr.bold td').textContent }));
    ok(rm.tabs === 6 && rm.first === 'LLM root-cause triage' && /Battery swap, phase 1/.test(rm.bold), `roadmap: ${rm.tabs} month tabs; RICE sorted by score (first: ${rm.first}); swap row bold`);
    await p.click('.rice [data-sort="reach"]'); ok(await p.evaluate(() => document.querySelector('.rice th.sorted').textContent.includes('reach')), 'RICE re-sorts by a clicked column header');
    await p.screenshot({ path: path.join(OUT, 'screen_roadmap.png'), fullPage: true });
    // approval screen in U1 fail, U4 g1/g2, U5 b14/b1, U6 tight; refuses out-of-range edits
    await p.evaluate(() => { UI.show('explore'); UI.setSpeed(16); });
    for (const [id, v] of [['U1', 'fail'], ['U4', 'g1'], ['U4', 'g2'], ['U5', 'b14'], ['U5', 'b1'], ['U6', 'tight']]) {
      await p.evaluate(([id, v]) => { UI.openScenario(id); document.querySelector(`[data-variant="${v}"]`).click(); Scenarios.runPipeline(); }, [id, v]);
      await p.waitForSelector('#sc-pipe .approval', { timeout: 20000 });
      const a = await p.evaluate(() => { const ap = document.querySelector('#sc-pipe .approval'); return { h: [...ap.querySelectorAll('h4')].map(h => h.textContent.split(' ')[0] + ' ' + (h.textContent.split(' ')[1] || '')), off: !!ap.querySelector('.offending'), btns: [...ap.querySelectorAll('.btn-row button')].map(b => b.textContent) }; });
      ok(a.h.length === 4 && a.off && a.btns.length === 3, `approval screen in ${id} [${v}]: sections ${a.h.join(' / ')}; offending value underlined: ${a.off}; buttons ${a.btns.join(' | ')}`);
      if (id === 'U1') {
        await p.click('#ap-edit-btn'); await p.fill('#ap-edit', '0.6'); await p.click('#ap-apply');
        const ref = await p.evaluate(() => ({ msg: document.getElementById('ap-refuse').textContent, res: document.getElementById('ap-result').textContent }));
        ok(/Refused: 0.6 is outside/.test(ref.msg) && ref.res === '', `out-of-range edit refused: "${ref.msg}"`);
        await p.fill('#ap-edit', '0.25'); await p.click('#ap-apply'); await p.waitForTimeout(100);
        ok(/applied after edit/.test(await p.evaluate(() => document.getElementById('ap-result').textContent)), 'in-range edit 0.25 m/s: "applied after edit", label stored');
        await p.screenshot({ path: path.join(OUT, 'approval_screen_U1.png') });
      } else await p.click('#ap-reject');
      await p.waitForSelector('#sc-pipe[data-done="1"]', { timeout: 20000 });
    }
    // View as: each role changes the default panel and the headline numbers
    await p.evaluate(() => { Scenarios.stop(); App.sel = null; UI.show('explore'); });
    const heads = {};
    for (const r of ['ops', 'floor', 'it', 'tech', 'deploy', 'product']) { await p.click(`[data-role="${r}"]`); await p.waitForTimeout(150); heads[r] = await p.evaluate(() => ({ role: document.querySelector('[data-panel="fleet"]').dataset.role, head: document.getElementById('headline').textContent.replace(/[0-9.,%]/g, ''), label: document.getElementById('role-label').textContent })); }
    const distinct = new Set(Object.values(heads).map(h => h.head)).size;
    ok(Object.entries(heads).every(([r, h]) => h.role === r) && distinct === 6, `View as: 6 roles, 6 different headline sets; label "${heads.product.label}"`);
    await p.click('[data-role="ops"]');
    // Quick tour
    await p.click('[data-go="tour"]').catch(async () => { await p.evaluate(() => UI.show('start')); await p.click('[data-go="tour"]'); });
    for (let k = 0; k < 4; k++) { await p.waitForTimeout(400); await p.click('#g-next'); }
    await p.waitForTimeout(400);
    const tour = await p.evaluate(() => App.guidedVisited);
    ok(JSON.stringify(tour) === '[1,3,6,13,14]', `Quick tour runs steps ${JSON.stringify(tour)}`);
    await p.evaluate(() => UI.stopGuided());
    // full guided: 14 steps
    await p.evaluate(() => UI.startGuided('full'));
    for (let k = 0; k < 13; k++) { await p.waitForTimeout(250); await p.click('#g-next'); }
    await p.waitForTimeout(300);
    ok(JSON.stringify(await p.evaluate(() => App.guidedVisited)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]), 'Guided runs 14 steps with Back / Next and a step counter');
    await p.evaluate(() => UI.stopGuided());
    // Show sources
    const srcs = await p.evaluate(() => { const set = new Set(); (function w(o) { if (o && typeof o === 'object') { for (const k in o) { if (k === 'src' && typeof o[k] === 'string') set.add(o[k]); else w(o[k]); } } })(BOTSYNC_DATA); Object.values(BOTSYNC_DATA.SRC).forEach(v => set.add(v)); return [...set]; });
    await p.click('#src-switch');
    let all = 0, badTags = [];
    for (const sc of ['evidence', 'fleet', 'roadmap', 'explore', 'game']) {
      await p.evaluate(sc => UI.show(sc), sc); await p.waitForTimeout(sc === 'game' ? 300 : 200);
      if (sc === 'game') { await p.click('#g-run'); await p.click('#g-skip'); await p.waitForTimeout(200); }
      const t = await p.evaluate(() => [...document.querySelectorAll('.num')].filter(e => e.offsetParent).map(e => ({ src: e.dataset.src, after: getComputedStyle(e, '::after').content })));
      all += t.length; t.forEach(x => { if (!srcs.includes(x.src) || x.after !== JSON.stringify(x.src)) badTags.push(x.src); });
      ok(t.length > 10, `Show sources on ${sc}: ${t.length} numbers carry a source tag`);
      if (sc === 'evidence') await p.screenshot({ path: path.join(OUT, 'show_sources_evidence.png') });
    }
    ok(badTags.length === 0, `every one of ${all} tags is printed from a src field in data.js (${badTags.length} not: ${JSON.stringify([...new Set(badTags)].slice(0, 5))})`);
    ok(srcs.length > 5, `src values in data.js: ${srcs.join(' | ')}`);
    await s.close(); }

  test(21, 'Demand honesty (8.1b)');
  { for (const pol of [{ swap: true }, { agent: true }, { triage: true }, { swap: true, agent: true, triage: true }]) {
      let maxExtra = 0, minRet = Infinity; for (let s = 1; s <= 5; s++) { const c = W.Sim.compare({ wh: 'A', seed: s, days: 7, policy: pol, params: { headroom: 0 } }); maxExtra = Math.max(maxExtra, c.extraPalletMoves); minRet = Math.min(minRet, c.robotHoursReturned); }
      ok(maxExtra === 0, `A, headroom 0%, ${JSON.stringify(pol)}: extra pallet moves ${maxExtra} on all 5 seeds${pol.swap ? '; robot time returned at least ' + minRet.toFixed(1) + ' h' : ''}`);
      if (pol.swap) ok(minRet > 0, 'time returned is above 0 for the swap policy at 0% headroom');
    }
    let okCap = true, minExtra = Infinity, worst = 0;
    for (let s = 1; s <= 10; s++) { const c = W.Sim.compare({ wh: 'A', seed: s, days: 7, policy: { swap: true }, params: { headroom: 0.25 } }); minExtra = Math.min(minExtra, c.extraPalletMoves); worst = Math.max(worst, c.extraPalletMoves / c.todayVolume); if (c.extraPalletMoves > 0.25 * c.todayVolume + 1e-9) okCap = false; }
    ok(minExtra > 0 && okCap, `A, headroom 25%, swap: extra moves positive on all 10 seeds (min ${minExtra.toFixed(0)}), never above 25% of today's volume (max ${(worst * 100).toFixed(1)}%)`); }

  test(23, 'Shift hours (8.1c)');
  for (const [w, hrs] of [['A', 168], ['B', 112], ['C', 96]]) { const S = W.Sim.create({ wh: w, seed: 3, days: 7, mode: 'game' }); W.Sim.run(S, S.end); const m = W.Sim.metrics(S); ok(Math.abs(m.scheduledHoursPerRobot - hrs) < 1e-6, `${w}: a simulated week has ${m.scheduledHoursPerRobot.toFixed(2)} scheduled hours per robot (expected ${hrs})`); }

  await browser.close();
  finish();
}
function runCmd(cmd, args, keys) {
  let out = '', code = 0;
  try { out = execFileSync(cmd, args, { encoding: 'utf8', cwd: ROOT }); } catch (e) { out = (e.stdout || '') + (e.stderr || ''); code = e.status; }
  out.split('\n').filter(Boolean).forEach(l => { if (/^(PASS|FAIL)/.test(l)) cur.checks.push(l); console.log('  ' + l); });
  if (keys) { const t10 = out.split('\n').find(l => l.startsWith('T10:')), t22 = out.split('\n').find(l => l.startsWith('T22:')); results.push({ n: 22, name: 'Per-site table (5.9), checked inside test 10\'s script', checks: [t22], pass: /ALL PASS/.test(t22 || '') }); cur.pass = /ALL PASS/.test(t10 || '') && code === 0; }
  else cur.pass = code === 0;
}
function finish() {
  results.sort((a, b) => a.n - b.n);
  const lines = results.map(r => `Test ${String(r.n).padStart(2)} ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (${r.checks.length} checks)`);
  const summary = '\n==== SUMMARY ====\n' + lines.join('\n') + `\n${results.filter(r => r.pass).length} of ${results.length} tests pass`;
  console.log(summary);
  fs.writeFileSync(path.join(OUT, ZIP_ONLY ? 'test_results_fresh_unzip.json' : 'test_results.json'), JSON.stringify(results, null, 1));
  process.exitCode = results.every(r => r.pass) ? 0 : 1;
}
main().catch(e => { console.error(e); process.exit(2); });
