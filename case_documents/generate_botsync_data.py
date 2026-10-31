"""Generates botsync_dummy_data.xlsx: dummy fleet data (250 robots, 30 sites, 30 days) that fills the
Step 1 template defined in botsync_schema.py. Seeded, so reruns give identical data.
Run: python generate_botsync_data.py   (needs botsync_schema.py in the same folder)
"""
import math, bisect, datetime as dt
from collections import defaultdict, Counter
import numpy as np
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
import openpyxl.utils
from openpyxl.styles import Font, PatternFill
from botsync_schema import T

rng = np.random.default_rng(42)
START = dt.datetime(2026, 9, 1)      # window start (a Tuesday)
NDAYS = 30                           # incidents / charging / utilisation cover 30 days
EX0 = 23                             # event-level tables cover the last 7 days (days 23..29 = 24-30 Sep)
HORIZON = NDAYS * 1440

def ts(m): return START + dt.timedelta(minutes=float(m))
def dd(d): return (START + dt.timedelta(days=int(d))).date()
def U(a, b): return float(rng.uniform(a, b))
def N(m, s): return float(rng.normal(m, s))
def LN(mean, sigma): return float(rng.lognormal(math.log(mean) - sigma ** 2 / 2, sigma))
def clip(x, a, b): return max(a, min(b, x))
def r1(x): return round(float(x), 1)
def r2(x): return round(float(x), 2)
def pick(opts, p=None):
    p = None if p is None else np.array(p, dtype=float) / np.sum(p)
    return opts[int(rng.choice(len(opts), p=p))]

D = defaultdict(list)                # table name -> list of row dicts

# ===================== 1. REFERENCE DATA =====================
P1, P2, P3, P4, P5, P6 = ("1 Availability", "2 Failure cause", "3 Environment",
                          "4 Deployment", "5 Traffic", "6 Intervention")
# code: (pillar, category, default severity, auto_recoverable, typical cause, owner, incident weight, (p_auto, p_remote, p_operator, p_tech))
CODES = {
 "ERR_DOCKING_ALIGNMENT_TIMEOUT": (P2, "perception", "soft_stop", "Y", "Glare, skewed or damaged pallet, dirty sensor", "firmware", 30, (.50, .12, .36, .02)),
 "ERR_PALLET_POCKET_NOT_DETECTED": (P2, "perception", "soft_stop", "Y", "Wrapped or broken pallet pocket not seen by depth camera", "firmware", 8, (.25, .15, .55, .05)),
 "ERR_OBSTACLE_PERSISTENT_BLOCK": (P2, "site", "soft_stop", "Y", "Unmapped obstacle or soft curtain in path", "site_ops", 12, (.30, .05, .65, 0)),
 "ERR_PATH_PLANNING_DEADLOCK": (P2, "software", "soft_stop", "Y", "Costmap conflict around a dynamic obstacle", "firmware", 7, (.35, .15, .50, 0)),
 "ERR_INTERSECTION_GRIDLOCK_TIMEOUT": (P5, "orchestration", "soft_stop", "Y", "Multi-robot wait cycle in a narrow aisle", "syncos", 4, (.55, .25, .20, 0)),
 "ERR_SAFETY_LIDAR_ESTOP": (P6, "safety", "hard_stop", "N", "Person or forklift in safety field; manual reset needed", "site_ops", 9, (0, 0, .96, .04)),
 "ERR_LIDAR_DIRT_OBSCURATION": (P3, "hardware", "hard_stop", "N", "Dust or grease on lidar window", "hardware", 5, (.05, .20, .50, .25)),
 "ERR_LOCALIZATION_LOST": (P3, "software", "soft_stop", "Y", "Feature-poor area or layout change", "firmware", 5, (.30, .45, .20, .05)),
 "ERR_FORK_LIMIT_SWITCH_FAULT": (P6, "hardware", "hard_stop", "N", "Limit switch wear or rack jam", "hardware", 3.0, (0, .10, .10, .80)),
 "ERR_LIFT_MOTOR_OVERCURRENT": (P2, "hardware", "hard_stop", "N", "Lift motor or screw wear under 1,400 kg loads", "hardware", 3.0, (0, .20, .10, .70)),
 "ERR_DRIVE_MOTOR_OVERTEMP": (P2, "hardware", "hard_stop", "N", "Drive motor or wheel bearing wear, heat", "hardware", 3.0, (.15, .15, .15, .55)),
 "ERR_CHARGER_CONTACT_FAULT": (P1, "hardware", "hard_stop", "N", "Worn or misaligned charging contacts", "hardware", 2.5, (0, .25, .35, .40)),
 "ERR_BATTERY_LOW_CRITICAL": (P1, "power", "hard_stop", "N", "Battery below 10% before reaching a charger", "syncos", 0, (.05, 0, .95, 0)),
 "ERR_WMS_HANDSHAKE_TIMEOUT": (P4, "integration", "soft_stop", "Y", "WMS / API timeout when pulling the task", "syncos", 4, (.35, .60, .05, 0)),
 "ERR_IO_DEVICE_MISMATCH": (P4, "integration", "hard_stop", "N", "PLC / conveyor handshake mismatch at go-live", "deployment", 0.8, (0, .50, .10, .40)),
 "ERR_MAP_CORRESPONDENCE_FAIL": (P4, "software", "hard_stop", "N", "Map mismatch in a newly commissioned zone", "deployment", 1.0, (0, .70, .10, .20)),
 "ERR_MANUAL_RESET_PENDING": (P6, "software", "hard_stop", "N", "Locked until a technician enters a PIN on the HMI", "firmware", 3, (0, 0, 1.0, 0)),
 "ERR_LOAD_SHIFT_DETECTED": (P2, "hardware", "hard_stop", "N", "Load moved on the forks in transit", "site_ops", 2, (0, 0, .85, .15)),
 "ERR_FLEET_MANAGER_LINK_LOST": (P3, "network", "soft_stop", "Y", "Wi-Fi dead zone; robot stops waiting for SyncOS", "site_it", 2.0, (.75, .20, .05, 0)),
 "WARN_WIFI_SIGNAL_DROPOUT": (P3, "network", "warn", "Y", "Momentary Wi-Fi loss; robot reconnects", "site_it", 0, None),
 "WARN_PATH_REPLAN_EXCESSIVE": (P5, "software", "warn", "Y", "Frequent replans around pedestrians or forklifts", "firmware", 0, None),
 "EVENT_TRAFFIC_YIELD_WAIT": (P5, "orchestration", "info", "Y", "Waiting for right of way at an intersection", "syncos", 0, None),
 "WARN_LOCALIZATION_DRIFT_HIGH": (P3, "software", "warn", "Y", "Localisation confidence dips in a feature-poor area", "firmware", 0, None),
 "WARN_FLOOR_SLIPPAGE_DETECTED": (P3, "hardware", "warn", "Y", "Wheel slip on wet, polished or uneven floor", "site_ops", 0, None),
 "EVENT_AMBIENT_LIGHT_GLARE": (P3, "perception", "warn", "Y", "Direct sunlight at a dock door", "firmware", 0, None),
 "EVENT_SCHEDULED_CHARGE_START": (P1, "power", "info", "Y", "Normal start of a charge session", "syncos", 0, None),
 "ERR_BATTERY_SOH_DEGRADATION": (P1, "power", "warn", "N", "Pack resistance rising, runtime shrinking", "hardware", 0, None),
 "ERR_CHARGING_STATION_OCCUPIED": (P1, "power", "warn", "Y", "Charger busy on arrival", "syncos", 0, None),
 "ERR_TASK_ALLOCATION_QUEUE_DELAY": (P5, "orchestration", "warn", "Y", "Task waited for a free robot", "syncos", 0, None),
 "EVENT_MANUAL_OVERRIDE_ENGAGED": (P6, "operator", "info", "N", "Operator took manual control", "site_ops", 0, None),
 "EVENT_HELP_CALL_TRIGGERED": (P6, "operator", "warn", "N", "Robot exhausted automatic recovery and called for help", "firmware", 0, None),
 "EVENT_NODE_CONFIGURATION_UPDATE": (P4, "deployment", "info", "Y", "Station / node map pushed to the site server", "deployment", 0, None),
 "WARN_BATTERY_TEMP_HIGH": (P1, "power", "warn", "Y", "Cell temperature high during fast charge", "hardware", 0, None),
}
INC_CODES = [c for c, v in CODES.items() if v[6] > 0]
NEEDS_STATION = {"ERR_DOCKING_ALIGNMENT_TIMEOUT", "ERR_PALLET_POCKET_NOT_DETECTED", "ERR_OBSTACLE_PERSISTENT_BLOCK",
                 "ERR_PATH_PLANNING_DEADLOCK", "ERR_SAFETY_LIDAR_ESTOP", "ERR_LOAD_SHIFT_DETECTED"}
NEEDS_MISSION = NEEDS_STATION | {"ERR_INTERSECTION_GRIDLOCK_TIMEOUT", "ERR_LOCALIZATION_LOST",
                                 "ERR_LIFT_MOTOR_OVERCURRENT", "ERR_FORK_LIMIT_SWITCH_FAULT", "ERR_DRIVE_MOTOR_OVERTEMP"}
for c, v in CODES.items():
    D["error_codes"].append(dict(error_code=c, pillar=v[0], category=v[1], severity=v[2], auto_recoverable=v[3],
                                 typical_cause=v[4], owner_team=v[5]))

CUST = [("Apex Foods", "FMCG"), ("Meridian Auto Components", "Automotive"), ("Kestrel Logistics", "Distribution Centre"),
        ("Sundara Beverages", "FMCG"), ("Orion Powertrain", "Automotive"), ("Lotus Consumer Goods", "FMCG"),
        ("Harbor Cold Chain", "Distribution Centre"), ("Vanguard Wheels", "Automotive"), ("Zephyr Personal Care", "FMCG"),
        ("Pinnacle Distribution", "Distribution Centre"), ("Aurum Packaging", "FMCG"), ("Tidewater Auto Parts", "Automotive"),
        ("Banyan Dairy", "FMCG"), ("Northfield Transmission", "Automotive"), ("Coral Beverages", "FMCG"),
        ("Summit Fulfilment", "Distribution Centre"), ("Ironbridge Castings", "Automotive"), ("Maple Home Care", "FMCG")]
INDIA = ["Chennai", "Pune", "Gurgaon", "Bengaluru", "Hyderabad", "Ahmedabad", "Sanand", "Chakan", "Hosur", "Manesar",
         "Kolkata", "Nashik", "Coimbatore", "Visakhapatnam", "Indore", "Noida"]
