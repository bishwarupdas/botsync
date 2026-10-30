# Spec checklist: build doc section by section

Each row maps a part of `source/botsync_interactive_build_spec.md` to where it is on the page and the automated check that covers it.

- **T*n*** is acceptance test *n* (`node tools/run_tests.js`, output in `evidence/test_output.txt`).
- **Audit** is the click-through audit (`node tools/audit.js`, output in `evidence/audit_output.txt`). It drives the page with real clicks, typing and sliders, and after every step fails on any console error or on "NaN", "undefined" or "[object" in the visible text.

## 1. Hard constraints

| Spec | Where | Checked by |
|---|---|---|
| 1.1 One zip, double-click, no install | `botsync_walkthrough.zip` (0.11 MB) | T16 (fresh unzip in a new folder) |
| 1.2 `file://`, classic scripts, no fetch/XHR/workers/CDN, localStorage in try/catch | `index.html`, all `assets/js` | T1, T2, T3 |
| 1.3 Zip layout and relative paths | 12 files as listed in 1.3 | T3, T16 |
| 1.4 Laptop browsers, usable down to 1024 px | `style.css` | T15, Audit (1440, 1280, 1024) |
| 1.5 Under 5 MB, no video, no large images | zip 0.11 MB | T16 |
| 1.6 No third-party services, no speech recognition | voice uses preset phrases only | T2, T3 (no SpeechRecognition or getUserMedia) |
| 1.7 No logos or brand marks | favicon is a plain robot outline | T18 (gallery) |

## 2. Honesty rules

| Spec | Where | Checked by |
|---|---|---|
| 2.1 Banner on every screen | `#banner`, always visible | T4 |
| 2.2 Every number from Analysis, data tabs, Planted_patterns, assumed, scripted or simulated | `data.js` `{v, src}`; the per-site table is generated from the workbook | T9, T10 (189 figures), T22 |
| 2.2 "assumed" tag wherever an assumed value appears | `N()` adds the tag automatically from `src` | T20 (Show sources) |
| 2.3 No invented statistics | scripted limits are tagged "scripted example" | Review; T20 tags |
| 2.4 Model steps fixed text, "scripted example" in the panel header | `scenarios.js`, pipeline header tag | T7 |
| 2.5 Game results are direction, not a forecast | Game results text and Limits box | Audit (Game result line) |
| 2.6 No claim that the swap works | Game results text: "this does not show that it works" | Review |

## 3. Visual style

| Spec | Where | Checked by |
|---|---|---|
| Colour for state only (red, green, amber) | Kept for state. **Changed after review:** blue, teal and violet added for chrome and charts, never for state | T18 palette check (state hues plus decoration hues only) |
| Never colour alone (X mark, thick outline, PASS/FAIL words) | `drawRobot`, chips | T19 (greyscale) |
| System fonts; text at least 14 px, 12 px for labels, tags and chips | `style.css` | T15 |
| Keyboard, Esc closes panels, visible focus ring | global handlers | T13 |
| prefers-reduced-motion | robots jump; no typewriter; flowchart steps still highlight | T14 |

## 4. Screens

| Spec | Where | Checked by |
|---|---|---|
| Top bar: title, warehouse, mode, speed, banner | `#topbar` | Audit (every control) |
| 4.1 Start: Guided, Explore, Game, 3 lines, Quick tour | Start screen | Audit |
| 4.2 Explore: map (~60%), fleet / robot / scenario panel, event log (last 12) with Human clicks and Operator walk-ups | work screen; the map stays in view and the right panel scrolls on its own | T5, T6, Audit (layout at 3 sizes) |
| 4.3 Incident panel: header, live timer, camera 320x200, VLM text, 3 log lines, Recover / Call operator / Why | `renderIncidentPanel` | T6; Audit (every error code at every warehouse, plus Call operator) |
| 4.4 How it works: three clickable diagrams | How it works screen | T20, Audit (every box, and Enter key) |
| 4.5 Roadmap: month tabs, sortable RICE, impact scale, what-follows line | Roadmap screen | T20, Audit (6 tabs, every column both ways) |
| 4.9 Evidence: six SVG charts with a reading and a source tag; not-trust and missing-data lists | Evidence screen | T20 |
| 4.10 Fleet overview: 30 tiles, 10 bold, 3 pilot, 3 in this demo. **Changed after review:** every tile opens its site history; the 3 demo sites also open their live warehouse | Fleet overview, Site history | T20, T25, Audit (all 30 tiles, every history control) |
| 4.11 Architecture: three lanes, arrows, three callouts | Architecture screen | T20 |
| 4.12 Approval screen (U1-U7, voice); refuses out-of-range input | `UI.approval` | T20, Audit (U1, U2, U3, U4, U5, U6, U7, U9, U10, voice; 4 out-of-range edits refused) |
| 4.13 View as: six roles change the default panel and the three headline numbers | fleet panel | T20, Audit (each role at each warehouse; floor Recover buttons; technician triage list; product RICE and roadmap) |
| 4.14 Quick tour (changed after review): one step from chapters 1, 3, 5, 8, 9 | `UI.startGuided('tour')` | T20 |
| 4.15 Show sources: tag text comes from `src` in `data.js` | `.num[data-src]` | T20 |

## 5. Data

| Spec | Where | Checked by |
|---|---|---|
| 5.1-5.6 values at full precision | `data.js` | T10 |
| 5.7 three warehouses | generated `siteTable` | T9, T22, T5 |
| 5.8 assumed values | `data.js` `assumed` | T20 tags; Game sliders show default and tag |
| 5.9 per-site table generated by script | `tools/build_data.py` | T22 |

## 6. Pipeline

