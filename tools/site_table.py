"""Generate the per-site table (spec 5.9) and the three-warehouse figures (5.7) from the workbook.
Usage: python3 -I tools/site_table.py path/to/botsync_dummy_data.xlsx [out.json]"""
import sys, json
from collections import defaultdict, Counter
import openpyxl

def rows(wb, name):
    it = wb[name].iter_rows(values_only=True)
    head = next(it)
    for r in it:
        if r[0] is None: continue
        yield dict(zip(head, r))

def build(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sites = list(rows(wb, 'sites'))
    util = defaultdict(lambda: defaultdict(float))
    for r in rows(wb, 'robot_daily_utilization'):
        u = util[r['site_id']]
        for k in ('scheduled_hours', 'moving_hours', 'idle_hours', 'charging_hours', 'error_hours'):
            u[k] += r[k] or 0
    inc = defaultdict(Counter); rec = defaultdict(Counter); dt = defaultdict(list)
    for r in rows(wb, 'incidents'):
        inc[r['site_id']][r['error_code']] += 1
        rec[r['site_id']][r['recovery_type']] += 1
        dt[r['site_id']].append(r['downtime_min'])
    st = defaultdict(Counter); glare = Counter()
    for r in rows(wb, 'stations'):
        st[r['site_id']][r['station_type']] += 1
        if r['glare_exposure_flag'] == 'Y': glare[r['site_id']] += 1
    cs = Counter(); trig = Counter()
    for r in rows(wb, 'charge_sessions'):
        cs[r['site_id']] += 1; trig[r['trigger']] += 1
    out = []
    for s in sites:
        sid = s['site_id']; u = util[sid]; n = s['robots_deployed']
        lb = inc[sid]['ERR_BATTERY_LOW_CRITICAL']
        d = sorted(dt[sid]); m = len(d)
        med = (d[m//2] if m % 2 else (d[m//2-1] + d[m//2]) / 2) if m else 0
        out.append(dict(
            site_id=sid, site_name=s['site_name'], shift_pattern=s['shift_pattern'], robots_deployed=n,
            region=s['country_region'], industry=s['industry'], site_type=s['site_type'],
            floor=s['floor_condition'], lighting=s['lighting_profile'], wifi=s['wifi_quality_score'],
            aisleMin=s['aisle_width_min_m'],
            scheduledHours=round(u['scheduled_hours'], 4),
            movingShare=u['moving_hours'] / u['scheduled_hours'],
            chargingShare=u['charging_hours'] / u['scheduled_hours'],
            idleShare=u['idle_hours'] / u['scheduled_hours'],
            errorShare=u['error_hours'] / u['scheduled_hours'],
            incidents=sum(inc[sid].values()), lowBatteryStops=lb, lowBatteryPerRobot=lb / n,
            downtimeHours=sum(dt[sid]) / 60, medianDowntimeMin=med,
            chargeSessions=cs[sid], stations=dict(st[sid]), glareStations=glare[sid],
            incidentsByCode=dict(inc[sid].most_common()), recoveryTypes=dict(rec[sid].most_common()),
        ))
    out.sort(key=lambda r: r['site_id'])
    return out, dict(trig)

if __name__ == '__main__':
    table, trig = build(sys.argv[1])
    if len(sys.argv) > 2:
        json.dump({'sites': table, 'chargeTriggers': trig}, open(sys.argv[2], 'w'), indent=1, default=str)
    for r in table:
        print(r['site_id'], r['shift_pattern'], r['robots_deployed'], '%.1f%% chg %.1f%% mov' % (100*r['chargingShare'], 100*r['movingShare']),
              r['incidents'], r['lowBatteryStops'], '%.2f' % r['lowBatteryPerRobot'])
    print(trig)
    for sid in ('S08', 'S12', 'S20'):
        r = next(x for x in table if x['site_id'] == sid); print(json.dumps(r, default=str))
