"""Acceptance tests 10 and 22: every figure in spec 5.1-5.6 in data.js matches the workbook; the per-site table is regenerated and matches.
Usage: python3 -I tools/test_workbook.py source/botsync_dummy_data.xlsx botsync_walkthrough"""
import sys, os, json, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openpyxl
from site_table import build

xlsx, site_dir = sys.argv[1], sys.argv[2]
D = json.loads(subprocess.check_output(['node', os.path.join(os.path.dirname(__file__), 'dump_data.js'), site_dir]))
ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)['Analysis']
grid = [list(r) for r in ws.iter_rows(values_only=True)]
fails = 0; checked = 0

def cell_by_label(label, col=1, nth=0):
    hits = [r for r in grid if r and isinstance(r[0], str) and r[0].strip() == label]
    if not hits: raise KeyError(label)
    return hits[nth][col]

def check(name, got, want, places=None):
    """places=None: full precision (1e-9 relative). places=n: equal after rounding want to n decimals (displayed precision)."""
    global fails, checked
    checked += 1
    if places is None: good = abs(got - want) <= 1e-9 * max(1, abs(want))
    else: good = abs(round(want, places) - got) <= 0.5 * 10 ** -places + 1e-12
    print(('PASS ' if good else 'FAIL ') + f'{name}: data.js {got} vs workbook {want}')
    if not good: fails += 1

f = D['fleet']
A1 = {'robots': 'Robots', 'sites': 'Sites', 'scheduledRobotHours30d': 'Scheduled robot-hours, 30 days',
      'shareMoving': 'Share of scheduled time moving', 'shareCharging': 'Share of scheduled time charging',
      'shareFailure': 'Share of scheduled time in failure', 'incidents30d': 'Incidents (failure cases)',
      'incidentDowntimeHours': 'Downtime hours from incidents', 'failureHoursUtilisationTab': 'Failure hours in the utilisation tab',
      'dockingTimeouts': 'Docking timeouts', 'dockingShareOfIncidents': 'Docking share of incidents',
      'dockingShareOfDowntimeHours': 'Docking share of downtime hours', 'technicianShareOfDowntimeHours': 'Technician-handled share of downtime hours',
      'technicianShareOfIncidents': 'Technician-handled share of incidents', 'incidentsNoConfirmedCause': 'Incidents with no confirmed root cause',
      'costBornePerCustomersInrLakh': 'Cost borne by customers, INR lakh (assumed rates)', 'botsyncSupportCostInrLakh': 'Botsync support cost, INR lakh (assumed rates)',
      'palletMovesLost30d': 'Pallet moves lost'}
for k, lab in A1.items(): check('5.1 ' + k, f[k]['v'], cell_by_label(lab))

for row in D['topCodes']:
    wb = [r for r in grid if r and r[0] == row['code']][0]   # first occurrence = Analysis 2 table
    for i, k in enumerate(['incidents', 'shareInc', 'downtimeH', 'shareHours', 'clearedOpRemote'], start=1):
        check(f"5.2 {row['code']} {k}", row[k]['v'], wb[i])
    lvl = D['levelNames'][row['level']]
    checked += 1
    if lvl != wb[6]: fails += 1; print(f"FAIL 5.2 {row['code']} level {lvl} vs {wb[6]}")
    else: print(f"PASS 5.2 {row['code']} level '{lvl}'")
for code, lvl in D['codeLevel'].items():
    wbl = [r for r in grid if r and r[0] == code][-1][1]
    checked += 1
    if D['levelNames'][lvl] != wbl: fails += 1; print(f'FAIL 5.3 level of {code}')
for l in D['levels']:
    wb = [r for r in grid if r and r[0] == l['name']][-1]
    for i, k in enumerate(['incidents', 'downtimeH', 'shareInc', 'shareHours', 'opRemoteH'], start=1):
        check(f"5.3 {l['name']} {k}", l[k]['v'], wb[i])

c = D['charging']
for pat in ('16x6', '16x7', '24x7'):
    wb = [r for r in grid if r and r[0] == pat][0]
    for i, k in enumerate(['sites', 'share', 'waitMin', 'stopsPerRobot'], start=1):
        check(f'5.4 {pat} {k}', c['byPattern'][pat][k]['v'], wb[i])
