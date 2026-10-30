// Acceptance test 9: data integrity of data.js.
const { load } = require('./dump_data');
const D = load(process.argv[2] || 'botsync_walkthrough');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const site = id => D.siteTable.find(s => s.site_id === id);
const W = { A: ['S08', 63, 11], B: ['S12', 32, 17], C: ['S20', 59, 17] };
for (const [w, [sid, inc, st]] of Object.entries(W)) {
  const s = site(sid);
  const sum = 100 * (s.movingShare.v + s.chargingShare.v + s.idleShare.v + s.errorShare.v);
  ok(Math.abs(sum - 100) <= 0.5, `${w} ${sid} shares sum to ${sum.toFixed(2)}% (within 0.5 of 100)`);
  const codes = Object.values(s.incidentsByCode).reduce((a, b) => a + b.v, 0);
  ok(codes === inc && s.incidents.v === inc, `${w} incident codes sum to ${codes} (stated ${inc})`);
  const stations = Object.values(s.stations).reduce((a, b) => a + b.v, 0);
  ok(stations === st, `${w} stations sum to ${stations} (stated ${st})`);
}
const lv = D.levels.reduce((a, l) => a + l.incidents.v, 0);
ok(lv === 2137 && lv === D.fleet.incidents30d.v, `level incidents sum ${D.levels.map(l => l.incidents.v).join(' + ')} = ${lv}`);
for (const r of D.rice) {
  const s = r.reach.v * r.impact.v * r.confidence.v / r.effort.v;
  ok(Math.abs(s - r.score.v) <= 0.05 + 1e-9, `RICE "${r.item}": recomputed ${s.toFixed(3)} vs stored ${r.score.v}`);
}
ok(D.roadmap.length === 6, `roadmap has ${D.roadmap.length} months`);
// every value object has a src
let missing = 0, total = 0;
(function walk(o, p) {
  if (o && typeof o === 'object') {
    if ('v' in o && !Array.isArray(o)) { total++; if (!o.src) { missing++; console.log('  no src at ' + p); } return; }
    for (const k in o) walk(o[k], p + '.' + k);
  }
})(D, 'D');
ok(missing === 0, `${total} value objects, all carry a src field`);
console.log(fails ? `T9: ${fails} FAILED` : 'T9: ALL PASS');
process.exit(fails ? 1 : 0);