SEA = ["Rayong", "Cikarang", "Ho Chi Minh City", "Penang", "Tuas Singapore", "Bangkok", "Surabaya", "Johor Bahru", "Hanoi"]
AU = ["Melbourne", "Sydney", "Brisbane", "Perth", "Adelaide"]
REG = [("India", c) for c in INDIA] + [("Southeast Asia", c) for c in SEA] + [("Australia", c) for c in AU]
REG = [REG[i] for i in rng.permutation(30)]
cust_of_site = list(range(18)) + [int(x) for x in rng.integers(0, 18, 12)]
rng.shuffle(cust_of_site)

wreg = {"India": 1.0, "Southeast Asia": 1.2, "Australia": 3.0}
greenfield = set(np.argsort([wreg[REG[i][0]] * rng.random() for i in range(30)])[-6:].tolist())
bf_idx = [i for i in range(30) if i not in greenfield]
shifts = ["24x7"] * 10 + ["16x7"] * 14 + ["16x6"] * 6
rng.shuffle(shifts)
glare = [int(x) for x in rng.choice(bf_idx, 5, replace=False)]
damaged = set(glare[:2]) | {int(x) for x in rng.choice([i for i in bf_idx if i not in glare], 4, replace=False)}
newsite = {int(x) for x in rng.choice([i for i in bf_idx if i not in glare], 4, replace=False)}
sh24 = [i for i in range(30) if shifts[i] == "24x7"]
constrained = {int(x) for x in rng.choice(sh24, 5, replace=False)}
undercharged = {int(x) for x in rng.choice(sh24, 2, replace=False)}

sizes = np.clip(np.round(rng.lognormal(math.log(8.2), 0.45, 30)), 4, 20).astype(int)
while sizes.sum() != 250:
    i = int(rng.integers(0, 30))
    if sizes.sum() > 250 and sizes[i] > 4: sizes[i] -= 1
    elif sizes.sum() < 250 and sizes[i] < 20: sizes[i] += 1

S = {}
for i in range(30):
    sid = f"S{i + 1:02d}"
    cname, ind = CUST[cust_of_site[i]]
    region, city = REG[i]
    bf = i not in greenfield
    n = int(sizes[i])
    area = int(n * U(1500, 3500))
    aisle = r1(U(2.3, 3.2) if bf else U(3.2, 3.8))
    floor = "flat" if not bf else pick(["flat", "uneven", "wet_spills", "polished"], [.35, .25, .20, .20])
    light = "glare_dock_doors" if i in glare else ("stable" if not bf else pick(["low_light", "mixed", "stable"], [.25, .45, .30]))
    pallet = "damaged" if i in damaged else ("good" if not bf else pick(["mixed", "good"], [.55, .45]))
    wifi = int(clip(N(62, 14) if bf else N(88, 5), 25, 96))
    new = i in newsite
    gl = (START.date() - dt.timedelta(days=U(10, 75))) if new else (START.date() - dt.timedelta(days=U(150, 1100)))
    cycle = {"FMCG": 22, "Automotive": 28, "Distribution Centre": 18}[ind] * U(.9, 1.1)
    dens = n / area * 1000
    S[sid] = dict(sid=sid, cust=f"C{cust_of_site[i] + 1:02d}", city=city, region=region, industry=ind, bf=bf,
                  type="brownfield" if bf else "greenfield", floor=floor, lighting=light, pallet=pallet, wifi=wifi,
                  aisle=aisle, shift=shifts[i], robots=n, go_live=gl, contract_start=gl - dt.timedelta(days=int(U(60, 150))),
                  area=area, cpr=0.22 if i in undercharged else U(.4, .6), constrained=i in constrained,
                  glare=i in glare, dusty=1 if rng.random() < (0.7 if ind == "Automotive" else 0.15) else 0, new=1 if new else 0,
                  demand=U(.90, .96) if i in constrained else (U(.55, .75) if shifts[i] == "24x7" else U(.60, .85)),
                  forklift=U(3, 18) if bf else U(0, 6), cycle=cycle, dens_f=clip((dens / .45) ** 1.5, .2, 6),
                  aisle_f=clip((3.0 / aisle) ** 3, .3, 4), site_f=LN(1.0, .3) * (1.25 if bf else .6),
                  moves_hr=60 / cycle, alloc_mean=0.4 * (6 if i in constrained else 1) * (1 + .3 * dens / .45))
    s = S[sid]
    D["sites"].append(dict(site_id=sid, customer_id=s["cust"], site_name=f"{city} {'DC' if ind == 'Distribution Centre' else 'Plant'}",
        country_region=region, industry=ind, site_type=s["type"], floor_condition=floor, lighting_profile=light,
        wifi_quality_score=wifi, aisle_width_min_m=aisle, shift_pattern=shifts[i], robots_deployed=n,
        contract_start_date=s["contract_start"], go_live_date=gl))

def window(site, d):
    wd = (START + dt.timedelta(days=d)).weekday()
    if site["shift"] == "24x7": return (d * 1440, (d + 1) * 1440)
    if site["shift"] == "16x6" and wd == 6: return None
    return (d * 1440 + 360, d * 1440 + 1320)

# ---- stations ----
ST = {}
for sid, s in S.items():
    lst = []
    for k in range(int(6 + s["robots"] * .7)):
        typ = pick(["floor_staging", "rack", "conveyor", "dock_door"], [.35, .30, .15, .20])
        lst.append(dict(station_id=f"{sid}-ST{k + 1:02d}", site_id=sid, station_type=typ,
            rack_height_mm=int(pick([1100, 1600, 2400, 3500], [.35, .40, .15, .10])) if typ == "rack" else 0,
            glare_exposure_flag="Y" if (typ == "dock_door" and s["glare"] and rng.random() < .8) else "N",
            pallet_condition_profile=s["pallet"]))
    ST[sid] = lst
    D["stations"].extend(lst)

# ---- firmware, robots, batteries ----
FWV = [("v3.4.2", dt.date(2025, 11, 10), "Docking retry tuning; costmap inflation fix"),
       ("v3.5.0", dt.date(2026, 1, 20), "VDA5050 interface update; SyncOS client v2"),
       ("v3.5.3", dt.date(2026, 3, 18), "Lidar self-test; lift current logging"),
       ("v3.6.0", dt.date(2026, 5, 12), "New pallet pose estimator for docking"),
       ("v3.6.1", dt.date(2026, 7, 8), "Docking estimator hot-fix; glare filter"),
       ("v3.7.0", dt.date(2026, 8, 20), "Telemetry v2; relocalisation improvements")]
fwbase = np.array([.10, .18, .22, .22, .16, .12])
R = {}
n_r = 0
for sid, s in S.items():
    for _ in range(s["robots"]):
        n_r += 1
        rid = f"R{n_r:03d}"
        w = fwbase.copy()
        if s["glare"] or s["pallet"] == "damaged": w[3] *= 3          # v3.6.0 over-represented at problem sites
        fw = FWV[int(rng.choice(6, p=w / w.sum()))][0]
        comm = s["go_live"] - dt.timedelta(days=U(0, 20))
        days = (START.date() - comm).days
        cpd = 2.3 if s["shift"] == "24x7" else 1.5
        inst, cyc = comm, days * cpd
        soh = 100 - 0.0105 * cyc - abs(N(0, 1.2))
        if soh < 72:
            inst = START.date() - dt.timedelta(days=U(40, 400)); cyc = (START.date() - inst).days * cpd
            soh = 100 - 0.0105 * cyc - abs(N(0, 1.2))
        soh = clip(soh, 62, 99.5)
        hot = 2.5 if s["region"] != "Australia" else 0
        pack = f"BP-{n_r:04d}"
        D["battery_packs"].append(dict(pack_id=pack, install_date=inst, capacity_kwh_rated=10.0, soh_pct=r1(soh),
            cycle_count=int(cyc), max_cell_temp_c=r1(N(41, 3) + hot + 0.12 * (100 - soh)),
            internal_resistance_mohm=r1(18 + .55 * (100 - soh) + N(0, 1.2))))
        R[rid] = dict(rid=rid, site=sid, comm=comm, fw=fw, pack=pack, soh=soh, lemon=None,
                      runtime_min=9.0 * soh / 100 * N(1, .03) * 60, rf=float(rng.gamma(1.3, 1 / 1.3)), days0=days,
                      op_hours0=int(days * (22 if s["shift"] == "24x7" else 15) * U(.85, 1.0)),
                      lift0=int(days * U(45, 70) * (1.0 if s["shift"] == "24x7" else .8)))
LEMON_TYPES = ["fork_switch"] * 3 + ["lift_motor"] * 3 + ["drive_motor"] * 2 + ["lidar_window"] * 3 + ["charger_contact"] * 3
LEMON_CODE = {"fork_switch": "ERR_FORK_LIMIT_SWITCH_FAULT", "lift_motor": "ERR_LIFT_MOTOR_OVERCURRENT",
              "drive_motor": "ERR_DRIVE_MOTOR_OVERTEMP", "lidar_window": "ERR_LIDAR_DIRT_OBSCURATION",
              "charger_contact": "ERR_CHARGER_CONTACT_FAULT"}
for rid, lt in zip(rng.choice(list(R), 14, replace=False), LEMON_TYPES):
    R[str(rid)]["lemon"] = lt

# ===================== 2. CHARGING, INCIDENTS, UTILISATION, MISSIONS =====================
BASE_RATE = 0.30                       # incidents per robot-day before site / robot multipliers
busy = {rid: [] for rid in R}          # (start, end, kind, ref), minutes since START
CH, INC = [], []

def new_incident(rid, code, start, rtype, resp, hands, station=""):
    INC.append(dict(rid=rid, site=R[rid]["site"], code=code, start=start, resp=resp, hands=hands, down=resp + hands,
                    rtype=rtype, station=station, need_mission=False, mission=None))
    busy[rid].append((start, start + resp + hands, "inc", len(INC) - 1))
    return len(INC) - 1

def recovery(code, region):
    rtype = pick(["auto", "remote", "operator", "tech"], CODES[code][7])
    if rtype == "auto": resp, hands = 0.0, clip(LN(4.5, .5), 2, 20)
    elif rtype == "operator": resp, hands = clip(N(8, 3), 2, 25), clip(LN(13, .5), 3, 50)
    elif rtype == "remote": resp, hands = clip(N(18, 6), 5, 45), clip(LN(28, .6), 8, 120)
    else:
        resp = clip({"India": N(170, 55), "Southeast Asia": N(320, 100), "Australia": N(260, 80)}[region], 60, 720)
        hands = clip(LN(115, .5), 40, 360)
    return rtype, r1(resp), r1(hands)

def draw_wait(s):
    pw = clip((0.45 - s["cpr"]) * 2.2, 0, 0.8)
    return LN(26, .6) if rng.random() < pw else 0.0