A4 = {'chargingHoursAt24x7Sites': 'Charging hours at 24x7 sites, 30 days', 'aboveThe16HourRate': "Of which above the 16-hour sites' charging rate",
      'robotsAt24x7Sites': 'Robots at 24x7 sites', 'extraHoursPerRobot': 'Extra charging hours per robot per month',
      'avgChargeSessionMin': 'Average charge session (min)', 'ceilingIfEveryChargeBecameASwap24x7': 'Ceiling if every charge at 24x7 sites became a swap (hours)',
      'chargingHoursFleetInScheduledTime': 'Charging hours inside scheduled time, 30 days', 'fleetCeilingIfEverySwap': 'Robot-hours a swap could return',
      'fleetCeilingShare': 'As a share of scheduled hours', 'weakPacks': 'Packs below the health threshold',
      'lowBatteryStopsPerRobotWeak': 'Low-battery stops per robot, weak packs', 'lowBatteryStopsPerRobotHealthy': 'Low-battery stops per robot, healthier packs'}
for k, lab in A4.items(): check('5.4 ' + k, c[k]['v'], cell_by_label(lab))
check('5.4 weakPackThreshold', c['weakPackThreshold']['v'], cell_by_label('A pack counts as weak below this health (%)'))
check('5.8 swap time assumption cell', D['assumed']['swapTimeMin']['v'], cell_by_label('Minutes one battery swap takes (assumed)'))
_t, _ = build(xlsx)
check('5.4 16-hour stops per robot, about (sites+incidents tabs)', c['sixteenHourStopsPerRobotAbout']['v'],
      sum(r['lowBatteryStops'] for r in _t if r['shift_pattern'] != '24x7') / sum(r['robots_deployed'] for r in _t if r['shift_pattern'] != '24x7'))
check('5.4 perception hours (docking+lidar+pocket+localisation)', c['perceptionHours']['v'],
      sum(round([r for r in grid if r and r[0] == k][0][3]) for k in ['ERR_DOCKING_ALIGNMENT_TIMEOUT', 'ERR_LIDAR_DIRT_OBSCURATION', 'ERR_PALLET_POCKET_NOT_DETECTED', 'ERR_LOCALIZATION_LOST']), places=0)

for row in D['firmware']:
    wb = [r for r in grid if r and r[0] == row['rel']][0]
    for i, k in enumerate(['glare', 'elsewhere', 'gap'], start=1): check(f"5.5 {row['rel']} {k}", row[k]['v'], wb[i])
fw = [r for r in grid if r and isinstance(r[0], str) and r[0].startswith('v3.')]
check('5.5 average glare', D['firmwareAvg']['glare']['v'], sum(r[1] for r in fw) / len(fw), places=1)
check('5.5 average elsewhere', D['firmwareAvg']['elsewhere']['v'], sum(r[2] for r in fw) / len(fw), places=1)

for t in D['technician']:
    wb = [r for r in grid if r and r[0] == t['region']][0]
    check(f"5.6 technician {t['region']} visits", t['visits']['v'], wb[1]); check(f"5.6 technician {t['region']} mean", t['meanMin']['v'], wb[2])
s = D['support']
A7 = {'tickets': 'Support tickets', 'noFaultFoundShare': 'Tickets that ended as no fault found', 'noFaultFoundEngHours': 'Engineering hours on no-fault-found tickets',
      'engHoursAllTickets': 'Engineering hours on all tickets', 'vlmMatch': 'Model label matches the human label', 'missionsCompleted': 'Missions completed',
      'incidentsHitLiveMission': 'Incidents that hit a live mission (7-day extract)', 'networkDropouts': 'Network dropouts (7-day extract)',
      'dropoutsStoppedRobot': 'Dropouts that stopped a robot', 'trafficWaitHours': 'Traffic waiting, hours (7-day extract)'}
