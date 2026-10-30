"""Fill the generated block of botsync_walkthrough/assets/js/data.js from the workbook.
Usage: python3 -I tools/build_data.py botsync_dummy_data.xlsx botsync_walkthrough/assets/js/data.js"""
import sys, json, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_table import build, rows
import openpyxl

S_SITES, S_UTIL, S_INC, S_ST, S_CH, S_CODES = 'sites tab', 'robot_daily_utilization tab', 'incidents tab', 'stations tab', 'charge_sessions tab', 'error_codes tab'

def V(v, src): return {'v': v, 'src': src}

def main(xlsx, datajs):
    table, _ = build(xlsx)
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    sites = []
    for r in table:
        sites.append({
            'site_id': r['site_id'], 'site_name': r['site_name'], 'shift_pattern': r['shift_pattern'],
            'region': r['region'], 'industry': r['industry'], 'site_type': r['site_type'], 'floor': r['floor'], 'lighting': r['lighting'],
            'robots_deployed': V(r['robots_deployed'], S_SITES), 'wifi': V(r['wifi'], S_SITES), 'aisleMin': V(r['aisleMin'], S_SITES),
            'scheduledHours': V(r['scheduledHours'], S_UTIL),
            'movingShare': V(r['movingShare'], S_UTIL), 'chargingShare': V(r['chargingShare'], S_UTIL),
            'idleShare': V(r['idleShare'], S_UTIL), 'errorShare': V(r['errorShare'], S_UTIL),
            'incidents': V(r['incidents'], S_INC), 'lowBatteryStops': V(r['lowBatteryStops'], S_INC),
            'lowBatteryPerRobot': V(r['lowBatteryPerRobot'], S_INC), 'downtimeHours': V(r['downtimeHours'], S_INC),
            'medianDowntimeMin': V(r['medianDowntimeMin'], S_INC), 'chargeSessions': V(r['chargeSessions'], S_CH),
            'stations': {k: V(v, S_ST) for k, v in r['stations'].items()}, 'glareStations': V(r['glareStations'], S_ST),
            'incidentsByCode': {k: V(v, S_INC) for k, v in r['incidentsByCode'].items()},
            'recoveryTypes': {k: V(v, S_INC) for k, v in r['recoveryTypes'].items()},
        })
    codes = {}
    for r in rows(wb, 'error_codes'):
        if not r['error_code'].startswith('ERR_'): continue
        codes[r['error_code']] = {'severity': 'soft stop' if r['severity'] == 'soft_stop' else 'hard stop',
                                  'auto': r['auto_recoverable'] == 'Y', 'cause': r['typical_cause'], 'category': r['category'], 'src': S_CODES}
    block = ('/* BEGIN GENERATED (tools/build_data.py; do not edit by hand) */\n'
             '    siteTable: ' + json.dumps(sites, ensure_ascii=False) + ',\n'
             '    errorCodes: ' + json.dumps(codes, ensure_ascii=False, indent=1).replace('\n', '\n    ') + ',\n'
             '    /* END GENERATED */')
    src = open(datajs, encoding='utf-8').read()
    new = re.sub(r'/\* BEGIN GENERATED.*?/\* END GENERATED \*/', lambda m: block, src, flags=re.S)
    assert new != src or block in src
    open(datajs, 'w', encoding='utf-8').write(new)
    print('wrote', len(sites), 'sites and', len(codes), 'codes into', datajs)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