def soc_start(s, kind):
    if kind == "scheduled":
        pe = .06 if s["constrained"] else (.02 if s["shift"] == "24x7" else .008)
        if rng.random() < pe: return U(3, 9.5), "low_battery_emergency"
        return clip(N(16, 5), 8, 30), "scheduled"
    return clip(N(42, 8), 20, 65), "opportunistic"

def add_session(rid, arrival, wait, soc_s, soc_e, trig):
    s = S[R[rid]["site"]]
    start = arrival + wait
    end = start + (soc_e - soc_s) / (.72 * N(1, .06))
    CH.append(dict(rid=rid, site=s["sid"], arrival=arrival, start=start, end=end, soc_s=soc_s, soc_e=soc_e, wait=wait, trig=trig))
    busy[rid].append((arrival, end, "charge", len(CH) - 1))
    if trig == "low_battery_emergency":              # robot stalled before reaching the charger
        if rng.random() < .05: rtype, resp, hands = "auto", 0.0, clip(LN(4.5, .5), 2, 20)
        else: rtype, resp, hands = "operator", clip(N(8, 3), 2, 25), clip(LN(22, .4), 8, 70)
        new_incident(rid, "ERR_BATTERY_LOW_CRITICAL", arrival - resp - hands, rtype, r1(resp), r1(hands))
    return end

def place(rid, s0, dur):                             # shift an interval past anything already busy
    moved = True
    while moved:
        moved = False
        for (bs, be, _, _) in busy[rid]:
            if s0 < be and s0 + dur > bs:
                s0 = be + .5; moved = True
    return s0

def code_probs(s, rb):
    g, dmg, bf = s["glare"], s["pallet"] == "damaged", s["bf"]
    fwm = 1.25 if rb["fw"] == "v3.6.0" else 1.0
    mods = {"ERR_DOCKING_ALIGNMENT_TIMEOUT": (1 + 2.5 * g + 1.5 * dmg + .4 * bf) * fwm,
            "ERR_PALLET_POCKET_NOT_DETECTED": (1 + 1.5 * dmg) * (1 + .3 * bf),
            "ERR_OBSTACLE_PERSISTENT_BLOCK": 1 + .6 * bf + s["forklift"] / 25,
            "ERR_PATH_PLANNING_DEADLOCK": 1 + .5 * bf,
            "ERR_INTERSECTION_GRIDLOCK_TIMEOUT": clip(s["dens_f"] * s["aisle_f"], .2, 6),
            "ERR_SAFETY_LIDAR_ESTOP": 1 + s["forklift"] / 12,
            "ERR_LIDAR_DIRT_OBSCURATION": 1 + 4 * s["dusty"],
            "ERR_LOCALIZATION_LOST": 1 + .6 * bf + (.5 if s["floor"] == "polished" else 0) + 3 * s["new"],
            "ERR_WMS_HANDSHAKE_TIMEOUT": 1 + 3 * s["new"], "ERR_IO_DEVICE_MISMATCH": 1 + 8 * s["new"],
            "ERR_MAP_CORRESPONDENCE_FAIL": 1 + 12 * s["new"],
            "ERR_FLEET_MANAGER_LINK_LOST": clip((100 - s["wifi"]) / 40, .1, 1.9),
            "ERR_CHARGER_CONTACT_FAULT": 1 + .5 * (s["shift"] == "24x7")}
    w = np.array([CODES[c][6] * mods.get(c, 1.0) for c in INC_CODES])
    if rb["lemon"]: w[INC_CODES.index(LEMON_CODE[rb["lemon"]])] *= 30
    return w / w.sum()

def pick_station(s, code):
    lst = ST[s["sid"]]
    w = [{"dock_door": 1.0, "rack": 1.0, "floor_staging": 1.0, "conveyor": .7}[x["station_type"]] *
         (4 if code in ("ERR_DOCKING_ALIGNMENT_TIMEOUT", "ERR_PALLET_POCKET_NOT_DETECTED") and x["glare_exposure_flag"] == "Y" else 1)
         for x in lst]
    return pick(lst, w)["station_id"]

for rid, rb in R.items():
    s = S[rb["site"]]; rt = rb["runtime_min"]
    # --- charge sessions ---
    if s["shift"] == "24x7":                          # continuous run / charge cycles
        t = -U(0, rt + 120)
        while True:
            arrival = t + rt * N(1, .03)
            if arrival >= HORIZON: break
            wt = draw_wait(s); ss, tr = soc_start(s, "scheduled"); se = U(92, 100)
            t = add_session(rid, arrival, wt, ss, se, tr) if arrival >= 0 else arrival + wt + (se - ss) / .72
    else:                                             # one in-shift charge + one overnight top-up per shift day
        for d in range(NDAYS):
            w = window(s, d)
            if w is None: continue
            ss, tr = soc_start(s, "scheduled")
            add_session(rid, w[0] + rt * U(.95, 1.04), draw_wait(s), ss, U(92, 100), tr)
            if w[1] + 50 < HORIZON:
                ss, tr = soc_start(s, "opportunistic")
                add_session(rid, w[1] + U(10, 50), 0.0, ss, U(95, 100), tr)
    # --- planned maintenance and random incidents ---
    pr = code_probs(s, rb)
    for d in range(NDAYS):
        w = window(s, d)
        if w is None: continue
        wl = w[1] - w[0]
        if rng.random() < .02:
            dur = U(60, 180); st0 = place(rid, w[0] + U(0, wl - dur), dur)
            busy[rid].append((st0, st0 + dur, "maint", None))
        lam = BASE_RATE * s["site_f"] * rb["rf"] * (wl / 1440) * (1 + .8 * s["new"]) * (1.8 if rb["lemon"] else 1)
        for _ in range(int(rng.poisson(lam))):
            code = INC_CODES[int(rng.choice(len(INC_CODES), p=pr))]
            if code == "ERR_DOCKING_ALIGNMENT_TIMEOUT" and s["glare"] and rng.random() < .6:
                t0 = clip(d * 1440 + N(15.5 * 60, 70), w[0], w[1] - 1)       # afternoon sun at dock doors
            else:
                t0 = w[0] + U(0, wl)
            rtype, resp, hands = recovery(code, s["region"])
            st0 = place(rid, t0, resp + hands)
            if st0 >= HORIZON: continue
            i = new_incident(rid, code, st0, rtype, resp, hands, pick_station(s, code) if code in NEEDS_STATION else "")
            INC[i]["need_mission"] = code in NEEDS_MISSION and rng.random() < .9

order = sorted(range(len(INC)), key=lambda i: INC[i]["start"])
for n, i in enumerate(order): INC[i]["id"] = f"INC-{n + 1:06d}"
for rid in busy: busy[rid].sort(key=lambda x: x[0])

# ---- utilisation + missions: fill the free time around charging, incidents and maintenance ----
MIS, UTIL = [], []
PICKS = {sid: [x for x in ST[sid] if x["station_type"] in ("floor_staging", "rack", "dock_door")] for sid in S}
DROPS = {sid: [x for x in ST[sid] if x["station_type"] in ("rack", "conveyor", "floor_staging")] for sid in S}
PALLET_MIX = {"good": (["EU_good", "plastic_wrapped"], [.9, .1]),
              "mixed": (["EU_good", "EU_damaged", "plastic_wrapped", "custom_carrier"], [.55, .20, .15, .10]),
              "damaged": (["EU_damaged", "EU_good", "plastic_wrapped", "custom_carrier"], [.45, .25, .15, .15])}

def add_mission(rid, s, a, b, status, interrupted):
    alloc, disp = LN(s["alloc_mean"], .8), U(.1, .8)
    pt = PALLET_MIX[s["pallet"]]
    m = dict(site=s["sid"], robot=rid, pk=PICKS[s["sid"]][int(rng.integers(len(PICKS[s["sid"]])))]["station_id"],
             dp=DROPS[s["sid"]][int(rng.integers(len(DROPS[s["sid"]])))]["station_id"],
             created=a - alloc - disp, assigned=a - disp, start=a, end=b, status=status,
             payload=int(clip(N(780, 250), 150, 1400)), pallet=pick(pt[0], pt[1]), interrupted="Y" if interrupted else "N")
    MIS.append(m)
    return m

for rid, rb in R.items():
    s = S[rb["site"]]
    b = busy[rid]; ends = [x[1] for x in b]
    for d in range(NDAYS):
        w = window(s, d)
        if w is None:
            UTIL.append(dict(robot_id=rid, site_id=s["sid"], date=dd(d), scheduled_hours=0, moving_hours=0, idle_hours=0,
                             charging_hours=0, error_hours=0, planned_maintenance_hours=0, availability_pct=""))
            continue
        w0, w1 = w
        i = max(0, bisect.bisect_right(ends, w0) - 3)
        cur, gaps, ov = w0, [], dict(charge=0.0, inc=0.0, maint=0.0)
        while i < len(b) and b[i][0] < w1:
            bs, be, kind, ref = b[i]; i += 1
            if be <= w0: continue
            ov[kind] += min(be, w1) - max(bs, w0)
            if bs > cur: gaps.append((cur, min(bs, w1), kind, ref))
            cur = max(cur, be)
        if cur < w1: gaps.append((cur, w1, None, None))
        free = sum(g1 - g0 for g0, g1, _, _ in gaps)
        target, moving = free * s["demand"] * N(1, .04), 0.0
        for g0, g1, kind, ref in gaps:
            if g1 - g0 < 8: continue
            trunc = kind == "inc" and INC[ref]["need_mission"] and (g1 - g0) >= 20
            limit = g1 - (U(4, 16) if trunc else 0)
            t = g0 + U(0, 5)
            while moving < target and t + 8 < limit:
                dur = max(8.0, LN(s["cycle"], .35))
                if t + dur > limit: break
                moving += dur
                if d >= EX0: add_mission(rid, s, t, t + dur, "completed" if rng.random() < .985 else "aborted", False)
                t += dur + float(rng.exponential(2.0))
            if trunc:                                  # the mission running when the incident hit
                s0 = max(t, limit)
                if s0 < g1 - 2:
                    moving += g1 - s0
                    if d >= EX0: INC[ref]["mission"] = add_mission(rid, s, s0, g1, "failed", True)
        sched, avail = (w1 - w0) / 60, free / 60
        UTIL.append(dict(robot_id=rid, site_id=s["sid"], date=dd(d), scheduled_hours=r1(sched), moving_hours=r2(moving / 60),
                         idle_hours=r2(max(0, avail - moving / 60)), charging_hours=r2(ov["charge"] / 60),
                         error_hours=r2(ov["inc"] / 60), planned_maintenance_hours=r2(ov["maint"] / 60),
                         availability_pct=r1(avail / sched * 100)))