for k, lab in A7.items(): check('5.6 ' + k, s[k]['v'], cell_by_label(lab))
check('5.6 noFaultFoundTickets', s['noFaultFoundTickets']['v'], cell_by_label('Support tickets') * cell_by_label('Tickets that ended as no fault found'), places=0)
for cu in D['customers']:
    wb = [r for r in grid if r and r[0] == cu['name']][0]
    for i, k in enumerate(['robots', 'downtimePerRobot', 'costLakh', 'contractLakh'], start=1): check(f"5.6 {cu['name']} {k}", cu[k]['v'], wb[i])
check('5.6 customers total', D['customersTotalLakh']['v'], cell_by_label('Contract value of these customers, INR lakh'))
check('5.6 customers share', D['customersShareOfContract']['v'], cell_by_label('Share of all contract value'))
check('5.8 pallets per moving hour (3,868 / 1,729)', D['assumed']['palletsPerMovingHour']['v'],
      cell_by_label('Pallet moves lost') / cell_by_label('Downtime hours from incidents'), places=2)
print(f'T10: {checked} figures checked, {fails} mismatches' + ('' if fails else ' -> ALL PASS'))

# ---- Test 22: per-site table
table, _ = build(xlsx)
f22 = 0
def chk22(cond, msg):
    global f22
    print(('PASS ' if cond else 'FAIL ') + msg); f22 += (not cond)
gen = {r['site_id']: r for r in table}
page = {r['site_id']: r for r in D['siteTable']}
chk22(len(page) == 30 and set(page) == set(gen), '30 sites in data.js, same ids as the regenerated table')
for sid, g in gen.items():
    p = page[sid]
    same = (p['robots_deployed']['v'] == g['robots_deployed'] and p['shift_pattern'] == g['shift_pattern'] and p['incidents']['v'] == g['incidents']
            and p['lowBatteryStops']['v'] == g['lowBatteryStops'] and abs(p['chargingShare']['v'] - g['chargingShare']) < 1e-12
            and abs(p['movingShare']['v'] - g['movingShare']) < 1e-12)
    if not same: chk22(False, f'{sid} differs from regenerated row')
chk22(True, 'every data.js row equals the freshly regenerated row')
REF = [('S08', '24x7', 8, 23.5, None, 63, 37, 4.62), ('S21', '24x7', 5, 23.2, 44.5, 103, 7, 1.40), ('S22', '24x7', 6, 21.7, None, 95, 33, 5.50),
       ('S12', '16x7', 17, 11.8, None, 32, 6, 0.35), ('S20', '16x6', 16, 11.6, None, 59, 3, 0.19)]
for sid, sh, rb, chg, mov, inc, stops, per in REF:
    p = page[sid]
    good = (p['shift_pattern'] == sh and p['robots_deployed']['v'] == rb and round(100 * p['chargingShare']['v'], 1) == chg
            and (mov is None or round(100 * p['movingShare']['v'], 1) == mov) and p['incidents']['v'] == inc
            and p['lowBatteryStops']['v'] == stops and round(p['lowBatteryPerRobot']['v'], 2) == per)
    chk22(good, f"reference row {sid}: {sh}, {rb} robots, charging {100*p['chargingShare']['v']:.1f}%, moving {100*p['movingShare']['v']:.1f}%, {p['incidents']['v']} incidents, {p['lowBatteryStops']['v']} stops ({p['lowBatteryPerRobot']['v']:.2f})")
r24 = sum(p['robots_deployed']['v'] for p in page.values() if p['shift_pattern'] == '24x7')
n24 = sum(1 for p in page.values() if p['shift_pattern'] == '24x7')
chk22(r24 == 74 and n24 == 10, f'{n24} sites run 24x7 with {r24} robots')
lb = sorted(p['lowBatteryPerRobot']['v'] for p in page.values() if p['shift_pattern'] == '24x7')
chk22(round(lb[0], 2) == 0.75 and round(lb[-1], 2) == 5.50, f'24x7 low-battery stops per robot range {lb[0]:.2f} to {lb[-1]:.2f}')
print('T22: ' + ('ALL PASS' if not f22 else f'{f22} FAILED'))
sys.exit(1 if fails or f22 else 0)