| Spec | Where | Checked by |
|---|---|---|
| A7 pipeline pacing. **Changed after review:** step history cards, kind chips, text then 2.5 s hold, Auto / Step | `UI.Pipeline` | Audit (Step mode, cards, click-to-jump) |
| 6.1 Six boxes; PASS -> execute -> log; FAIL -> person -> execute or log; nothing valid -> reject proposal -> person | `UI.Pipeline` | T6, T7; Audit (U5 nonsense instruction takes the reject-proposal path) |
| 6.2 Gate 1 and Gate 2 names and thresholds; runtime checks | gate tables in U1, U4, U9 | T7 |
| 6.3 Explanations and three levels | How it works | Audit |

## 7 and 7A. Maps and assets

| Spec | Where | Checked by |
|---|---|---|
| Aisle widths to scale; bays numbered as in section 7; assumed chargers; swap bay; service bay; glare band at C 14:00-17:00; a different floor plan per site | `warehouses.js` | T5; Audit (Recover at every code on each map; every scenario's bays); screenshots `evidence/warehouse_*.png` |
| Every asset in every state; gallery at `#assets` | `draw.js`, gallery | T18, T19 |
| Motion constants in one CONFIG | `draw.js` CONFIG | Review |

## 8. Simulation

| Spec | Where | Checked by |
|---|---|---|
| 8.1 state machine, battery, pFlat, swap with fallback | `sim.js` | T11, T12 |
| 8.1b demand cap and "work ran out" | `compare()` | T21 |
| 8.1c shift hours | `onShift` | T23 |
| 8.1d traffic by mechanism in Explore, by Poisson rates in Game | segments: head-on robots wait, same-direction robots follow one robot-length apart; shared spots drawn side by side | Audit (25 s at 16x per warehouse; traffic stops rare, no pile-ups) |
| 8.1e Limits box | Game results | Audit |
| 8.2 calibrated incidents; glare-door docking 3x in 14:00-17:00 | `buildIncidentSchedules` | T11 |
| 8.3 policies (agent 4 or 7 min; triage changes no robot time; safety never touched) | `openIncident` | T12, T21 |
| 8.4 metrics; 8.5 `selfTest()` | `metrics`, `selfTest` | T11 |

## 9. Use cases (every variant, every decision)

All of these were run by clicks in the audit and by the scenario runner in T7.

| Spec | Variants and decisions |
|---|---|
| U1 glare docking | pass; fail + approve (7 min); fail + reject (operator 21.2 min); fail + edit (in range applied, out of range refused) |
| U2 object in front | box (alternate route drawn); spill (others rerouted, person, approve or reject); curtain (scripted wait) |
| U3 dirty lidar | confirm dirty; edit label; reject. Robot drives to the service bay and the operator wipes the lens |
| U4 offline change | pass (S16 canary, -31%); Gate 1 blocked (approve, edit, reject) with the "software cannot remove the charging loss" line; Gate 2 blocked (approve or reject); CHG-008 rollback panel |
| U5 typed instruction | valid; Bay 14 (approve or edit); Bay 1 closed (approve or reject); free text typed; nonsense text (reject-proposal path) |
| U6 task planning | passes (Gantt, missions start); tight plan (approve, edit, reject); planned vs actual; footnote |
| U7 triage | 12 rows confirmed or corrected (correct uses the approval screen); confirmed causes 46% -> 60% |
| U8 battery swap | switch, three sliders, spare packs 0 -> fallback to the charger, 6-step strip, targets, ceiling, static facts, phase 2 |
| U9 safety stop | refused; nothing in the sim changes (T8) |
| U10 vision path | capture, blur, label, store, confirm, edit or reject, evaluation set |
| 9.11 order | Next walks U1 > ... > U10 > V; Prev walks back; picker jumps anywhere (Audit) |

## 10-13. Game, voice, roadmap, guided

| Spec | Where | Checked by |
|---|---|---|
| 10 Game: switches, cameras greyed out, sliders with defaults and tags, Reset, Run a week, Skip, seed, 20-run average, scoreboard, result line, boxes | Game panel | T12, T17, T21; Audit (all at A, B and C) |
| 11 Voice: phone, tap to speak, 4 phrases, confirm card, refusal, follow-up question, risks, note. **Changed after review:** scenario V in the scenario player | Scenario V | T7, T8; Audit (by tapping and by variant buttons) |
| 12 RICE (recomputed), roadmap, 12.2b measures, benefits, model choice | Roadmap | T9, T20 |
| 13 Guided. **Changed after review:** 9 chapters, 36 steps, chapter list, Next unlocks after a decision | guide bar | T20; Audit (every step, Back, Leave, Return, chapter list, final buttons) |

## Prediction add-on (`botsync_prediction_addon_spec.md`)

| Add-on | Where | Checked by |
|---|---|---|
| 1 node calculation test prints the reference values | `tools/run_calc_test.sh` runs the spec's `test_calc.js` | T24 |
| 2 workbook Analysis 13a to 13e match | `tools/predict_workbook.py` | T24 |
| 3 every default number on screen | Predict screen | T24 |
| 4 sliders change only their panels; defaults restore | Predict screen | T24, Audit (every slider over its range) |
| 5 PREDICTION labels, italic lines, six limits | Predict screen | T24 |
| 6 no scores, no network | Predict screen | T24 |
| 7 existing app unchanged | all screens | T1 to T23 |
| 8 labels, keyboard, Esc, text alternatives, reduced motion | Predict screen | T24 |
| 9 greyscale | panels 3 and 4 | T24 (screenshots `evidence/predict_greyscale_panel*.png`) |

## 16. Acceptance tests

Tests 1 to 25 (24 and 25 added after review). See `evidence/test_output.txt` and `evidence/test_output_zip.txt`.