MIS.sort(key=lambda m: m["start"])
for n, m in enumerate(MIS): m["id"] = f"M-{n + 1:06d}"
D["robot_daily_utilization"] = UTIL

# ===================== 3. DERIVED TABLES =====================
def iid(i): return INC[i]["id"]
RESP = {"auto": "none (auto)", "remote": "remote_support", "operator": "site_operator", "tech": "field_technician"}
ACTION = {"perception": "Re-approach with adjusted pose / wipe sensor", "site": "Cleared obstacle from path", "software": "Restarted navigation stack / re-localised",
          "orchestration": "Reassigned right of way, released robot", "safety": "Cleared safety field and reset", "hardware": "Inspected and replaced or cleaned component",
          "power": "Manually moved robot to charger", "integration": "Corrected interface mapping / retried handshake", "network": "Waited for reconnect",
          "operator": "Manual reset", "deployment": "Re-pushed node map"}
COMP = {"ERR_FORK_LIMIT_SWITCH_FAULT": ("fork_limit_switch", 9500), "ERR_LIFT_MOTOR_OVERCURRENT": ("lift_motor", 62000),
        "ERR_DRIVE_MOTOR_OVERTEMP": ("drive_motor", 48000), "ERR_LIDAR_DIRT_OBSCURATION": ("lidar_window", 7500),
        "ERR_CHARGER_CONTACT_FAULT": ("charging_contacts", 6500), "ERR_LOAD_SHIFT_DETECTED": ("fork_carriage", 14000)}
EX_START = EX0 * 1440

# customers
cust_robots = Counter()
for _s in S.values(): cust_robots[_s["cust"]] += _s["robots"]
for k, (nm, ind) in enumerate(CUST, 1):
    cid = f"C{k:02d}"; n = cust_robots.get(cid, 0)
    D["customers"].append(dict(customer_id=cid, customer_name=nm, industry=ind, contract_value_inr_lakh=r1(n * U(14, 22)),
        sla_uptime_target_pct=pick([95, 97, 98], [.3, .5, .2]), sla_penalty_per_breach_inr=int(pick([50000, 100000, 150000], [.4, .4, .2])),
        renewal_date=START.date() + dt.timedelta(days=int(U(60, 700))), churn_risk_flag="Y" if rng.random() < .2 else "N", robots_contracted=n))
fwcount = Counter(r["fw"] for r in R.values())
for v, rd, notes in FWV:
    D["firmware_versions"].append(dict(version=v, release_date=rd, change_notes=notes, rollout_pct=r1(fwcount[v] / 250 * 100)))
for rid, r in R.items():
    s = S[r["site"]]
    status = "in_service"
    D["robots"].append(dict(robot_id=rid, site_id=r["site"], model="MAG1400 Fork", commission_date=r["comm"], firmware_version=r["fw"],
        battery_pack_id=r["pack"], lifetime_operating_hours=r["op_hours0"] + int(sum(u["scheduled_hours"] for u in () )) , lifetime_lift_cycles=r["lift0"], status=status))
# robot lifetime hours include the 30-day window
_h = defaultdict(float); _c = defaultdict(int)
for u in UTIL: _h[u["robot_id"]] += u["moving_hours"] + u["idle_hours"]
for m in MIS: pass
for row in D["robots"]:
    row["lifetime_operating_hours"] = int(R[row["robot_id"]]["op_hours0"] + _h[row["robot_id"]])
    row["lifetime_lift_cycles"] = int(R[row["robot_id"]]["lift0"] + _h[row["robot_id"]] * S[row["site_id"]]["moves_hr"] * .6)

# charge sessions
for n, c in enumerate(CH, 1):
    s = S[c["site"]]; nch = max(1, round(s["cpr"] * s["robots"]))
    D["charge_sessions"].append(dict(session_id=f"CS-{n:06d}", robot_id=c["rid"], site_id=c["site"], pack_id=R[c["rid"]]["pack"],
        start_ts=ts(c["start"]), end_ts=ts(c["end"]), soc_start_pct=r1(c["soc_s"]), soc_end_pct=r1(c["soc_e"]),
        charger_id=f"{c['site']}-CH{int(rng.integers(1, nch + 1))}", wait_for_charger_min=r1(c["wait"]), trigger=c["trig"]))
# missions
for m in MIS:
    D["missions"].append(dict(mission_id=m["id"], site_id=m["site"], robot_id=m["robot"], pickup_station_id=m["pk"], drop_station_id=m["dp"],
        created_ts=ts(m["created"]), assigned_ts=ts(m["assigned"]), start_ts=ts(m["start"]), complete_ts=ts(m["end"]) if m["status"] != "failed" else "",
        status=m["status"], payload_kg=m["payload"], pallet_type=m["pallet"], interrupted_flag=m["interrupted"]))

# incidents, events, interventions, recovery attempts, tickets
last_seen = {}
EV = []
for n, i in enumerate(order):
    x = INC[i]; rid = x["rid"]; s = S[x["site"]]; code = x["code"]
    key = (rid, code); prev = last_seen.get(key)
    rep = "Y" if prev is not None and x["start"] - prev < 7 * 1440 else "N"; last_seen[key] = x["start"]
    x["repeat"] = rep
    x["end"] = x["start"] + x["down"]
    cat = CODES[code][1]
    ptech = x["rtype"] == "tech"
    confirmed = "Y" if (ptech and rng.random() < .9) or (not ptech and rng.random() < .4) else "N"
    x["first_event"] = ""
    if x["start"] >= EX_START:
        eid = f"EV-{len(EV) + 1:07d}"; x["first_event"] = eid
        EV.append((x["start"], dict(event_id=eid, robot_id=rid, site_id=x["site"], timestamp=ts(x["start"]), error_code=code,
            severity=CODES[code][2], duration_sec=int(x["down"] * 60), auto_cleared="Y" if x["rtype"] == "auto" else "N",
            mission_id=x["mission"]["id"] if x["mission"] else "")))
        if rep == "Y":                                 # repeated faults mask each other: extra events inside the same incident
            for _ in range(int(rng.integers(1, 4))):
                eid = f"EV-{len(EV) + 1:07d}"
                EV.append((x["start"], dict(event_id=eid, robot_id=rid, site_id=x["site"], timestamp=ts(x["start"] + U(.5, max(1, x["down"]))),
                    error_code=code, severity=CODES[code][2], duration_sec=int(U(20, 200)), auto_cleared="N", mission_id="")))
    D["incidents"].append(dict(incident_id=x["id"], robot_id=rid, site_id=x["site"], station_id=x["station"],
        mission_id=x["mission"]["id"] if x["mission"] else "", error_code=code, first_event_id=x["first_event"], start_ts=ts(x["start"]),
        end_ts=ts(x["end"]), downtime_min=r1(x["down"]), recovery_type=x["rtype"], root_cause_confirmed=confirmed, repeat_flag=rep))
    if x["rtype"] != "auto":
        D["interventions"].append(dict(intervention_id=f"IV-{len(D['interventions']) + 1:06d}", incident_id=x["id"], site_id=x["site"],
            responder_type=RESP[x["rtype"]], response_time_min=x["resp"], hands_on_min=x["hands"], action_taken=ACTION.get(cat, "Manual recovery"),
            travel_required="Y" if ptech else "N"))
    # recovery attempts: runtime layer tries primitives before escalating
    ladder = [("retry_with_adjusted_pose", "auto"), ("restart_nav_stack", "remote"), ("operator_reset", "operator"), ("technician_repair", "tech")]
    stop = {"auto": 0, "remote": 1, "operator": 2, "tech": 3}[x["rtype"]]
    for a in range(stop + 1):
        succ = a == stop
        D["recovery_attempts"].append(dict(attempt_id=f"RA-{len(D['recovery_attempts']) + 1:06d}", incident_id=x["id"], robot_id=rid, attempt_no=a + 1,
            action_tried=ladder[a][0], outcome="success" if succ else "failed",
            duration_sec=int((x["down"] * 60 if succ else U(30, 240)) if a == 0 or not succ else x["hands"] * 60)))
    if x["rtype"] in ("remote", "tech") and rng.random() < (.9 if ptech else .35):
        op = ts(x["start"] + x["resp"] * .5)
        eh = r1(U(.5, 3)) if not ptech else r1(LN(5, .6))
        D["support_tickets"].append(dict(ticket_id=f"TK-{len(D['support_tickets']) + 1:05d}", site_id=x["site"], robot_id=rid, incident_id=x["id"],
            category=cat, opened_ts=op, closed_ts=op + dt.timedelta(hours=float(LN(26 if ptech else 6, .7))), engineering_hours=eh,
            escalation_level=pick(["L1", "L2", "L3"], [.4, .4, .2] if ptech else [.7, .25, .05]),
            resolution_type="part_replaced" if ptech and code in COMP else pick(["config_change", "restart", "no_fault_found", "site_action"])))
    if code in COMP and ptech:
        comp, cost = COMP[code]
        D["component_replacements"].append(dict(replacement_id=f"CR-{len(D['component_replacements']) + 1:05d}", robot_id=rid, site_id=x["site"],
            incident_id=x["id"], component=comp, replaced_date=ts(x["end"]).date(),
            operating_hours_at_replacement=int(R[rid]["op_hours0"] + x["start"] / 60 * .7), cause="wear" if comp != "lidar_window" else "contamination",
            cost_inr=int(cost * U(.85, 1.2))))
EV.sort(key=lambda e: e[0])
# noise events in the extract: warnings that auto-clear
for rid, r in R.items():
    s = S[r["site"]]
    for d in range(EX0, NDAYS):
        w = window(s, d)
        if w is None: continue
        for _ in range(int(rng.poisson(1.2 * (1 + s["glare"]) if s["glare"] else .9))):
            code = pick(["WARN_PATH_REPLAN_EXCESSIVE", "WARN_LOCALIZATION_DRIFT_HIGH", "WARN_FLOOR_SLIPPAGE_DETECTED", "EVENT_TRAFFIC_YIELD_WAIT", "EVENT_AMBIENT_LIGHT_GLARE"],
                        [.25, .2, .15, .25, .15 if s["glare"] else .02])
            t0 = w[0] + U(0, w[1] - w[0])
            EV.append((t0, dict(event_id="", robot_id=rid, site_id=s["sid"], timestamp=ts(t0), error_code=code, severity=CODES[code][2],
                                duration_sec=int(LN(25, .7)), auto_cleared="Y", mission_id="")))
EV.sort(key=lambda e: e[0])
rank = {}
for n, (t0, e) in enumerate(EV, 1):
    if e["event_id"]: rank[e["event_id"]] = f"EV-{n:07d}"
    e["event_id"] = f"EV-{n:07d}"
