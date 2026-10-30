"""Builds assets/js/predict-data.js from botsync_dummy_data.xlsx.
Usage: python3 build_predict_data.py botsync_dummy_data.xlsx assets/js/predict-data.js
Needs: pandas, openpyxl. Run once; the page needs no Python."""
import sys, json
import pandas as pd

src, out = sys.argv[1], sys.argv[2]
x = pd.ExcelFile(src)
sites = x.parse("sites"); robots = x.parse("robots"); inc = x.parse("incidents")
util = x.parse("robot_daily_utilization"); cs = x.parse("charge_sessions")
tel = x.parse("component_telemetry"); rep = x.parse("component_replacements")

D0 = pd.Timestamp("2026-09-01")          # day 0
NDAYS = 30
site_ids = list(sites.site_id)
robot_ids = list(robots.robot_id)

# siteDay[site] = [[chargingHours, scheduledHours] x 30]
util["day"] = (pd.to_datetime(util["date"]) - D0).dt.days
g = util.groupby(["site_id", "day"])[["charging_hours", "scheduled_hours"]].sum()
siteDay = {}
for s in site_ids:
    siteDay[s] = [[round(float(g.loc[(s, d), "charging_hours"]), 3), round(float(g.loc[(s, d), "scheduled_hours"]), 3)]
                  if (s, d) in g.index else [0, 0] for d in range(NDAYS)]

# robotDay[robot] = [[lowBatteryCount, allCount] x 30]
inc["t"] = pd.to_datetime(inc["start_ts"]); inc["day"] = (inc.t.dt.normalize() - D0).dt.days
low = inc[inc.error_code == "ERR_BATTERY_LOW_CRITICAL"].groupby(["robot_id", "day"]).size()
allc = inc.groupby(["robot_id", "day"]).size()
robotDay = {r: [[int(low.get((r, d), 0)), int(allc.get((r, d), 0))] for d in range(NDAYS)] for r in robot_ids}

# docking timeouts by start hour, glare-door sites vs others
glare_sites = set(sites[sites.lighting_profile == "glare_dock_doors"].site_id)
dk = inc[inc.error_code == "ERR_DOCKING_ALIGNMENT_TIMEOUT"].copy(); dk["h"] = dk.t.dt.hour
dockingHour = {"glare": [int(((dk.h == h) & dk.site_id.isin(glare_sites)).sum()) for h in range(24)],
               "other": [int(((dk.h == h) & ~dk.site_id.isin(glare_sites)).sum()) for h in range(24)]}

# charge starts by hour of day, per site (counts over the 30 days)
cs["h"] = pd.to_datetime(cs.start_ts).dt.hour
chargeStartsByHour = {s: [int(((cs.site_id == s) & (cs.h == h)).sum()) for h in range(24)] for s in site_ids}

data = {
    "day0": "2026-09-01", "days": NDAYS, "defaultCutDay": 20,
    "shiftOf": dict(zip(sites.site_id, sites.shift_pattern)),
    "siteName": dict(zip(sites.site_id, sites.site_name)),
    "robotsAt": dict(zip(sites.site_id, [int(v) for v in sites.robots_deployed])),
    "siteDay": siteDay, "robotDay": robotDay,
    "dockingHour": dockingHour, "chargeStartsByHour": chargeStartsByHour,
    "repeatShare": round(float((inc.repeat_flag == "Y").mean()), 4),
    "telemetryDays": int(tel.timestamp.pipe(pd.to_datetime).dt.normalize().nunique()),
    "replacements30d": int(len(rep)),
    "src": {"13a": "Analysis 13a", "13b": "Analysis 13b", "13c": "Analysis 13c", "13d": "Analysis 13d", "13e": "Analysis 13e"},
}
js = "window.BOTSYNC_DATA = window.BOTSYNC_DATA || {};\nwindow.BOTSYNC_DATA.predict = " + json.dumps(data, separators=(",", ":")) + ";\n"
open(out, "w").write(js)
print("wrote", out, len(js) // 1024, "KB")
