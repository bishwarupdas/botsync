// Tune missionRate (bisection on moving share) for a given trigger and spread. Usage: node tools/calibrate.js A 0.33 0 [seeds] [days]
const w = require('./simload').load('botsync_walkthrough');
const [id, trig, spread, seeds = 3, days = 30] = process.argv.slice(2);
function evalRate(rate) {
  let mv = 0, ch = 0, em = 0, inc = 0;
  for (let s = 1; s <= +seeds; s++) { const S = w.Sim.create({ wh: id, seed: s, days: +days, mode: 'game', params: { demand: rate, chargeTrigger: +trig, triggerSpread: +spread } }); w.Sim.run(S, S.end); const m = w.Sim.metrics(S); mv += m.shareMoving; ch += m.shareCharging; em += m.emergencyLowBatteryStops; inc += m.incidents; }
  return { mv: mv / seeds, ch: ch / seeds, em: em / seeds, inc: inc / seeds };
}
const site = w.Warehouses.get(id).siteRow, target = site.movingShare.v;
let lo = 0.01, hi = 5, best;
for (let i = 0; i < 9; i++) { const mid = Math.sqrt(lo * hi); best = evalRate(mid); best.rate = mid; if (best.mv < target) lo = mid; else hi = mid; }
console.log(id, 'trig', trig, 'spread', spread, 'rate', best.rate.toFixed(4), 'mv', (best.mv * 100).toFixed(1), '/', (target * 100).toFixed(1), 'ch', (best.ch * 100).toFixed(1), '/', (site.chargingShare.v * 100).toFixed(1), 'em', best.em.toFixed(1), 'inc', best.inc.toFixed(1));
