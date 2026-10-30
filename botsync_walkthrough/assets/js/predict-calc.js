/* Pure calculations for the Predict screen. Classic script: attaches window.PredictCalc. No DOM here. */
(function (root) {
  var P = (root.BOTSYNC_DATA || {}).predict;

  function sumDays(arr, from, to, idx) { var s = 0; for (var d = from; d < to; d++) s += arr[d][idx]; return s; }

  // 13a: charging share of scheduled time for one shift pattern, over days [from, to)
  function chargingShare(shift, from, to) {
    var c = 0, s = 0;
    for (var site in P.siteDay) if (P.shiftOf[site] === shift) { c += sumDays(P.siteDay[site], from, to, 0); s += sumDays(P.siteDay[site], from, to, 1); }
    return c / s;
  }
  // 13a: largest gap at any single site, in points
  function largestSiteGap(cut) {
    var m = 0;
    for (var site in P.siteDay) {
      var a = sumDays(P.siteDay[site], 0, cut, 0) / sumDays(P.siteDay[site], 0, cut, 1);
      var b = sumDays(P.siteDay[site], cut, P.days, 0) / sumDays(P.siteDay[site], cut, P.days, 1);
      m = Math.max(m, Math.abs(a - b));
    }
    return m * 100;
  }
  // 13b: robots that run flat again. Returns {nEarly, shareEarly, nNone, shareNone}
  function runFlat(cut) {
    var nE = 0, hitE = 0, nN = 0, hitN = 0;
    for (var r in P.robotDay) {
      var e = sumDays(P.robotDay[r], 0, cut, 0), l = sumDays(P.robotDay[r], cut, P.days, 0);
      if (e > 0) { nE++; if (l > 0) hitE++; } else { nN++; if (l > 0) hitN++; }
    }
    return { nEarly: nE, shareEarly: hitE / nE, nNone: nN, shareNone: hitN / nN };
  }
  // 13c: share of docking timeouts starting in [start, start+len) hours, for 'glare' or 'other'
  function dockingWindowShare(group, start, len) {
    var h = P.dockingHour[group], tot = 0, win = 0;
    for (var i = 0; i < 24; i++) { tot += h[i]; if (i >= start && i < start + len) win += h[i]; }
    return win / tot;
  }
  // 13d: watch list of robots with at least thr incidents before the cut-off
  function watchList(cut, thr) {
    var n = 0, later = 0, laterAll = 0, robots = 0;
    for (var r in P.robotDay) {
      robots++;
      var e = sumDays(P.robotDay[r], 0, cut, 1), l = sumDays(P.robotDay[r], cut, P.days, 1);
      laterAll += l; if (e >= thr) { n++; later += l; }
    }
    return { n: n, shareOfFleet: n / robots, shareOfLaterIncidents: later / laterAll };
  }
  // 13a, hourly profile: average sessions starting per hour of the day, for one site
  function hourlyProfile(site) {
    return P.chargeStartsByHour[site].map(function (n) { return n / P.days; });
  }
  // planning numbers for a 24-hour site (all derived; swapMin and rechargeMin are assumptions shown on screen)
  function planning(site, swapMin, rechargeMin) {
    var h = hourlyProfile(site), perDay = h.reduce(function (a, b) { return a + b; }, 0);
    var avg = perDay / 24, peak = Math.max.apply(null, h);
    return { perDay: perDay, avgPerHour: avg, peakPerHour: peak, peakHour: h.indexOf(peak),
             operatorLoadAvg: avg * swapMin / 60, operatorLoadPeak: peak * swapMin / 60,
             packsRechargingAvg: avg * rechargeMin / 60, packsRechargingPeak: peak * rechargeMin / 60 };
  }
  root.PredictCalc = { chargingShare: chargingShare, largestSiteGap: largestSiteGap, runFlat: runFlat,
    dockingWindowShare: dockingWindowShare, watchList: watchList, hourlyProfile: hourlyProfile, planning: planning };
})(window);