for row in D["incidents"]:
    if row["first_event_id"]: row["first_event_id"] = rank[row["first_event_id"]]
D["fleet_events"] = [e for _, e in EV]
# fix first_event ids referenced by id remap above (old ids were placeholders pre-sort)
# telemetry (2 readings per robot-day in the extract; lemons drift)
for rid, r in R.items():
    s = S[r["site"]]
    for d in range(EX0, NDAYS):
        if window(s, d) is None: continue
        for h in (10, 18):
            lm = r["lemon"]; k = (d - EX0) / 7
            D["component_telemetry"].append(dict(reading_id=f"TL-{len(D['component_telemetry']) + 1:07d}", robot_id=rid,
                timestamp=START + dt.timedelta(days=d, hours=h, minutes=int(U(0, 59))),
                drive_motor_temp_c=r1(N(52, 4) + (14 * k if lm == "drive_motor" else 0)),
                lift_motor_current_a=r1(N(38, 3) + (12 * k if lm == "lift_motor" else 0)),
                wheel_slip_pct=r1(clip(N(2.5 if s["floor"] in ("flat", "polished") else 4.5, 1) , 0, 20)),
                lidar_contamination_pct=r1(clip(N(8 + 25 * s["dusty"], 4) + (30 * k if lm == "lidar_window" else 0), 0, 95)),
                fork_tilt_deg=r2(N(0.4 + (1.2 * k if lm == "fork_switch" else 0), .15)),
                battery_voltage_v=r1(N(51.2, .6)), localization_confidence=r2(clip(N(.93 - .1 * s["new"] - (.03 if s["floor"] == "polished" else 0), .03), .3, 1))))
# network events (extract window); dropout count follows wifi score but rarely stops the robot
for rid, r in R.items():
    s = S[r["site"]]
    for d in range(EX0, NDAYS):
        w = window(s, d)
        if w is None: continue
        for _ in range(int(rng.poisson((100 - s["wifi"]) / 100 * 4))):
            sec = int(LN(14, .8)); stop = sec > 60 and rng.random() < .2
            D["network_events"].append(dict(net_event_id=f"NW-{len(D['network_events']) + 1:07d}", robot_id=rid, site_id=s["sid"],
                timestamp=ts(w[0] + U(0, w[1] - w[0])), dropout_sec=sec, recovered_auto="Y" if sec < 300 else "N", caused_stop_flag="Y" if stop else "N"))
# site environment log
for sid, s in S.items():
    for d in range(NDAYS):
        D["site_environment_log"].append(dict(site_id=sid, date=dd(d),
            avg_lux=int(clip(N(350 if s["lighting"] != "low_light" else 150, 40) + (500 if s["glare"] and rng.random() < .5 else 0), 40, 1500)),
            dust_index=r1(clip(N(7 if s["dusty"] else 2, 1.2), 0, 10)), floor_wet_events=int(rng.poisson(1.5 if s["floor"] == "wet_spills" else .2)),
            manual_forklift_density=r1(clip(N(s["forklift"], 1.5), 0, 30)), layout_changes_flag="Y" if rng.random() < (.05 if s["bf"] else .01) else "N"))
# deployments
for sid, s in S.items():
    n = s["robots"]; harder = 1.0 if s["bf"] else .6
    D["site_deployments"].append(dict(site_id=sid, start_date=s["contract_start"], go_live_date=s["go_live"],
        setup_hours_total=int(n * U(25, 40) * harder + (200 if s["new"] else 0)), mapping_iterations=int(rng.poisson(5 if s["bf"] else 2)) + 1,
        integration_type=pick(["WMS_API", "PLC_conveyor", "WMS_API+PLC", "standalone"], [.35, .15, .3, .2]),
        custom_dev_hours=int(U(40, 400) * harder), engineers_assigned=int(rng.integers(2, 6)),
        days_to_stable_ops=int((U(35, 80) if s["bf"] else U(14, 35)) * (1.2 if s["new"] else 1))))
# integration events
SYS = {"ERR_WMS_HANDSHAKE_TIMEOUT": "WMS", "ERR_IO_DEVICE_MISMATCH": "PLC/conveyor", "ERR_MAP_CORRESPONDENCE_FAIL": "map/node config"}
for i in order:
    x = INC[i]
    if x["code"] in SYS:
        D["integration_events"].append(dict(integration_event_id=f"IE-{len(D['integration_events']) + 1:05d}", site_id=x["site"], timestamp=ts(x["start"]),
            system_type=SYS[x["code"]], error_code=x["code"], mission_id=x["mission"]["id"] if x["mission"] else "", resolution_min=r1(x["down"]),
            root_cause=pick(["interface_spec_mismatch", "timeout_config", "node_map_error", "device_address"])))
# traffic events
for sid, s in S.items():
    nx = max(3, int(s["robots"] / 2))
    for d in range(EX0, NDAYS):
        w = window(s, d)
        if w is None: continue
        for _ in range(int(rng.poisson(s["dens_f"] * s["aisle_f"] * 2.2))):
            dl = rng.random() < .04 * s["aisle_f"]
            D["traffic_events"].append(dict(traffic_event_id=f"TF-{len(D['traffic_events']) + 1:06d}", site_id=sid,
                intersection_id=f"{sid}-X{int(rng.integers(1, nx + 1))}", timestamp=ts(w[0] + U(0, w[1] - w[0])),
                robots_involved=int(clip(rng.poisson(1.2) + 2, 2, 6)), wait_sec=int(LN(45 if dl else 12, .7) * (4 if dl else 1)),
                deadlock_flag="Y" if dl else "N", resolved_by=pick(["syncos_replan", "timeout_release", "operator"], [.6, .3, .1]) if dl else "right_of_way", mission_id=""))
# fleet density snapshots (hourly, extract)
for sid, s in S.items():
    for d in range(EX0, NDAYS):
        w = window(s, d)
        for h in range(24):
            t0 = d * 1440 + h * 60
            on = w is not None and w[0] <= t0 < w[1]
            act = int(clip(round(s["robots"] * s["demand"] * N(1, .08)), 0, s["robots"])) if on else 0
            D["fleet_density_snapshots"].append(dict(site_id=sid, hour_ts=ts(t0), robots_active=act, floor_area_sqm=s["area"],
                avg_mission_min=r1(s["cycle"] * N(1, .06)), queue_length=int(rng.poisson(s["alloc_mean"] * 1.4 * (act > 0)))))
# downtime cost
for i in order:
    x = INC[i]; s = S[x["site"]]
    if x["down"] < 10: continue
    h = x["down"] / 60
    sla = int(int(next(c["sla_penalty_per_breach_inr"] for c in D["customers"] if c["customer_id"] == s["cust"])) * (rng.random() < .1)) if h > 1 else 0
    D["downtime_cost"].append(dict(cost_id=f"DC-{len(D['downtime_cost']) + 1:06d}", site_id=x["site"], customer_id=s["cust"], incident_id=x["id"],
        date=ts(x["start"]).date(), lost_pallet_moves=int(h * s["moves_hr"]), sla_penalty_inr=sla, labour_idle_cost_inr=int(h * 450 * U(1, 2.5)),
        botsync_support_cost_inr=int((x["resp"] > 60) * 18000 + (x["rtype"] in ("remote", "tech")) * 2500 * U(.5, 3)), cost_basis="assumed rates"))

# customer requests (derived from the most frequent site-level codes)
top = Counter((S[x["site"]]["cust"], x["code"]) for x in INC if x["code"] != "ERR_BATTERY_LOW_CRITICAL")
for (cid, code), n in top.most_common(40):
    site = Counter(x["site"] for x in INC if S[x["site"]]["cust"] == cid and x["code"] == code).most_common(1)[0][0]
    D["customer_requests"].append(dict(request_id=f"RQ-{len(D['customer_requests']) + 1:04d}", customer_id=cid, site_id=site,
        request_type=pick(["fix_failure", "feature", "report", "training"], [.6, .15, .15, .1]), related_error_code=code,
        raised_date=START.date() + dt.timedelta(days=int(U(0, 29))), frequency_count=int(n), deal_value_at_risk_inr_lakh=r1(n * U(.3, 1.5)),
        source=pick(["QBR", "support_ticket", "escalation_call"], [.3, .5, .2])))

# ===================== 4. EVIDENCE, CHANGE PIPELINE, AI TABS, VALIDATION, WRITER =====================
LABELS = {"ERR_DOCKING_ALIGNMENT_TIMEOUT": ["glare", "skewed_pallet", "damaged_pallet", "dirty_sensor"],
          "ERR_PALLET_POCKET_NOT_DETECTED": ["wrapped_pocket", "broken_pocket"], "ERR_OBSTACLE_PERSISTENT_BLOCK": ["unmapped_obstacle", "soft_curtain"],
          "ERR_LIDAR_DIRT_OBSCURATION": ["dust", "grease"], "ERR_LOCALIZATION_LOST": ["feature_poor_area", "layout_change"]}
for i in order:
    x = INC[i]; code = x["code"]
    if code not in LABELS or rng.random() > .85: continue
    s = S[x["site"]]; labs = LABELS[code]
    if code == "ERR_DOCKING_ALIGNMENT_TIMEOUT":
        p = np.array([.10 + (.55 if s["glare"] else 0), .30, .15 + (.35 if s["pallet"] == "damaged" else 0), .15 + .15 * s["dusty"]])
        truth = pick(labs, p)
    else:
        truth = pick(labs, [.6 + .2 * s["dusty"], .4 - .2 * s["dusty"]] if code == "ERR_LIDAR_DIRT_OBSCURATION" else None)
    vlm = truth
    if code == "ERR_DOCKING_ALIGNMENT_TIMEOUT" and truth in ("glare", "dirty_sensor") and rng.random() < (.35 if truth == "glare" else .25):
        vlm = "dirty_sensor" if truth == "glare" else "glare"            # planted VLM confusion
    elif rng.random() > .86: vlm = pick([l for l in labs if l != truth]) if len(labs) > 1 else truth
    hl = truth if rng.random() < .6 else ""
    D["incident_evidence"].append(dict(evidence_id=f"EVD-{len(D['incident_evidence']) + 1:06d}", incident_id=x["id"], robot_id=x["rid"], site_id=x["site"],
        evidence_type=pick(["camera_frame", "lidar_scan", "short_clip"], [.6, .25, .15]), camera_id=pick(["front_depth", "fork_cam", "rear"], [.5, .4, .1]),
        captured_ts=ts(x["start"] - U(0, .5)), storage_ref=f"s3://botsync-dummy/{x['site']}/{x['id']}.bin", size_mb=r1(LN(4, .6)),
        vlm_label=vlm, vlm_confidence=r2(clip(N(.82 if vlm == truth else .62, .09), .3, .99)), human_label=hl,
        label_match=("Y" if vlm == hl else "N") if hl else ""))

