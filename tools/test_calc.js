global.window = global; require('./assets/js/predict-data.js'); require('./predict-calc.js');
var C = window.PredictCalc, P = window.BOTSYNC_DATA.predict, cut = P.defaultCutDay;
function r(x, d) { return Math.round(x * Math.pow(10, d)) / Math.pow(10, d); }
['16x6', '16x7', '24x7'].forEach(function (s) {
  var a = C.chargingShare(s, 0, cut), b = C.chargingShare(s, cut, P.days);
  console.log(s, r(a * 100, 1), r(b * 100, 1), r((b - a) * 100, 2));
});
console.log('largest site gap', r(C.largestSiteGap(cut), 2));
console.log('runFlat', JSON.stringify(C.runFlat(cut)));
console.log('docking glare', r(C.dockingWindowShare('glare', 14, 3) * 100, 1), 'other', r(C.dockingWindowShare('other', 14, 3) * 100, 1));
console.log('watch12', JSON.stringify(C.watchList(cut, 12)));
console.log('repeat', P.repeatShare, 'telemetryDays', P.telemetryDays, 'repl', P.replacements30d);
['S08', 'S12', 'S20'].forEach(function (s) { var p = C.planning(s, 5, 100); console.log(s, r(p.perDay, 1), 'peak h', p.peakHour, r(p.peakPerHour, 2), 'avg/h', r(p.avgPerHour, 3), 'opload', r(p.operatorLoadAvg, 3), r(p.operatorLoadPeak, 3), 'packs', r(p.packsRechargingAvg, 2), r(p.packsRechargingPeak, 2)); });
