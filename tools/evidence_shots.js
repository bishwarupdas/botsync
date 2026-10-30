// Screenshots for the hand-over: each warehouse running, one full Recover run, Game mode. Usage: node tools/evidence_shots.js <site_dir> <out_dir>
const path = require('path'), fs = require('fs');
const { open } = require('./pw');
const DIR = process.argv[2] || 'botsync_walkthrough', OUT = process.argv[3] || 'evidence';
const expand = p => p.addStyleTag({ content: '.work{height:auto!important} .map-col,.side,#phone-col{height:auto!important;max-height:none!important;position:static!important;overflow:visible!important} #topbar,#banner{position:static!important}' });
(async () => {
  const s = await open(DIR, { wait: 800 }), p = s.page; await expand(p);
  await p.evaluate(() => UI.show('explore'));
  for (const w of ['A', 'B', 'C']) {
    await p.evaluate(w => { UI.setWarehouse(w); UI.setSpeed(16); }, w); await p.waitForTimeout(10000);
    await p.evaluate(() => UI.setSpeed(1)); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `warehouse_${w}.png`), fullPage: true });
  }
  // one full Recover run on Warehouse C: a docking timeout at a glare door, from the stop to the robot moving again
  await p.evaluate(() => { UI.setWarehouse('C'); App.noDemoStops = true; UI.setSpeed(1); });
  await p.waitForTimeout(2500);
  const i = await p.evaluate(() => { const r = UI.demoStop({ code: 'ERR_DOCKING_ALIGNMENT_TIMEOUT', recov: 'operator', station: 'Bay 3', scene: 'glare' }); UI.setSpeed(0); return r.i; });
  const pos = await p.evaluate(i => UI.robotScreenPos(i), i);
  await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, 'recover_1_incident.png'), fullPage: true });
  await p.evaluate(() => UI.setSpeed(1)); await p.click('#btn-recover');
  await p.waitForFunction(() => (document.querySelector('#pipe-area')?.getAttribute('data-visited') || '').split(',').includes('check'), null, { timeout: 30000 });
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(OUT, 'recover_2_pipeline_running.png'), fullPage: true });
  await p.evaluate(() => UI.setSpeed(4));
  await p.waitForSelector('#pipe-area[data-done="1"]', { timeout: 60000 });
  await p.screenshot({ path: path.join(OUT, 'recover_3_result.png'), fullPage: true });
  await p.waitForFunction(i => App.live.robots[i].state === 'moving', i, { timeout: 60000 });
  await p.evaluate(() => UI.setSpeed(0));
  await p.screenshot({ path: path.join(OUT, 'recover_4_back_to_work.png'), fullPage: true });
  // Game mode: a week on Warehouse A with the swap policy, then the 20-run average
  await p.evaluate(() => { UI.setWarehouse('A'); UI.show('game'); UI.setSpeed(16); }); await p.waitForTimeout(500);
  await p.click('#g-run'); await p.waitForTimeout(1000);
  await p.screenshot({ path: path.join(OUT, 'game_1_running.png'), fullPage: true });
  await p.waitForFunction(() => App.lastGame, null, { timeout: 30000 });
  await p.click('#g-avg'); await p.waitForFunction(() => App.lastAvg, null, { timeout: 90000 });
  await p.screenshot({ path: path.join(OUT, 'game_2_results.png'), fullPage: true });
  console.log(JSON.stringify({ errors: s.log.console.concat(s.log.pageErrors), external: s.log.requests.filter(u => !u.startsWith('file://')) }));
  await s.close();
})();