def pat(codes=None, sites=None, fw=None):
    out = [x for x in INC if (codes is None or x["code"] in codes) and (sites is None or x["site"] in sites) and (fw is None or R[x["rid"]]["fw"] == fw)]
    return sorted(out, key=lambda x: x["start"])
glare_sites = {k for k, s in S.items() if s["glare"]}
top_glare = Counter(x["site"] for x in pat({"ERR_DOCKING_ALIGNMENT_TIMEOUT"}, glare_sites)).most_common(1)[0][0]
dusty_sites = {k for k, s in S.items() if s["dusty"]}
new_sites = {k for k, s in S.items() if s["new"]}
under_sites = {k for k, s in S.items() if s["cpr"] < .3}
DOCK, LID = {"ERR_DOCKING_ALIGNMENT_TIMEOUT"}, {"ERR_LIDAR_DIRT_OBSCURATION"}
# (trigger, matching incidents, tier, scope_site, change_type, target, files, lines, g1, g1_violation, g2, g2_reason, review, decision, release, canary, rolled_back, delta)
CRS = [
 ("Docking timeouts at glare-exposed dock doors", pat(DOCK, glare_sites), "1_fleet_param_or_BT", "", "parameter", "docking_pose_estimator.exposure_compensation", 1, 6, "pass", "", "pass", "", "N", "n/a", "released", top_glare, "N", -31.0),
 (f"Docking timeouts at {top_glare} afternoon sun", pat(DOCK, {top_glare}), "0_site_config", top_glare, "site_config", "dock_door_exposure_profile", 1, 4, "pass", "", "pass", "", "N", "n/a", "released", top_glare, "N", -38.5),
 ("Docking timeouts on firmware v3.6.0 pose estimator", pat(DOCK, None, "v3.6.0"), "2_node_code", "", "node_code", "pallet_pose_estimator", 3, 142, "pass", "", "fail", "boundary_diff: touched lift speed limit constant", "Y", "rejected", "blocked", "", "N", ""),
 ("Pocket-not-detected on damaged / wrapped pallets", pat({"ERR_PALLET_POCKET_NOT_DETECTED"}), "2_node_code", "", "node_code", "depth_pocket_detector", 2, 96, "pass", "", "fail", "replay_regression: EU_damaged pass rate fell 2.1 pts", "Y", "rejected", "blocked", "", "N", ""),
 ("Lidar contamination at dusty sites", pat(LID, dusty_sites), "0_site_config", "", "site_config", "lidar_contamination_alert_threshold", 1, 3, "pass", "", "pass", "", "N", "n/a", "released", "", "N", -22.4),
 ("Localisation lost at newly commissioned sites", pat({"ERR_LOCALIZATION_LOST", "ERR_MAP_CORRESPONDENCE_FAIL"}, new_sites), "0_site_config", "", "site_config", "map_node_resurvey_task", 1, 5, "pass", "", "pass", "", "N", "n/a", "canary", "", "N", ""),
 ("Path-planning deadlocks around dynamic obstacles", pat({"ERR_PATH_PLANNING_DEADLOCK"}), "1_fleet_param_or_BT", "", "behaviour_tree", "recovery_wait_replan_subtree", 1, 18, "pass", "", "pass", "", "N", "n/a", "released", "", "N", -17.9),
 ("Intersection gridlock in narrow aisles", pat({"ERR_INTERSECTION_GRIDLOCK_TIMEOUT"}), "1_fleet_param_or_BT", "", "parameter", "intersection_hold_timeout_s", 1, 2, "pass", "", "pass", "", "N", "n/a", "released", "", "Y", +6.0),
 ("Emergency low-battery stops at undercharged sites", pat({"ERR_BATTERY_LOW_CRITICAL"}, under_sites), "1_fleet_param_or_BT", "", "parameter", "charge_trigger_soc_threshold", 2, 9, "fail", "edit reaches min_soc_safety_floor (outside allowlist)", "not_run", "", "Y", "rejected", "blocked", "", "N", ""),
 ("Persistent obstacle blocks", pat({"ERR_OBSTACLE_PERSISTENT_BLOCK"}), "1_fleet_param_or_BT", "", "behaviour_tree", "replan_after_block_subtree", 1, 14, "pass", "", "pass", "", "N", "n/a", "canary", "", "N", ""),
 ("WMS handshake timeouts at new sites", pat({"ERR_WMS_HANDSHAKE_TIMEOUT"}, new_sites), "0_site_config", "", "site_config", "wms_api_timeout_s", 1, 2, "pass", "", "pass", "", "N", "n/a", "released", "", "N", -44.0),
 ("Fleet-manager link loss in Wi-Fi dead zones", pat({"ERR_FLEET_MANAGER_LINK_LOST"}), "1_fleet_param_or_BT", "", "parameter", "link_reconnect_hold_s", 1, 3, "pass", "", "pass", "", "N", "n/a", "pending", "", "N", ""),
 ("Safety LiDAR e-stops (proposal to shrink protective field)", pat({"ERR_SAFETY_LIDAR_ESTOP"}), "never_safety", "", "safety_layer", "protective_field_radius", 1, 4, "fail", "safety layer is never-edit", "not_run", "", "Y", "rejected", "blocked", "", "N", ""),
 ("Relocalisation after layout change", pat({"ERR_LOCALIZATION_LOST"}), "2_node_code", "", "node_code", "relocalisation_node", 4, 210, "pass", "", "pass", "", "Y", "approved", "canary", "", "N", ""),
]
G1 = [("allowlist_scope_check", "targets_outside_allowlist", 0), ("typed_edit_schema", "schema_violations", 0), ("parameter_range_bounds", "params_out_of_range", 0), ("safety_layer_untouched", "safety_files_touched", 0)]
G2 = [("replay_regression", "pass_rate_delta_pts", -0.5), ("boundary_diff", "out_of_envelope_diffs", 0), ("sim_scenario_suite", "scenario_pass_pct", 98.0), ("latency_budget_check", "p95_loop_ms", 50.0)]
for k, c in enumerate(CRS, 1):
    trig, ms, tier, scope, ctype, tgt, nf, nl, g1, g1v, g2, g2r, rev, dec, rel, can, rb, delta = c
    cid = f"CHG-{k:03d}"; created = HORIZON - U(1500, 28000)
    rel_ts = ts(created + U(300, 2000)) if rel in ("released", "canary") else ""
    D["change_requests"].append(dict(change_id=cid, trigger_pattern=trig, primary_incident_id=ms[0]["id"] if ms else "", incidents_in_pattern=len(ms),
        scope_tier=tier, scope_site_id=scope, change_type=ctype, target_component=tgt, proposed_by="llm_agent", created_ts=ts(created), files_touched_count=nf,
        lines_changed=nl, gate1_status=g1, gate1_violation=g1v, gate2_status=g2, gate2_failure_reason=g2r, human_review_required=rev, human_decision=dec,
        release_status=rel, canary_site_id=can or (pick(sorted(S)) if rel in ("released", "canary") else ""), released_ts=rel_ts, rolled_back_flag=rb,
        post_release_incident_delta_pct=delta))
    t0 = created
    for gate, evs in ((1, G1), (2, G2)):
        if gate == 2 and g1 == "fail": break
        for name, metric, thr in evs:
            res, val = "pass", thr
            if gate == 1 and g1 == "fail" and name in ("allowlist_scope_check", "safety_layer_untouched") and (tier == "never_safety" or name == "allowlist_scope_check"):
                res, val = "fail", 1
            if gate == 2 and g2 == "fail" and name == ("boundary_diff" if "boundary" in g2r else "replay_regression"):
                res, val = "fail", (1 if name == "boundary_diff" else -2.1)
            elif res == "pass":
                val = {"replay_regression": r2(U(-.2, .6)), "sim_scenario_suite": r1(U(98.2, 99.8)), "latency_budget_check": r1(U(18, 41))}.get(name, 0)
            D["eval_results"].append(dict(eval_id=f"EVL-{len(D['eval_results']) + 1:04d}", change_id=cid, gate=gate,
                eval_name=name, result=res, measured_value=val, threshold=thr, run_ts=ts(t0 := t0 + U(3, 40)), duration_sec=int(U(2, 90) if gate == 1 else U(60, 900)),
                evaluator_version="eval-v0.3", notes=metric))

# ---- AI use cases (from the handwritten note) and flow ----
def base(codes, sites=None):
    xs = [x for x in INC if x["code"] in codes and (sites is None or x["site"] in sites)]
    return len(xs), r1(sum(x["down"] for x in xs) / 60)
