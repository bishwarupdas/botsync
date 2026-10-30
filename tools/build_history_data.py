"""Builds botsync_walkthrough/assets/js/history-data.js (site history for the Fleet overview) from the workbook.
Usage: python3 -I tools/build_history_data.py source/botsync_dummy_data.xlsx botsync_walkthrough/assets/js/history-data.js
Needs pandas and openpyxl. The page needs no Python.

Packed to keep the file small. Numbers in packed strings are base 36, fixed width:
  u  (utilisation, 30 days x 6 fields x 3 chars): scheduled, moving, idle, charging, error, planned maintenance, each in hundredths of an hour
  cs (charge sessions, 13 chars each): day 1, start minute 3, duration minutes 2, soc start 2, soc end 2, wait minutes 2, trigger 1 (s/o/l)
  m  (missions, last 7 days only, 10 chars each): day 1, start minute 3, duration minutes 2 (00 if not completed), pickup station 1, drop station 1, status 1 (c/a/f), interrupted 1 (y/n)
  inc (incidents, arrays): [day, start minute, code index, downtime in tenths of a minute, recovery index, station number or 0, repeat 1/0]
"""
import sys, json, math
import pandas as pd

src, out = sys.argv[1], sys.argv[2]
x = pd.ExcelFile(src)
sites = x.parse("sites"); robots = x.parse("robots"); packs = x.parse("battery_packs")
util = x.parse("robot_daily_utilization"); inc = x.parse("incidents"); cs = x.parse("charge_sessions")
mis = x.parse("missions"); stations = x.parse("stations")
D0 = pd.Timestamp("2026-09-01"); NDAYS = 30
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"

def b36(n, w):
    n = int(round(n)); assert n >= 0, n
    s = ""
    for _ in range(w):
        s = B36[n % 36] + s; n //= 36
    assert n == 0, "value too large for width"
    return s

def day_min(ts):
    t = pd.Timestamp(ts); d = (t.normalize() - D0).days
    return d, t.hour * 60 + t.minute

def stnum(sid):
    return 0 if not isinstance(sid, str) else int(sid[-2:])

codes = sorted(inc.error_code.unique()); recov = ["auto", "remote", "operator", "tech"]
pk = packs.set_index("pack_id")

R = {}
for _, r in robots.iterrows():
    p = pk.loc[r.battery_pack_id]
    R[r.robot_id] = {"site": r.site_id, "model": r.model, "fw": r.firmware_version, "pack": r.battery_pack_id, "soh": float(p.soh_pct), "cycles": int(p.cycle_count),
                     "status": r.status, "u": "", "inc": [], "cs": "", "m": ""}

util = util.sort_values(["robot_id", "date"])
for rid, g in util.groupby("robot_id"):
    s = ""
    for _, u in g.iterrows():
        for f in ["scheduled_hours", "moving_hours", "idle_hours", "charging_hours", "error_hours", "planned_maintenance_hours"]:
            s += b36(round(float(u[f]) * 100), 3)
    assert len(g) == NDAYS
    R[rid]["u"] = s

for _, i in inc.sort_values("start_ts").iterrows():
    d, m = day_min(i.start_ts)
    R[i.robot_id]["inc"].append([d, m, codes.index(i.error_code), int(round(float(i.downtime_min) * 10)), recov.index(i.recovery_type), stnum(i.station_id), 1 if i.repeat_flag == "Y" else 0])

trig = {"scheduled": "s", "opportunistic": "o", "low_battery_emergency": "l"}
for _, c in cs.sort_values("start_ts").iterrows():
    d, m = day_min(c.start_ts)
    dur = (pd.Timestamp(c.end_ts) - pd.Timestamp(c.start_ts)).total_seconds() / 60
    R[c.robot_id]["cs"] += b36(d, 1) + b36(m, 3) + b36(dur, 2) + b36(c.soc_start_pct, 2) + b36(c.soc_end_pct, 2) + b36(c.wait_for_charger_min, 2) + trig[c.trigger]

for _, k in mis.sort_values("start_ts").iterrows():
    if not isinstance(k.robot_id, str) or pd.isna(k.start_ts):
        continue
    d, m = day_min(k.start_ts)
    dur = 0 if pd.isna(k.complete_ts) else (pd.Timestamp(k.complete_ts) - pd.Timestamp(k.start_ts)).total_seconds() / 60
    R[k.robot_id]["m"] += b36(d, 1) + b36(m, 3) + b36(min(dur, 1295), 2) + b36(stnum(k.pickup_station_id), 1) + b36(stnum(k.drop_station_id), 1) + k.status[0] + ("y" if k.interrupted_flag == "Y" else "n")

S = {}
for _, s in sites.iterrows():
    st = stations[stations.site_id == s.site_id]
    S[s.site_id] = {"name": s.site_name, "shift": s.shift_pattern, "region": s.country_region, "lighting": s.lighting_profile,
                    "robots": list(robots[robots.site_id == s.site_id].robot_id),
                    "stations": {str(stnum(r.station_id)): [r.station_type, r.glare_exposure_flag] for _, r in st.iterrows()}}

missionDays = sorted(set(int(v) for v in ((pd.to_datetime(mis.start_ts).dt.normalize() - D0).dt.days.dropna())))
data = {"day0": "2026-09-01", "days": NDAYS, "missionDays": missionDays, "codes": codes, "recov": recov, "sites": S, "robots": R,
        "counts": {"incidents": int(len(inc)), "chargeSessions": int(len(cs)), "missions": int(mis.robot_id.notna().sum())},
        "src": {"util": "robot_daily_utilization tab", "inc": "incidents tab", "cs": "charge_sessions tab", "mis": "missions tab", "robots": "robots and battery_packs tabs", "st": "stations tab"}}
js = "window.BOTSYNC_DATA = window.BOTSYNC_DATA || {};\nwindow.BOTSYNC_DATA.history = " + json.dumps(data, separators=(",", ":")) + ";\n"
open(out, "w").write(js)
print("wrote", out, len(js) // 1024, "KB")
