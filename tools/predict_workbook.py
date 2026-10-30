"""Prediction add-on test 2: reads Analysis section 13 of the workbook (cached values) and prints them as JSON,
so run_tests.js can compare them with PredictCalc. Usage: python3 -I tools/predict_workbook.py source/botsync_dummy_data.xlsx"""
import sys, json, openpyxl
ws = openpyxl.load_workbook(sys.argv[1], data_only=True)["Analysis"]
out, on = {}, False
for row in ws.iter_rows(values_only=True):
    c = [v for v in row if v is not None]
    if not c: continue
    t = str(c[0])
    if t.startswith("13. PREDICTION"): on = True
    if not on: continue
    if t in ("16x6", "16x7", "24x7") and len(c) >= 4: out[t] = [c[1], c[2], c[3]]
    for key, label in [("siteGap", "largest gap at any single site"), ("nEarly", "robots with a low-battery stop before"), ("shareEarly", "share with another stop"), ("shareNone", "robots with no stop before"),
                       ("glare", "glare-door sites that start 14:00"), ("other", "the same share at all other sites"), ("repeat", "repeat the same fault"), ("watchN", "robots on the watch list"),
                       ("watchFleet", "watch list as a share"), ("watchLater", "their share of all incidents"), ("telemetryDays", "days covered by component telemetry"), ("repl", "component replacements recorded")]:
        if t.startswith("Prediction:") and label in t and len(c) > 1: out[key] = c[1]
    if t.startswith("13f"):
        out["limits"] = []
    elif "limits" in out and len(out["limits"]) < 6 and len(c) == 1: out["limits"].append(t)
print(json.dumps(out))