UC = [
 ("Position accuracy (docking, pocket alignment)", "Perception and positioning", P2, ["ERR_DOCKING_ALIGNMENT_TIMEOUT", "ERR_PALLET_POCKET_NOT_DETECTED"], "VLM classifies the cause from the frame; LLM proposes a typed parameter or site-config edit", "offline fix-generation", "incident_evidence; incidents; stations", "Gate 1 then Gate 2", "ROS 2 parameter / site config via canary", "Human fixes", "Docking incidents per 1,000 robot-hours"),
 ("Auto-correction of the correct path", "Navigation recovery", P2, ["ERR_PATH_PLANNING_DEADLOCK", "ERR_OBSTACLE_PERSISTENT_BLOCK"], "LLM picks a whitelisted replan / back-off primitive", "runtime recovery", "recovery_attempts; fleet_events", "Deterministic evaluator", "Execute behaviour-tree node", "Escalate to operator", "Share of incidents auto-recovered"),
 ("Wrong robot assigned for the right path / weight", "Orchestration", P5, ["ERR_LIFT_MOTOR_OVERCURRENT", "ERR_LOAD_SHIFT_DETECTED"], "Agent checks payload vs robot health before allocation", "runtime orchestration", "missions; component_telemetry", "Deterministic evaluator", "Reassign mission", "Keep original assignment", "Overload incidents per 1,000 missions"),
 ("Network drop-off", "Connectivity", P3, ["ERR_FLEET_MANAGER_LINK_LOST"], "LLM chooses hold / reconnect primitive; flags dead zones", "runtime recovery", "network_events; site_environment_log", "Deterministic evaluator", "Hold position and reconnect", "Site IT ticket", "Stops caused per dropout"),
 ("Delay from sudden demand spike", "Orchestration", P5, ["ERR_INTERSECTION_GRIDLOCK_TIMEOUT"], "Agent re-sequences missions and charging windows", "runtime orchestration", "missions; fleet_density_snapshots; traffic_events", "Deterministic evaluator", "Apply new sequence", "Keep current plan", "Mean allocation wait (min)"),
 ("VLM: unpredicted object", "Perception and positioning", P6, ["ERR_SAFETY_LIDAR_ESTOP", "ERR_OBSTACLE_PERSISTENT_BLOCK"], "VLM names the object and recommends wait / reroute / call help; never overrides the safety layer", "runtime recovery", "incident_evidence; interventions", "Deterministic evaluator + safety layer", "Wait or reroute", "Human fixes", "Operator interventions per 1,000 robot-hours"),
 ("LLM orchestration / workflow intelligence (e.g. re-route Bot 5 to Bay 4, move everything to Bay 6)", "Orchestration", P5, ["ERR_INTERSECTION_GRIDLOCK_TIMEOUT", "ERR_PATH_PLANNING_DEADLOCK"], "LLM drafts a multi-robot re-plan as typed commands", "runtime orchestration", "traffic_events; stations; missions", "Deterministic evaluator", "SyncOS applies plan", "Human fixes", "Deadlock minutes per site-week"),
 ("Agentic task planning", "Orchestration", P1, ["ERR_BATTERY_LOW_CRITICAL", "ERR_CHARGER_CONTACT_FAULT"], "Agent plans charge windows around demand", "runtime orchestration", "charge_sessions; robot_daily_utilization", "Deterministic evaluator", "Schedule applied", "Keep default charge rule", "Emergency low-battery stops"),
 ("Automated root-cause triage", "Field-failure-to-fix loop", P2, [c for c in INC_CODES], "VLM + LLM triage across incidents, then drafts a change request", "offline fix-generation", "incidents; incident_evidence; change_requests; eval_results", "Gate 1 then Gate 2", "Canary release", "Human fixes", "Time from first incident to released fix"),
]
for k, u in enumerate(UC, 1):
    n, h = base(u[3])
    D["ai_use_cases"].append(dict(use_case_id=f"UC-{k:02d}", note_item=u[0], scenario_group=u[1], pillar=u[2], linked_error_codes="; ".join(u[3][:4]) + (" ..." if len(u[3]) > 4 else ""),
        ai_role=u[4], where_it_runs=u[5], evidence_tables=u[6], gate=u[7], on_pass=u[8], on_fail=u[9], baseline_incidents_30d=n, baseline_downtime_hours_30d=h, success_metric=u[10]))
FLOW = [
 ("Fault diagnosis", "fleet_events, incidents, incident_evidence", "Structured fault record + evidence", "None", "Next step", "Log and alert", "None", "Note: Fault Diagnosis box"),
 ("LLM reasoning agent", "Fault record + whitelisted primitives / editable allowlist", "Proposed action or typed edit", "Output schema check", "Deterministic evaluator", "Reject proposal", "None", "Note: LLM box"),
 ("Deterministic evaluator", "Proposed action or edit", "Pass / fail with violated rule", "Gate 1 (runtime) / Gate 2 (offline)", "ROS 2 action / behaviour-tree node", "Human fixes the problem", "Reviews failed proposals", "Note: Evaluator box"),
 ("ROS 2 action / behaviour-tree node", "Approved action", "Robot executes; result logged", "Safety layer stays outside the envelope", "Log success", "Human fixes the problem", "None", "Note: ROS 2 box"),
 ("Human fixes the problem", "Failed proposal + evidence", "Manual fix + label", "None", "Label feeds the eval set", "n/a", "Does the repair", "Note: Human box (human-in-loop validate box was struck out)"),
 ("Log back (added)", "Outcome of the step above", "Rows in recovery_attempts / change_requests / eval_results", "None", "Closes the loop", "n/a", "None", "Added by me, not in the note"),
]
for k, f in enumerate(FLOW, 1):
    D["ai_flow_steps"].append(dict(step_no=k, component=f[0], input=f[1], output=f[2], eval_or_gate=f[3], on_pass=f[4], on_fail=f[5], human_role=f[6], source=f[7]))

# ---- validation and planted-pattern measurements ----
VAL = []
def chk(name, ok, detail=""): VAL.append((name, "PASS" if ok else "FAIL", str(detail)))
cols = {tab: [c[0] for c in cs] for tab, _, _, _, _, cs in T}
for tab, cs in cols.items():
    rows = D[tab]
    bad = [k for r in rows[:50] for k in r if k not in cs] + [k for r in rows[:50] for k in cs if k not in r]
    chk(f"columns match template: {tab}", len(rows) > 0 and not bad, f"{len(rows)} rows" + (f"; mismatch {sorted(set(bad))[:4]}" if bad else ""))
chk("250 robots", len(D["robots"]) == 250); chk("30 sites", len(D["sites"]) == 30)
ids = {t: {r[cols[t][0]] for r in D[t]} for t in ("sites", "robots", "incidents", "customers", "stations", "missions", "change_requests")}
def fk(t, c, to, blank_ok=True):
    bad = [r[c] for r in D[t] if r[c] != "" and r[c] not in ids[to]]
    chk(f"FK {t}.{c} -> {to}", not bad, f"{len(bad)} orphans")
for t, c, to in [("robots", "site_id", "sites"), ("incidents", "robot_id", "robots"), ("incidents", "station_id", "stations"), ("incidents", "mission_id", "missions"),
                 ("interventions", "incident_id", "incidents"), ("incident_evidence", "incident_id", "incidents"), ("eval_results", "change_id", "change_requests"),
                 ("change_requests", "primary_incident_id", "incidents"), ("downtime_cost", "incident_id", "incidents"), ("charge_sessions", "robot_id", "robots"),
                 ("missions", "pickup_station_id", "stations"), ("sites", "customer_id", "customers")]: fk(t, c, to)
evids = {r["event_id"] for r in D["fleet_events"]}
chk("FK incidents.first_event_id -> fleet_events", all(r["first_event_id"] in evids for r in D["incidents"] if r["first_event_id"]))

nsch = sum(u["scheduled_hours"] for u in UTIL)
PAT = []
dh = Counter(); ic = Counter()
for x in INC: dh[x["code"]] += x["down"] / 60; ic[x["code"]] += 1
tot_i, tot_h = sum(ic.values()), sum(dh.values())
d0 = ic.most_common(1)[0][0]
PAT.append(("1 Frequency vs hours", f"Most frequent code {d0}: {ic[d0] / tot_i * 100:.0f}% of incidents but {dh[d0] / tot_h * 100:.0f}% of downtime hours. Top-3 by hours: " + ", ".join(f"{k} ({v:.0f}h)" for k, v in dh.most_common(3)), "Rank failures by downtime hours, not counts"))
PAT.append(("2 Charging vs failure", f"Failure downtime {sum(u['error_hours'] for u in UTIL) / nsch * 100:.1f}% of scheduled robot-hours vs charging {sum(u['charging_hours'] for u in UTIL) / nsch * 100:.1f}%", "Rest deficit is the larger availability loss"))
def chg(sites):
    us = [u for u in UTIL if u["site_id"] in sites]; w = [c["wait"] for c in CH if c["site"] in sites]
    return sum(u["charging_hours"] for u in us) / max(1, sum(u["scheduled_hours"] for u in us)) * 100, float(np.mean(w)) if w else 0, 100 - float(np.mean([u["availability_pct"] for u in us if u["availability_pct"] != ""]))
cons = {k for k, s in S.items() if s["constrained"]}; s24 = {k for k, s in S.items() if s["shift"] == "24x7"} - cons - under_sites; s16 = {k for k, s in S.items() if s["shift"] != "24x7"}
for nm, ss in (("capacity-constrained 24x7", cons), ("other 24x7", s24), ("16-hour sites", s16), ("undercharged 24x7", under_sites)):
    a, b, c_ = chg(ss); aw = float(np.mean([(m["assigned_ts"] - m["created_ts"]).total_seconds() / 60 for m in D["missions"] if m["site_id"] in ss]))
    PAT.append((f"3 Counter-pattern: {nm}", f"charging {a:.1f}% of scheduled hours; mean charger wait {b:.1f} min; unavailable {c_:.1f}%; mean task allocation wait {aw:.1f} min (extract)", "Charging gap binds only where demand ~ capacity or chargers are short"))
ne = D["network_events"]; ws = [(S[n["site_id"]]["wifi"], n["caused_stop_flag"]) for n in ne]
PAT.append(("4 Wi-Fi noise harmless", f"{len(ne)} dropouts in the extract, {sum(1 for _, f in ws if f == 'Y')} caused a stop ({sum(1 for _, f in ws if f == 'Y') / max(1, len(ne)) * 100:.1f}%); link-loss incidents {ic['ERR_FLEET_MANAGER_LINK_LOST']} of {tot_i}", "Do not prioritise network work on dropout counts alone"))
dk = Counter(x["site"] for x in INC if x["code"] in DOCK); t5 = sum(v for _, v in dk.most_common(5))
PAT.append(("5 Docking concentration", f"Top 5 sites hold {t5 / sum(dk.values()) * 100:.0f}% of docking incidents (5 glare sites); glare-site timestamps cluster 14:00-17:00", "Site-specific fix before fleet-wide change"))
def rate(fw, gl):
    inc = sum(1 for x in INC if x["code"] in DOCK and R[x["rid"]]["fw"] == fw and (S[x["site"]]["glare"] or S[x["site"]]["pallet"] == "damaged") == gl)
    rd = sum(1 for u in UTIL if u["scheduled_hours"] and R[u["robot_id"]]["fw"] == fw and (S[u["site_id"]]["glare"] or S[u["site_id"]]["pallet"] == "damaged") == gl)
    return inc / max(1, rd) * 100
