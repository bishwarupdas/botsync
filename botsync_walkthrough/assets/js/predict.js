/* predict.js: the Predict screen (prediction add-on spec). Plain statistics in the browser: no model, no network.
   Every number comes from PredictCalc (predict-calc.js) over BOTSYNC_DATA.predict (generated from the workbook). */
(function () {
  'use strict';
  var D = window.BOTSYNC_DATA, P = D.predict, C = window.PredictCalc, UI = window.UI, App = window.App, Draw = window.Draw;
  var esc = UI.esc, N = UI.N, $ = UI.$, $$ = UI.$$, SRC = D.SRC;
  var PSRC = { a: P.src['13a'], b: P.src['13b'], c: P.src['13c'], d: P.src['13d'], e: P.src['13e'], calc: 'calculated', a4: SRC.a4, assumed: SRC.assumed };
  var SITES = [{ id: 'S08', label: 'S08 Bangkok Plant, 24x7' }, { id: 'S12', label: 'S12 Tuas Singapore Plant, 16x7' }, { id: 'S20', label: 'S20 Johor Bahru DC, 16x6' }];
  var PATS = ['16x6', '16x7', '24x7'];
  var RECHARGE = { v: 100, src: PSRC.a4 };   // measured average charge session, rounded as in the spec
  var st = { cut: P.defaultCutDay, site: 'S08', swap: 5, wStart: 14, wLen: 3, thr: 12 };

  function v(x, src) { return { v: x, src: src }; }
  function pred() { return '<span class="tag pred">PREDICTION</span>'; }
  function srcTag(s) { return '<span class="srctag">' + esc(s) + '</span>'; }
  function r(x, d) { var m = Math.pow(10, d); return Math.round(x * m) / m; }
  function dateOf(day) { var t = Date.UTC(2026, 8, 1) + day * 86400000, d = new Date(t); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function how(steps) { return '<div class="p-how"><h4>How it is calculated</h4><ol>' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>'; }
  function says(html) { return '<p class="p-says"><strong>What it says:</strong> <span>' + html + '</span></p>'; }
  function slider(id, label, min, max, val, extra) {
    return '<div class="p-slider"><label for="' + id + '">' + esc(label) + '</label> <input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="1" value="' + val + '"> <output for="' + id + '" id="' + id + '-out"></output>' + (extra || '') + '</div>';
  }
  function gapText(g) { var x = r(g, 2); return (x > 0 ? '+' : '') + x.toFixed(2); }

  /* ---------- charts (inline SVG, app styling) ---------- */
  function hourBars(counts, o) {
    var W = 560, H = o.h || 130, L = 34, B = 22, T = 14, bw = (W - L - 6) / 24, max = o.max || Math.max.apply(null, counts) || 1;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria) + '">' + Draw.defsSvg();
    if (o.band) { var x0 = L + o.band[0] * bw, x1 = L + Math.min(24, o.band[1]) * bw; s += '<rect class="p-band" x="' + x0 + '" y="' + T + '" width="' + (x1 - x0) + '" height="' + (H - B - T) + '" fill="url(#pat-band)" stroke="#2B2D31" stroke-dasharray="4 3"/>'; }
    counts.forEach(function (c, i) {
      var h = (H - B - T) * c / max, x = L + i * bw + 1;
      s += '<rect x="' + x + '" y="' + (H - B - h) + '" width="' + (bw - 2) + '" height="' + Math.max(0, h) + '" fill="' + Draw.COLORS.accent + '" stroke="#2B2D31" stroke-width="0.5"/>';
      if (i % 3 === 0) s += '<text x="' + (x + bw / 2 - 1) + '" y="' + (H - 8) + '" font-size="12" text-anchor="middle">' + i + '</text>';
    });
    s += '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - 6) + '" y2="' + (H - B) + '" stroke="#2B2D31"/>';
    s += '<text x="0" y="' + (T + 4) + '" font-size="12">' + esc(o.yTop) + '</text><text x="0" y="' + (H - B) + '" font-size="12">0</text>';
    if (o.title) s += '<text x="' + (W - 6) + '" y="' + (T - 2) + '" font-size="12" text-anchor="end" font-weight="bold">' + esc(o.title) + '</text>';
    return s + '</svg>';
  }
  function shareBars(rows) {
    // rows: [{label, n, share}] drawn as 0-100% bars
    var W = 560, lw = 250, bw = W - lw - 60, s = '<svg viewBox="0 0 ' + W + ' ' + (rows.length * 34 + 22) + '" role="img" aria-label="' + esc(rows.map(function (x) { return x.label + ': ' + x.n + ' robots, ' + Math.round(x.share * 100) + '% ran flat on or after the cut-off'; }).join('; ')) + '">' + Draw.defsSvg();
    rows.forEach(function (x, i) {
      var y = 6 + i * 34;
      s += '<text x="0" y="' + (y + 12) + '" font-size="12">' + esc(x.label) + '</text><text x="0" y="' + (y + 26) + '" font-size="12" fill="#4A4D55">' + x.n + ' robots</text>';
      s += '<rect x="' + lw + '" y="' + (y + 4) + '" width="' + bw + '" height="16" fill="#FCFBF8" stroke="#2B2D31"/>';
      s += '<rect x="' + lw + '" y="' + (y + 4) + '" width="' + Math.max(0.5, bw * x.share) + '" height="16" fill="' + (i === 0 ? 'url(#pat-redx)' : Draw.COLORS.accent) + '" stroke="#2B2D31"/>';
      s += '<text x="' + (lw + bw + 4) + '" y="' + (y + 16) + '" font-size="12" font-weight="bold">' + Math.round(x.share * 100) + '%</text>';
    });
    var ay = rows.length * 34 + 16;
    [0, 50, 100].forEach(function (p) { s += '<text x="' + (lw + bw * p / 100) + '" y="' + ay + '" font-size="12" text-anchor="middle">' + p + '%</text>'; });
    return s + '</svg>';
  }
  function watchCurve(cut, thr) {
    var W = 560, H = 200, L = 40, R = 10, T = 12, B = 30, pts = [];
    for (var t = 3; t <= 20; t++) { var w = C.watchList(cut, t); pts.push({ t: t, f: w.shareOfFleet, l: w.shareOfLaterIncidents }); }
    var max = Math.max.apply(null, pts.map(function (p) { return p.l; })) * 1.1 || 1;
    function X(t) { return L + (W - L - R) * (t - 3) / 17; }
    function Y(y) { return H - B - (H - B - T) * y / max; }
    var sel = pts.filter(function (p) { return p.t === thr; })[0];
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Watch list by threshold. At ' + thr + ' incidents: ' + Math.round(sel.f * 100) + '% of the fleet, ' + Math.round(sel.l * 100) + '% of later incidents. ' + pts.map(function (p) { return p.t + ': ' + Math.round(p.f * 100) + '% / ' + Math.round(p.l * 100) + '%'; }).join(', ')) + '">' + Draw.defsSvg();
    s += '<rect class="p-sel" x="' + (X(thr) - 7) + '" y="' + T + '" width="14" height="' + (H - B - T) + '" fill="url(#pat-band)" stroke="#2B2D31" stroke-width="1.5"/>';
    s += '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="#2B2D31"/><line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" stroke="#2B2D31"/>';
    [0, 0.2, 0.4, 0.6, 0.8].forEach(function (y) { if (y <= max) s += '<text x="' + (L - 4) + '" y="' + (Y(y) + 4) + '" font-size="12" text-anchor="end">' + Math.round(y * 100) + '%</text>'; });
    for (var k = 3; k <= 20; k += 1) if (k % 3 === 0 || k === 20) s += '<text x="' + X(k) + '" y="' + (H - B + 14) + '" font-size="12" text-anchor="middle">' + k + '</text>';
    s += '<text x="' + ((L + W) / 2) + '" y="' + (H - 2) + '" font-size="12" text-anchor="middle">threshold: incidents before the cut-off</text>';
    s += '<polyline points="' + pts.map(function (p) { return X(p.t) + ',' + Y(p.l); }).join(' ') + '" fill="none" stroke="' + Draw.COLORS.accent + '" stroke-width="2"/>';
    s += '<polyline points="' + pts.map(function (p) { return X(p.t) + ',' + Y(p.f); }).join(' ') + '" fill="none" stroke="#2B2D31" stroke-width="1.5" stroke-dasharray="5 3"/>';
    pts.forEach(function (p) {
      s += '<rect x="' + (X(p.t) - 3) + '" y="' + (Y(p.l) - 3) + '" width="6" height="6" fill="' + Draw.COLORS.accent + '"/>';
      s += '<circle cx="' + X(p.t) + '" cy="' + Y(p.f) + '" r="3" fill="#FCFBF8" stroke="#2B2D31"/>';
    });
    s += '<text x="' + (X(thr) + 10) + '" y="' + (Y(sel.l) - 6) + '" font-size="12" font-weight="bold">' + Math.round(sel.l * 100) + '% of later incidents</text>';
    s += '<text x="' + (X(thr) + 10) + '" y="' + (Y(sel.f) + 18) + '" font-size="12">' + Math.round(sel.f * 100) + '% of the fleet</text>';
    return s + '</svg>';
  }

  /* ---------- panels ---------- */
  function panel1() {
    var rows = PATS.map(function (p) { var a = C.chargingShare(p, 0, st.cut), b = C.chargingShare(p, st.cut, P.days); return { p: p, a: a, b: b, g: (b - a) * 100 }; });
    var maxGap = Math.max.apply(null, rows.map(function (x) { return Math.abs(x.g); })), siteGap = C.largestSiteGap(st.cut);
    var chart = UI.hbarChart(rows.map(function (x) { return { label: x.p + '  (gap ' + gapText(x.g) + ' points)', bars: [{ v: x.a, kind: 'solid', text: (x.a * 100).toFixed(1) + '% before' }, { v: x.b, kind: 'hatch', text: (x.b * 100).toFixed(1) + '% on or after' }] }; }),
      { max: 0.25, labelW: 200, aria: 'Charging share before and on or after the cut-off. ' + rows.map(function (x) { return x.p + ': ' + (x.a * 100).toFixed(1) + '% before, ' + (x.b * 100).toFixed(1) + '% after, gap ' + gapText(x.g) + ' points'; }).join('; ') });
    var nums = rows.map(function (x) { return '<li>' + x.p + ': ' + N(v(x.a, PSRC.a), 'pct1') + ' before, ' + N(v(x.b, PSRC.a), 'pct1') + ' on or after, gap ' + N(v(r(x.g, 2), PSRC.a), 'f2', { prefix: r(x.g, 2) > 0 ? '+' : '' }) + ' points</li>'; }).join('');
    var h = C.hourlyProfile(st.site), pl = C.planning(st.site, st.swap, RECHARGE.v);
    var hourly = hourBars(h, { aria: 'Average charge sessions starting in each hour of the day at ' + st.site + ': ' + h.map(function (x, i) { return i + ':00 ' + x.toFixed(2); }).join(', '), yTop: pl.peakPerHour.toFixed(1), title: st.site + ': sessions starting per hour (average day)' });
    var note, plan = '';
    if (st.site === 'S08') {
      note = 'Charging starts are spread through the day (' + N(v(pl.perDay, PSRC.calc), 'f1') + ' sessions a day, busiest hour ' + N(v(pl.peakHour, PSRC.calc), 'raw') + ':00). A swap bay has work all day, but only about ' + N(v(pl.operatorLoadAvg * 100, PSRC.calc), 'f0', { suffix: '%' }) + ' of one operator\'s time at ' + N(v(st.swap, PSRC.assumed), 'raw', { noTag: true }) + ' minutes a swap.';
      plan = '<div class="p-plan"><h4>Planning numbers for S08 ' + srcTag('calculated from past charge starts, with assumed swap and recharge minutes') + '</h4>' +
        slider('p-swap', 'Swap minutes', 3, 15, st.swap, ' <span class="tag assumed">assumed</span>') +
        '<table class="p-plan-t"><tbody>' +
        '<tr><th>Swaps per hour</th><td>' + N(v(pl.avgPerHour, PSRC.calc), 'f2') + ' average, ' + N(v(pl.peakPerHour, PSRC.calc), 'f2') + ' in the busiest hour (' + pl.peakHour + ':00)<div class="mono small">sessions a day ' + pl.perDay.toFixed(1) + ' ÷ 24 = ' + pl.avgPerHour.toFixed(3) + '</div></td></tr>' +
        '<tr><th>Operator load</th><td>' + N(v(pl.operatorLoadAvg, PSRC.calc), 'f3') + ' average, ' + N(v(pl.operatorLoadPeak, PSRC.calc), 'f3') + ' at the peak (share of one operator)<div class="mono small" id="p-opload-f">' + pl.avgPerHour.toFixed(3) + ' swaps/h × ' + st.swap + ' min ÷ 60 = ' + pl.operatorLoadAvg.toFixed(3) + '</div></td></tr>' +
        '<tr><th>Spare packs recharging at once</th><td>' + N(v(pl.packsRechargingAvg, PSRC.calc), 'f2') + ' average, ' + N(v(pl.packsRechargingPeak, PSRC.calc), 'f2') + ' at the peak<div class="mono small">' + pl.avgPerHour.toFixed(3) + ' swaps/h × ' + N(RECHARGE, 'raw') + ' min ÷ 60 = ' + pl.packsRechargingAvg.toFixed(2) + ' (100 min: measured average charge session)</div></td></tr>' +
        '</tbody></table></div>';
    } else {
      note = 'Charging starts cluster at ' + pl.peakHour + ':00 (' + N(v(pl.peakPerHour, PSRC.calc), 'f1') + ' sessions a day): this site charges in its rest hours, so a swap bay would have little to do.';
    }
    var sel = '<label for="p-site">Warehouse</label> <select id="p-site">' + SITES.map(function (s) { return '<option value="' + s.id + '"' + (s.id === st.site ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('') + '</select>';
    return '<section class="p-panel" data-ppanel="1"><h3>' + pred() + ' · Charging load: will the next days look like the past? ' + srcTag(PSRC.a) + '</h3>' +
      '<div class="p-cols"><div><h4>Charging share of scheduled time, by shift pattern</h4>' + chart + Draw.svgLegendSwatch('moving') + ' <span class="small">before the cut-off</span> &nbsp; ' + Draw.svgLegendSwatch('charging') + ' <span class="small">on or after</span><ul class="p-nums small">' + nums + '<li>Largest gap at any single site: ' + N(v(r(siteGap, 2), PSRC.a), 'f2') + ' points</li></ul></div>' +
      '<div><h4>Hourly profile</h4><div class="p-ctl">' + sel + '</div>' + hourly + '<p class="small p-note">' + note + '</p>' + plan + '</div></div>' +
      how(['Add up charging hours and scheduled hours for each shift pattern over the days before the cut-off, and divide.', 'Do the same for the days from the cut-off on.', 'The forecast is "the same as before", so the gap between the two is its error, in percentage points.', 'For the hourly profile, count the charge sessions that start in each hour of the day, and divide by 30 days.']) +
      says('Charging share barely moves between the two periods (gaps within ' + N(v(r(maxGap, 1), PSRC.a), 'f1') + ' points; the biggest gap at any single site is ' + N(v(r(siteGap, 1), PSRC.a), 'f1') + ' points), so the same-as-before forecast is close. That is enough to plan swap-bay staff and spare packs by site.') + '</section>';
  }
  function panel2() {
    var f = C.runFlat(st.cut);
    return '<section class="p-panel" data-ppanel="2"><h3>' + pred() + ' · Which robots will run flat again? ' + srcTag(PSRC.b) + '</h3>' +
      shareBars([{ label: 'At least one low-battery stop before', n: f.nEarly, share: f.shareEarly }, { label: 'No low-battery stop before', n: f.nNone, share: f.shareNone }]) +
      '<p class="small">Bars: share of each group with at least one emergency low-battery stop on or after the cut-off. ' + N(v(f.nEarly, PSRC.b), 'int') + ' robots with an early stop, ' + N(v(f.shareEarly, PSRC.b), 'pct1') + ' stopped again; ' + N(v(f.nNone, PSRC.b), 'int') + ' with none, ' + N(v(f.shareNone, PSRC.b), 'pct1') + ' stopped later.</p>' +
      how(['For each robot, count emergency low-battery stops before the cut-off and on or after it.', 'Split robots into those with at least one early stop and those with none.', 'For each group, the share that had at least one stop on or after the cut-off.']) +
      says(N(v(f.shareEarly, PSRC.b), 'pct0') + ' of robots that ran flat before ran flat again, against ' + N(v(f.shareNone, PSRC.b), 'pct0') + ' of robots that had not. A past stop is a strong warning: use it for pack checks and the first swap slots.') + '</section>';
  }
  function panel3() {
    var end = Math.min(24, st.wStart + st.wLen), g = C.dockingWindowShare('glare', st.wStart, st.wLen), o = C.dockingWindowShare('other', st.wStart, st.wLen);
    var gh = P.dockingHour.glare, oh = P.dockingHour.other;
    var line2 = g >= 1.5 * o ? 'A short window holds half of them: apply the exposure setting then, or keep robots off those bays.' : 'The window holds no more than usual.';
    return '<section class="p-panel" data-ppanel="3"><h3>' + pred() + ' · When will docking timeouts happen? ' + srcTag(PSRC.c) + '</h3>' +
      '<div class="p-ctl">' + slider('p-wstart', 'Window start hour', 0, 23, st.wStart) + slider('p-wlen', 'Length in hours', 1, 6, st.wLen) + '</div>' +
      hourBars(gh, { band: [st.wStart, end], aria: 'Docking timeouts by start hour at glare-door sites; window ' + st.wStart + ':00 to ' + end + ':00 holds ' + Math.round(g * 100) + '%. Counts: ' + gh.join(', '), yTop: String(Math.max.apply(null, gh)), title: 'glare-door sites' }) +
      hourBars(oh, { band: [st.wStart, end], aria: 'Docking timeouts by start hour at other sites; window holds ' + Math.round(o * 100) + '%. Counts: ' + oh.join(', '), yTop: String(Math.max.apply(null, oh)), title: 'all other sites' }) +
      '<p class="small">Hatched band: the window ' + st.wStart + ':00 to ' + end + ':00. Glare-door sites ' + N(v(g, PSRC.c), 'pct1') + ', other sites ' + N(v(o, PSRC.c), 'pct1') + ' of docking timeouts start inside it.</p>' +
      how(['Take every docking timeout and the hour it started.', 'Split them by whether the site has glare at its dock doors.', 'Share of each group that starts inside the window.']) +
      says(N(v(g, PSRC.c), 'pct0') + ' of docking timeouts at glare-door sites start between ' + st.wStart + ':00 and ' + end + ':00, against ' + N(v(o, PSRC.c), 'pct0') + ' at other sites. ' + line2) + '</section>';
  }
  function panel4() {
    var w = C.watchList(st.cut, st.thr);
    var line = w.shareOfLaterIncidents >= 2 * w.shareOfFleet ? 'A short weekly watch list covers a much larger share of later incidents than its share of the fleet.' : 'The list covers no more than its share of the fleet.';
    return '<section class="p-panel" data-ppanel="4"><h3>' + pred() + ' · Which robots will fail again? ' + srcTag(PSRC.d) + '</h3>' +
      '<div class="p-cols"><div class="p-big"><div class="p-bignum">' + N(v(P.repeatShare, PSRC.d), 'pct0') + '</div><p>of incidents repeat the same fault on the same robot within 7 days (flag in the incidents tab)</p></div>' +
      '<div>' + slider('p-thr', 'Watch-list threshold (incidents before the cut-off)', 3, 20, st.thr) + watchCurve(st.cut, st.thr) +
      '<p class="small">' + Draw.svgLegendSwatch('moving') + ' solid line, squares: share of later incidents. Dashed line, circles: share of the fleet on the list. Hatched bar: the selected threshold.</p>' +
      '<p class="p-watch">' + N(v(w.n, PSRC.d), 'int') + ' robots (' + N(v(w.shareOfFleet, PSRC.d), 'pct0') + ' of the fleet) produced ' + N(v(w.shareOfLaterIncidents, PSRC.d), 'pct0') + ' of the incidents on or after the cut-off.</p></div></div>' +
      how(['Count each robot\'s incidents before the cut-off.', 'The watch list is robots at or above the threshold.', 'Add up the incidents those robots had on or after the cut-off and divide by all incidents in that period.']) +
      says(line) + '</section>';
  }
  function panel5() {
    return '<section class="p-panel p-grey" data-ppanel="5"><h3>' + pred() + ' · What cannot be tested here ' + srcTag(PSRC.e) + '</h3><ol>' +
      '<li>Component wear: telemetry covers only ' + N(v(P.telemetryDays, PSRC.e), 'int') + ' days, so how far ahead a failing part can be flagged cannot be tested here (' + N(v(P.replacements30d, PSRC.e), 'int') + ' replacements are recorded in 30 days). It needs a longer history.</li>' +
      '<li>Demand and task-planning forecasts need order data; there is none in this data.</li></ol></section>';
  }
  var ACCEPT = ['Start with the same-as-before forecast above.', 'Then count incidents by site, hour and error code over past weeks.', 'If that is not enough, build a robot-level model of who fails next.', 'Train each on earlier days and judge it on later days it has not seen.', 'Accept it only if it beats same-as-before in how many real failures sit in the top 10% of robots flagged, and at what cost in false alarms.'];
  var LIMITS = ['The data generator gives each site and each robot a steady rate, so what held between the first 20 and last 10 days holds partly by design. Real fleets drift.',
    'One split of one 30-day window: no weekly or seasonal pattern, no second test, and some groups are small (S08 has 8 robots, Australia 23 technician visits).',
    'Telemetry covers only 7 days, so wear on motors, lidar windows and contacts cannot be tested here; this needs longer telemetry.',
    'There is no order or warehouse-system data, so demand and task-planning forecasts cannot be built.',
    'A new firmware release, a new site or a layout change breaks a forecast; it has to be re-tested each time. Nothing here predicts an unusual event.',
    'The same-as-before forecast is the only forecast tested. A model would be accepted only if it beats it on later days it was not trained on, and the cost of a false alarm is counted.'];

  function render() {
    var el = document.getElementById('screen-predict');
    el.innerHTML = '<div class="page predict"><h2>Predict: what the past says about what comes next ' + pred() + '</h2>' +
      '<p class="p-italic"><em>Any better method has to beat this on days it was not trained on.</em></p>' +
      '<p class="p-italic"><em>The data was built with a steady rate for each site and robot, so these results hold partly by design. Real fleets drift.</em></p>' +
      '<p>The one forecast tested is <strong>"the same as before"</strong>: learn from the days before a cut-off, check it on the days from it on. Plain statistics in the browser: no model, no LLM, no network. Numbers from the workbook\'s Analysis section 13.</p>' +
      '<div class="p-cut box">' + slider('p-cut', 'Learn from the days before this date, check on the days from it on', 10, 25, st.cut) + '<p class="small" id="p-cut-text"></p></div>' +
      '<div id="p-panels"></div>' +
      '<div class="cols p-bottom"><div class="box"><h3>How I would calculate and accept a real forecast</h3><ol>' + ACCEPT.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="box"><h3>Limits</h3><ol class="p-limits">' + LIMITS.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div></div>' +
      '<p class="p-italic small"><em>These are plain statistics. The LLM does not do any of this; it only reads the results.</em></p></div>';
    var cut = $('#p-cut'); cut.oninput = function () { st.cut = +cut.value; panels(); };
    panels();
  }
  /* re-draw the panels, keeping focus on the control the reader is using */
  function panels() {
    var focus = document.activeElement && document.activeElement.id;
    $('#p-cut-out').textContent = dateOf(st.cut);
    $('#p-cut-text').textContent = dateOf(st.cut) + ': days 1 to ' + st.cut + ' learn, days ' + (st.cut + 1) + ' to ' + P.days + ' test.';
    $('#p-panels').innerHTML = panel1() + panel2() + panel3() + panel4() + panel5();
    bind('#p-site', 'change', function (e) { st.site = e.target.value; panels(); });
    bind('#p-swap', 'input', function (e) { st.swap = +e.target.value; panels(); });
    bind('#p-wstart', 'input', function (e) { st.wStart = +e.target.value; panels(); });
    bind('#p-wlen', 'input', function (e) { st.wLen = +e.target.value; panels(); });
    bind('#p-thr', 'input', function (e) { st.thr = +e.target.value; panels(); });
    [['p-swap', st.swap + ' min'], ['p-wstart', st.wStart + ':00'], ['p-wlen', st.wLen + ' h'], ['p-thr', String(st.thr)]].forEach(function (o) { var e = document.getElementById(o[0] + '-out'); if (e) e.textContent = o[1]; });
    if (focus && /^p-/.test(focus)) { var f = document.getElementById(focus); if (f) f.focus(); }
  }
  function bind(sel, ev, fn) { var e = $(sel); if (e) e.addEventListener(ev, fn); }

  UI.register('predict', render);
  App.on('escape', function () { if (App.screen === 'predict' && !App.guided) UI.show('start'); });
  window.Predict = { state: st, defaults: { cut: P.defaultCutDay, site: 'S08', swap: 5, wStart: 14, wLen: 3, thr: 12 }, render: render, caption: function () {
    var f = C.runFlat(P.defaultCutDay);
    return 'Charging share barely moves between the first 20 and the last 10 days. ' + N(v(f.shareEarly, PSRC.b), 'pct0') + ' of robots that ran flat ran flat again, against ' + N(v(f.shareNone, PSRC.b), 'pct0') + ' of the rest. At glare-door sites ' + N(v(C.dockingWindowShare('glare', 14, 3), PSRC.c), 'pct0') + ' of docking timeouts fall between 14:00 and 17:00, against ' + N(v(C.dockingWindowShare('other', 14, 3), PSRC.c), 'pct0') + ' elsewhere. The limits are on the screen.';
  }, reset: function () { var d = window.Predict.defaults; Object.keys(d).forEach(function (k) { st[k] = d[k]; }); } };
})();