PAT.append(("6 Firmware confounding", f"Docking incidents per 100 robot-days, v3.6.0: {rate('v3.6.0', True):.1f} at problem sites vs {rate('v3.6.0', False):.1f} elsewhere; v3.5.3: {rate('v3.5.3', True):.1f} vs {rate('v3.5.3', False):.1f}. v3.6.0 over-represented at problem sites", "Control for site before blaming the release"))
rep = sum(1 for x in INC if x["repeat"] == "Y")
PAT.append(("7 Repeat-fault masking", f"{rep} of {tot_i} incidents ({rep / tot_i * 100:.0f}%) repeat the same code on the same robot within 7 days; extra duplicate events inflate fleet_events", "Count incidents, not raw events"))
ev = D["incident_evidence"]; g_ = [e for e in ev if e["human_label"] == "glare" ]; dsn = [e for e in ev if e["human_label"] == "dirty_sensor"]
PAT.append(("8 VLM confusion", f"Glare labelled dirty_sensor by VLM: {sum(1 for e in g_ if e['vlm_label'] == 'dirty_sensor') / max(1, len(g_)) * 100:.0f}% of {len(g_)}; dirty labelled glare: {sum(1 for e in dsn if e['vlm_label'] == 'glare') / max(1, len(dsn)) * 100:.0f}% of {len(dsn)}; overall label match {sum(1 for e in ev if e['label_match'] == 'Y') / max(1, sum(1 for e in ev if e['label_match'])) * 100:.0f}%", "VLM needs a human-labelled eval set before it can gate changes"))
PAT.append(("9 Hardware lemons", f"14 lemon robots produce {sum(1 for x in INC if R[x['rid']]['lemon']) / tot_i * 100:.0f}% of incidents", "Robot-level vs fleet-level fixes"))
PAT.append(("10 Change pipeline", f"{len(CRS)} change requests: gate 1 fail {sum(1 for c in CRS if c[8] == 'fail')}, gate 2 fail {sum(1 for c in CRS if c[10] == 'fail')}, one released fix rolled back", "Shows what the two gates would have blocked"))
# ---- failures found in the data beyond the first six pillars (measured, not planted claims) ----
_bat = [x for x in INC if x["code"] == "ERR_BATTERY_LOW_CRITICAL"]
_sohr = {r["pack_id"]: r["soh_pct"] for r in D["battery_packs"]}
_old = [r for r in R.values() if _sohr[r["pack"]] < 85]; _new = [r for r in R.values() if _sohr[r["pack"]] >= 85]
_lo = sum(1 for x in _bat if _sohr[R[x["rid"]]["pack"]] < 85)
PAT.append(("11 Ageing battery packs", f"{len(_old)} packs under 85% health ({len(_old) / 250 * 100:.0f}% of fleet) produce {_lo / len(_bat) * 100:.0f}% of emergency low-battery stops: {_lo / len(_old):.1f} vs {(len(_bat) - _lo) / len(_new):.1f} per robot", "Pack ageing, not only charger count, drives rest-deficit failures"))
_hr = Counter(int((x["start"] % 1440) // 60) for x in INC); _pk = max(_hr, key=_hr.get)
PAT.append(("12 Afternoon peak", f"Busiest hour is {_pk}:00 with {_hr[_pk]} incidents ({_hr[_pk] / tot_i * 100:.0f}%); 15:00-17:59 holds {sum(_hr[h] for h in (15, 16, 17)) / tot_i * 100:.0f}% of incidents", "Time-of-day pattern points at glare, shift change or charging windows"))
_tr = {rg: [x for x in INC if x["rtype"] == "tech" and S[x["site"]]["region"] == rg] for rg in ("India", "Southeast Asia", "Australia")}
PAT.append(("13 Technician response by region", "Median technician response min: " + ", ".join(f"{rg} {float(np.median([x['resp'] for x in v])):.0f} ({len(v)} visits, {sum(x['down'] for x in v) / 60:.0f} h)" for rg, v in _tr.items()), "Remote-first fixes matter most where technicians are far"))
_fkd = {k: float(np.mean([r["manual_forklift_density"] for r in D["site_environment_log"] if r["site_id"] == k])) for k in S}
_es = Counter(x["site"] for x in INC if x["code"] == "ERR_SAFETY_LIDAR_ESTOP")
_hs = [k for k in S if _fkd[k] >= 12]; _ls = [k for k in S if _fkd[k] < 6]
PAT.append(("14 Safety e-stops vs forklift traffic", f"E-stops per robot: {sum(_es[k] for k in _hs) / sum(S[k]['robots'] for k in _hs):.2f} at sites with logged forklift density >= 12 vs {sum(_es[k] for k in _ls) / sum(S[k]['robots'] for k in _ls):.2f} below 6; {ic['ERR_SAFETY_LIDAR_ESTOP']} incidents, {dh['ERR_SAFETY_LIDAR_ESTOP']:.0f} h", "Safety stops are a site-process issue and stay outside any LLM fix"))
_ex = [x for x in INC if x["start"] >= EX_START]
PAT.append(("15 Interrupted missions", f"{sum(1 for m in MIS if m['interrupted'] == 'Y')} missions cut off by an incident in the extract; {sum(1 for x in _ex if x['mission'])} of {len(_ex)} extract incidents ({sum(1 for x in _ex if x['mission']) / max(1, len(_ex)) * 100:.0f}%) hit a live mission; {sum(1 for m in MIS if m['status'] == 'aborted')} further missions aborted", "Mission loss is a customer-visible cost that downtime hours understate"))
_tk = D["support_tickets"]; _nff = [t for t in _tk if t["resolution_type"] == "no_fault_found"]
PAT.append(("16 No-fault-found tickets", f"{len(_nff)} of {len(_tk)} tickets ({len(_nff) / len(_tk) * 100:.0f}%) end as no fault found, using {sum(t['engineering_hours'] for t in _nff):.0f} of {sum(t['engineering_hours'] for t in _tk):.0f} engineering hours", "Better diagnosis (evidence plus triage) saves support time"))
_lm = [x for x in INC if R[x["rid"]]["lemon"]]
PAT.append(("17 Robots with recurring hardware faults", f"14 planted hardware-fault robots (5.6% of fleet): {len(_lm)} incidents ({len(_lm) / tot_i * 100:.0f}% of incidents, i.e. no more than average per robot) but {sum(x['down'] for x in _lm) / 60 / tot_h * 100:.0f}% of downtime hours because their faults need technicians; top fault types {', '.join(f'{k} {v}' for k, v in Counter(R[x['rid']]['lemon'] for x in _lm).most_common(2))}", "Concentration shows in technician visits and hours, not incident counts"))
for p in PAT: print(p[0], "|", p[1])
for v in VAL:
    if v[1] == "FAIL": print("FAIL", v)

ASSUME = [
 ("Scope", "All 250 robots are MAG1400 Fork AMRs across 30 sites (India 16, Southeast Asia 9, Australia 5). Customers, cities and sites are fictional."),
 ("Window", "30 days from 2026-09-01. Mission, event, telemetry, network, traffic and density tables are a sampled extract of the last 7 days (2026-09-24 to 2026-09-30). Incidents, charge sessions and daily utilisation cover all 30 days."),
 ("Specs", "1,400 kg, 1.5 m/s, 1.6 m lift are the stated model figures. Run time 7-9 h and 2 h charge are assumptions; actual runtime scales with pack state of health."),
 ("Shifts", "10 sites run 24x7, 14 run 16x7, 6 run 16x6. Brownfield 24, greenfield 6 (an assumption, not a Botsync figure)."),
 ("Incidents", "Poisson per robot-day with site, robot (gamma), firmware and lemon multipliers; downtime is lognormal by recovery type (auto, remote, operator, technician). Technician response is slower in Australia and Southeast Asia."),
 ("Costs", "All rupee costs, SLA penalties and component prices are made-up round figures."),
 ("VLM labels", "Shadow mode only: the VLM label never triggered an action. Human labels exist for about 60% of evidence rows."),
 ("Change pipeline", "Change requests, gate results and rollback outcomes are scripted scenarios to show how the gates behave, not measured results."),
 ("Note content", "ai_use_cases and ai_flow_steps transcribe the handwritten note; baselines are computed from this dataset."),
 ("Forecastability", "Each site and robot has a steady incident and charging rate in the generator (site multiplier, robot gamma, a few lemon robots), so patterns carry from one period to the next by design. Analysis section 13 shows the forecasting method; real fleets drift and would be less stable."),
 ("Reproducibility", "Seeded numpy generator (seed 42); rerun generate_botsync_data.py to regenerate."),
]

# ---- writer ----
import datetime as _dt
wb = Workbook(write_only=True)
HF = Font(name="Arial", bold=True, size=10); BF = Font(name="Arial", size=10)
def hdr(ws, cols_):
    out = []
    for c in cols_:
        cell = WriteOnlyCell(ws, value=c); cell.font = HF; cell.fill = PatternFill("solid", start_color="D9E1F2"); out.append(cell)
    ws.append(out)
def textsheet(name, header, rows, widths):
    ws = wb.create_sheet(name)
    for i, w in enumerate(widths): ws.column_dimensions["ABCDEFGH"[i]].width = w
    hdr(ws, header)
    for r in rows:
        ws.append([WriteOnlyCell(ws, value=v) for v in r])
ws = wb.create_sheet("README")
ws.column_dimensions["A"].width = 120
for line in ["Botsync product case: Step 2 dummy data (MAG1400 Fork fleet, 250 robots, 30 sites)",
             "Column names match botsync_data_template.xlsx exactly; every table tab is one table. Joins are logical (same values), no foreign keys.",
             "Tabs: Assumptions, Planted_patterns (what the data was built to show, with measured numbers), Validation, then one tab per table.",
             "All names, sites, costs and incident figures are dummy data generated by generate_botsync_data.py."]:
    c = WriteOnlyCell(ws, value=line); c.font = BF; ws.append([c])
textsheet("Assumptions", ["Topic", "Assumption"], ASSUME, [20, 130])
import botsync_lean as BL
_ctx = dict(D=D, T=T, INC=INC, R=R, S=S, CODES=CODES, START=START, CH=CH, EX_START=EX_START, MIS=MIS, FW=[f[0] for f in FWV])
BL.build(wb, _ctx)
textsheet("Planted_patterns", ["Pattern", "Measured in this data", "What it tests"], PAT, [34, 120, 60])
textsheet("Validation", ["Check", "Result", "Detail"], VAL, [60, 10, 60])
for tab, grp, pil, what, conn, cs in T:
    ws = wb.create_sheet(tab); names = [c[0] for c in cs]
    for i, n in enumerate(names): ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = max(14, min(36, len(n) + 4))
    ws.freeze_panes = "A2"; hdr(ws, names)
    for r in D[tab]:
        row = []
        for n in names:
            v = r.get(n, "")
            if v == "": v = None
            if isinstance(v, _dt.datetime): c = WriteOnlyCell(ws, value=v); c.number_format = "yyyy-mm-dd hh:mm"
            elif isinstance(v, _dt.date): c = WriteOnlyCell(ws, value=v); c.number_format = "yyyy-mm-dd"
            else: c = v
            row.append(c)
        ws.append(row)
wb.save("botsync_dummy_data.xlsx")
# merge the Analysis text blocks (write-only sheets cannot merge cells, so reopen once)
import openpyxl as _ox
_wb2 = _ox.load_workbook("botsync_dummy_data.xlsx")
for _rng in _ctx["merges"]: _wb2["Analysis"].merge_cells(_rng)
_wb2.save("botsync_dummy_data.xlsx")
print("saved botsync_dummy_data.xlsx", sum(len(v) for v in D.values()), "rows")


