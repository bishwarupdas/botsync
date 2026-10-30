# Build spec: Botsync interactive walkthrough (single-folder web page)

This file is the complete brief. A builder (a person or Claude Code in another terminal) should be able to build the whole thing from this file alone, plus the workbook `botsync_dummy_data.xlsx`, which the builder **needs** to generate the per-site table (5.9) and to run acceptance test 10 (send the workbook along with this file). Read sections 1 and 2 before anything else. They are the rules that cannot be broken.

---

## 0. What this is, in plain words

A case submission for the Botsync "Group Product Manager, Robotics Platform" role. The written case (a Claude Doc) recommends one improvement for the MAG1400 Fork AMR: **battery swapping with a person in the loop at the 24-hour sites**, followed by LLM triage, a vision model (VLM) for evidence, and an LLM recovery agent behind a deterministic check. This page lets the reader **see and try** all of it, using the same dummy data as the case.

The reader opens it, picks one of three warehouses, watches robots work, sees a robot stop, clicks it, sees what is in front of it, presses **Recover**, and watches the pipeline run (fault record, model proposal, deterministic check, pass or human click, robot moves). They can also play a game mode: choose a policy, run a simulated week, and compare outcomes.

---

## 1. Hard constraints (cannot be broken)

1. **Zero setup for the reader.** Deliver one zip: `botsync_walkthrough.zip`. Unzip, double-click `index.html`, it works. No server, no Node, no npm, no build step, no install, no internet.
2. **Works from `file://`.** This rules out several things:
   - Use **classic scripts only** (`<script src="assets/js/xxx.js"></script>`). **No `type="module"`** and no `import`/`export` (browsers block these on `file://`).
   - **No `fetch()` / `XMLHttpRequest`** for local files. All data lives in `assets/js/data.js` as `window.BOTSYNC_DATA = {...}`.
   - **No Web Workers**, no service workers, no WebAssembly loaded from a file.
   - **No CDN links of any kind** (no Google Fonts, no jsDelivr, no cdnjs). If a library is wanted, copy its minified file into `assets/js/`. Preferred: write plain JavaScript and use the `<canvas>` / inline SVG, with no library at all.
   - `localStorage` is optional and must be wrapped in try/catch. The page must work with it blocked.
3. **Layout of the zip** (relative paths only, no leading slash, no absolute paths):
   ```
   botsync_walkthrough/
     index.html
     README.txt              (3 lines: unzip, open index.html, works offline)
     assets/
       css/style.css
       js/data.js            (all numbers, section 5)
       js/warehouses.js      (maps, section 7)
       js/sim.js             (simulation engine, section 8)
       js/scenarios.js       (scripted use cases, section 9)
       js/draw.js            (every drawn asset, section 7A)
       js/ui.js              (screens, panels, guided mode)
       js/game.js            (game mode, section 10)
       js/voice.js           (phone and voice scene, section 11)
       img/favicon.svg       (the only image file; a plain top-down robot outline, no brand mark)
   ```
4. **Browser support:** latest Chrome, Edge, Firefox, Safari on a laptop. Designed for a laptop screen (1280 px wide and up). It must remain usable down to 1024 px. Phone layout is **not required**. The voice scene shows a phone **mock** inside the page.
5. **Size:** whole zip under 5 MB. No video files. No large images.
6. **No third-party services of any kind at run time.** In particular, the page must **not** call any speech recognition service or any language model. Browser speech recognition sends audio to an outside provider, which contradicts the case's own rule that no outside LLM or VLM is used. The voice scene uses tap-to-speak with preset phrases (section 11).
7. **No logos or brand marks** of Botsync or anyone else. The text "Botsync" may appear in the title and footer only as the name of the case.

---

## 2. Honesty rules (the page must say these things openly)

The case is graded on the reasoning, and the author must be able to explain every number. So:

1. **A banner on every screen**, always visible, one line: *"Dummy data. Patterns are seeded on purpose, as the case asks. Model steps are scripted examples, not live model calls."*
2. **Every number comes from one of these places**: (a) the `Analysis` tab of `botsync_dummy_data.xlsx` (listed in section 5); (b) the data tabs named in 5.7 and 5.9 (`sites`, `stations`, `incidents`, `robot_daily_utilization`, `charge_sessions`), or the `Planted_patterns` tab for the three facts quoted from it (glare labelled as dirty sensor 39% of the time; docking incidents at glare sites cluster 14:00 to 17:00; low-battery stops are concentrated in weak packs); (c) a value marked **assumed** (listed in section 5.8); (d) a value marked **scripted** or **simulated**. Assumed values are shown with an "assumed" tag wherever they appear (a small label, not a footnote).
3. **Never invent a statistic.** If the builder needs a number that is not in section 5, it must be added to section 5.8 as an assumption and tagged on screen. Do not show pallet counts, rupee values or percentages that are not listed here, except values the simulation itself produces, and those are tagged **simulated**.
4. **Scripted model steps** (LLM, VLM) are fixed text written in section 9. They are labelled **"scripted example"** in the panel header. No randomness in the wording.
5. **Game results are a simulation using assumptions**, shown as direction not forecast. The results screen says so.
6. Do not claim the battery swap works. It is a proposal; the page shows what the sim says under stated assumptions.

---

## 3. Visual style

- **White background, black text, black 1 px lines, plain boxes.** No gradients, shadows, glass effects, emoji, or decorative icons.
- **System font stack only:** `font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;` Monospace for codes: `ui-monospace, Menlo, Consolas, monospace`.
- **Colour is allowed for state only, and only two colours plus grey:**
  - red `#C62828` = stopped, failed gate, refused
  - green `#2E7D32` = recovered, passed gate
  - grey `#9E9E9E` / light grey `#EEEEEE` = idle, disabled, backgrounds of lanes
  - Amber `#B26A00` is allowed for exactly one state: "waiting for a person".
  Everything else is black on white.
- Never rely on colour alone: stopped robots also get a thick outline and an "X" mark; passed gates show "PASS", failed show "FAIL".
- Minimum text size 14 px; map labels, tags and chips 12 px. Contrast must meet WCAG AA.
- Body copy short, plain sentences. No marketing language, no "AI-powered", no buzzwords.
- Keyboard: every button reachable with Tab, Enter/Space activates, Esc closes the open panel. Visible focus ring.
- Respect `prefers-reduced-motion`: if set, robots jump between cells instead of gliding and flowchart steps appear without animation (the step highlighting still happens).

---

## 4. Screens and navigation

Top bar (always visible): title, **warehouse switcher** (A / B / C), **mode switch** (Guided / Explore / Game), speed control (Pause, 1x, 4x, 16x), banner (section 2.1).

### 4.1 Start screen
Two large buttons: **Guided** (a step-by-step story) and **Explore** (free play). A third link: **Game** (policy comparison). Under them, three lines: what the page is, that data is dummy, how long Guided takes (about 8 minutes).

### 4.2 Explore mode (the main screen)
Layout, left to right:
1. **Floor map (canvas, about 60 % width).** Top-down view of the selected warehouse: aisles, racks, stations (numbered "Bay n"), chargers, the swap bay (when the battery swap policy is on), robots as small rectangles with a number label ("Bot 5") and a battery bar. Robots glide along aisles. Stopped robot = red outline, X mark, blinking slowly (not faster than 1 Hz).
2. **Right panel (about 40 %)**, which changes with what is selected:
   - *Nothing selected:* **Fleet panel**: four live meters (moving, charging, idle, stopped) as plain bars, a count of robots by state, and the "KPIs today" box (pallets moved, emergency low-battery stops, downtime minutes), plus the **Use cases** list (section 9) as buttons.
   - *Robot selected:* **Robot panel**: state, battery %, current mission, firmware, pack health, last incident. If stopped: the **Incident panel** (below).
   - *Use case selected:* **Scenario player** (section 9.0).
3. **Bottom strip:** event log (last 12 events, newest first) with time, robot, code, and outcome. A "Human clicks" counter and "Operator walk-ups" counter sit at its right.

### 4.3 Incident panel (opens when you click a stopped robot)
Contents, top to bottom:
1. Header: "Bot 5 stopped", error code in monospace, severity (soft stop / hard stop), time stopped (live timer).
2. **Camera view (canvas, about 320 × 200):** a simple drawn scene from the robot's front camera: floor, a pallet in front, and the thing blocking it (see 9.2 for variants: fallen box, spilled pallet, soft curtain, sun glare band, dirty-lens smudge, wrapped pallet pocket, skewed pallet). Drawn with plain shapes in grey/black only; the blocking object has a thin red outline.
3. **What the VLM says (scripted example):** label, confidence, and the human-label status ("advisory: not acting on this alone").
4. **What the logs say:** 3 short lines (error code meaning from `typical_cause`, last 3 recovery attempts, station and glare flag).
5. **Buttons:** **Recover** (starts the pipeline), **Call operator** (the "today" path: operator walks up, timer runs), **Why did this happen?** (shows triage text, 9.7).
6. When Recover is pressed, the **pipeline flowchart** takes over this panel (section 6).

### 4.4 Pipeline overview screen (button "How it works" in the top bar)
The three diagrams from the case, drawn as clickable SVG: (1) the fix flow, (2) task planning, (3) the vision path. Clicking a box shows a short plain-language explanation (from section 6.3). These are static; the live version is the flowchart in 4.3.

### 4.5 Roadmap screen (button "Roadmap" in the top bar)
- The six-month table (section 12.2), with month tabs.
- The RICE table (section 12.1), sortable by clicking a column header, with the impact scale shown under it.
- "What follows what" line: battery swap phase 1 first; triage, VLM labels, recovery agent follow; automated station only if the month-4 gate passes.

### 4.6 Game mode (section 10).

### 4.7 Voice scene (section 11), reached from the top bar ("Voice from a phone").

### 4.8 Guided mode (section 13).

### 4.9 Evidence screen ("What the data says"; button in the top bar)
The case's argument as six plain charts, so the reader sees **how the data led to the recommendation** before playing with the fixes. No chart library; draw with SVG (A8). Each chart has a one-line reading under it and a source tag ("Analysis n").
1. **Where robot time goes** (Analysis 1): stacked bar 62% moving, 15% charging, 1% failure (the rest is idle and other).
2. **Frequent is not costly** (Analysis 2): the top eight codes as paired horizontal bars, share of incidents vs share of downtime hours (docking 29% / 14%; lidar dirt 6% / 13%; technician-handled repairs 8% / 59% as a ninth pair from Analysis 1).
3. **Charging by shift pattern** (Analysis 4): three bars (16x6 11.6%, 16x7 11.6%, 24x7 20.4%) and a second set for emergency low-battery stops per robot (0.28, 0.25, 2.99).
4. **Firmware or site?** (Analysis 3): the six releases as pairs (glare-door sites vs elsewhere). Reading: "compare within a column before blaming firmware".
5. **Ageing packs** (Analysis 5): two bars, 2.70 vs 0.59 stops per robot (weak vs healthier packs; 57 weak packs).
6. **What the three fix levels could reach** (Analysis 9): bars for level 1 (801 h), level 2 (258 h), hardware (556 h), safety (113 h), with the note that level 3 cannot be sized.
Underneath: the **"What I would not trust"** list (Analysis 11), five short items, and the **"Data I would need and do not have"** list (Analysis 12).

### 4.10 Fleet overview screen (the 250 robots in context)
A grid of **30 site tiles** (not a geographic map), sorted by shift pattern then site id, built from the per-site table in 5.9. Each tile shows: site id and name, shift pattern, robots, charging share of scheduled time as a small bar, and emergency low-battery stops per robot. The ten 24x7 tiles carry a bold outline; **S08, S21 and S22 carry a "pilot" tag**; S08, S12 and S20 carry an "in this demo" tag and open the matching warehouse when clicked (other tiles show "not simulated here"). A header line: "10 of 30 sites run 24 hours: 74 of 250 robots (Analysis 4)". This is where the reader sees that the swap helps only part of the fleet.

### 4.11 Architecture screen ("Where each piece runs")
A three-lane diagram (SVG): **Robot**, **Site server**, **Botsync cloud**. Place the boxes: on the robot, the safety layer, the ROS 2 stack with behaviour trees, the runtime deterministic check (Gate 1), the standard recovery fallback and the camera; on the site server (or at the robot edge), the fleet manager, the evidence capture, the recovery agent's runtime path; in Botsync's cloud (self-hosted models only), the fine-tuned small LLM, the small VLM, triage, change generation, Gate 2 (replay, regression, boundary diff, scenario suite), canary control, and the evaluation set. Arrows show data flows (incident and evidence up, approved action or change down). Three callouts: (1) **if the link is lost the robot keeps using its standard recovery**; nothing waits for a model; (2) **the safety layer never takes input from a model**; (3) **customer pictures stay on Botsync-controlled machines**. Text only claims what the case claims; do not add latency numbers or hardware sizes.

### 4.12 Approval screen (the one screen a person sees when a check fails or a value sits at its limit)
Reusable component used by U1, U2, U3, U4, U5, U6, U7 and the voice scene. Layout, top to bottom: (1) **What failed** in one sentence and the rule name (for example "speed 0.6 m/s is above the 0.3 m/s limit"); (2) **Why it matters** in one sentence; (3) **The proposal** in a monospace block, with the offending value highlighted by a bold underline (not colour only); (4) **A passing alternative** in a second block, produced by the scripted model; (5) buttons **Approve alternative** (one click), **Edit** (opens the value in a small field limited to the allowed range) and **Reject**; (6) a result line: "applied", "applied after edit" or "blocked", plus "label stored for the evaluation set". Everything a person decides is counted in the "Human clicks" counter. The screen never lets the person type a value outside the allowed range; outside-range input shows the range and refuses.

### 4.13 View as (a role selector in the top bar)
Six chips: Operations head, Floor supervisor, Site IT, Field technician, Deployment engineer, Product and engineering. It only changes the **default right-hand panel and the three headline numbers** in the fleet panel (no data changes):
- Operations head: pallet moves, emergency stops, downtime hours, and the "customers to watch" table (5.6).
- Floor supervisor: the stopped-robot list with Recover buttons and the operator walk-up counter.
- Site IT: network dropouts (1,784, only 1 stopped a robot), traffic wait 3.7 h, WMS handshake incidents.
- Field technician: the triage list (U7) and the hardware-wear rows (168 incidents, 556 hours; technician response by region).
- Deployment engineer: the site tile for the selected site (shift, aisle width, lighting, Wi-Fi score) and the glare bays.
- Product and engineering: the RICE table and the roadmap.
The selected role appears next to the title. Default is Operations head.

### 4.14 Quick tour
A "Quick tour (2 minutes)" button next to Guided that runs Guided steps 1, 3, 6, 13 and 14 only.

### 4.15 "Where does this number come from?"
A switch in the top bar, **Show sources**. When on, every number on the page gets a small tag (12 px) with its source ("Analysis 4", "assumed", "scripted", "simulated", "sites tab") and a dotted underline. The tag text must come from a `src` field next to each value in `data.js`, not typed separately in the HTML, so the two cannot drift.

---

## 5. Data (`assets/js/data.js`)

Create `window.BOTSYNC_DATA` with the groups below. **Every value in 5.1 to 5.7 is copied from the workbook `Analysis` tab (the "Analysis n" label says which section) or from the data tabs named.** Keep full precision in the file; round only when displaying.

### 5.1 Fleet and time (Analysis 1)
| key | value | note |
|---|---|---|
| robots | 250 | |
| sites | 30 | |
| scheduledRobotHours30d | 134,304 | |
| shareMoving | 0.6228 (62%) | |
| shareCharging | 0.1511 (15%) | |
| shareFailure | 0.0098 (1%) | |
| incidents30d | 2,137 | |
| incidentDowntimeHours | 1,729.1 | |
| failureHoursUtilisationTab | 1,319.5 | does not match the line above; the page footnote says "I would find out why before quoting hours to a customer" |
| dockingTimeouts | 615 | |
| dockingShareOfIncidents | 0.2878 (29%) | |
| dockingShareOfDowntimeHours | 0.1445 (14%) | |
| technicianShareOfDowntimeHours | 0.5872 (59%) | |
| technicianShareOfIncidents | 0.0838 (8%) | |
| incidentsNoConfirmedCause | 0.5377 (54%) | |
| costBornePerCustomersInrLakh | 40.96 | assumed rates |
| botsyncSupportCostInrLakh | 54.47 | assumed rates |
| palletMovesLost30d | 3,868 | |

### 5.2 Error codes (Analysis 2 and 9; descriptions from tab `error_codes`)
Top eight by incidents:

| code | incidents | downtime h | share of incidents | share of hours | cleared by operator or remote | fix level (my assumption) | typical cause (tab `error_codes`) |
|---|---|---|---|---|---|---|---|
| ERR_DOCKING_ALIGNMENT_TIMEOUT | 615 | 249.9 | 28.8% | 14.5% | 46.7% | 1 recovery primitive | Glare, skewed or damaged pallet, dirty sensor |
| ERR_BATTERY_LOW_CRITICAL | 267 | 129.9 | 12.5% | 7.5% | 95.1% | 2 parameter or site config | Battery below 10% before reaching a charger |
| ERR_OBSTACLE_PERSISTENT_BLOCK | 213 | 62.8 | 10.0% | 3.6% | 70.4% | 1 | Unmapped obstacle or soft curtain in path |
| ERR_SAFETY_LIDAR_ESTOP | 171 | 113.4 | 8.0% | 6.6% | 94.2% | outside: safety | Person or forklift in safety field; manual reset needed |
| ERR_PALLET_POCKET_NOT_DETECTED | 139 | 88.1 | 6.5% | 5.1% | 69.1% | 1 | Wrapped or broken pallet pocket not seen by depth camera |
| ERR_LIDAR_DIRT_OBSCURATION | 129 | 216.9 | 6.0% | 12.5% | 72.9% | 1 | Dust or grease on lidar window |
| ERR_LOCALIZATION_LOST | 116 | 89.0 | 5.4% | 5.1% | 67.2% | 1 | Feature-poor area or layout change |
| ERR_PATH_PLANNING_DEADLOCK | 95 | 27.1 | 4.4% | 1.6% | 62.1% | 1 | Costmap conflict around a dynamic obstacle |

Other codes used by the scenarios (descriptions from tab `error_codes`): `ERR_INTERSECTION_GRIDLOCK_TIMEOUT` (multi-robot wait cycle in a narrow aisle, soft stop), `ERR_WMS_HANDSHAKE_TIMEOUT` (WMS / API timeout when pulling the task, soft stop), `ERR_FORK_LIMIT_SWITCH_FAULT`, `ERR_LIFT_MOTOR_OVERCURRENT` (hardware, technician), `ERR_CHARGER_CONTACT_FAULT`.
Severity values: soft stop (auto-recoverable) or hard stop (not auto-recoverable), as in `error_codes`.

### 5.3 The three fix levels, sized (Analysis 9)
| level | incidents | downtime h | share of incidents | share of hours | operator or remote hours |
|---|---|---|---|---|---|
| 1 recovery primitive | 1,475 | 801.2 | 69.0% | 46.3% | 420.0 |
| 2 parameter or site config | 323 | 258.2 | 15.1% | 14.9% | 159.3 |
| outside: hardware | 168 | 556.3 | 7.9% | 32.2% | 35.9 |
| outside: safety | 171 | 113.4 | 8.0% | 6.6% | 54.9 |
Level 3 (node code) cannot be sized; there is no code-level cause per incident. The safety layer is never editable by a model.

### 5.4 Charging (Analysis 4, 5, 10)
| key | value |
|---|---|
| chargingShareByPattern | 16x6: 11.6% (6 sites); 16x7: 11.6% (14 sites); 24x7: 20.4% (10 sites) |
| avgChargerWaitMinPerSession | 16x6: 0.09; 16x7: 0.20; 24x7: 2.37 |
| emergencyLowBatteryStopsPerRobot (30 days) | 16x6: 0.28; 16x7: 0.25; 24x7: 2.99 |
| chargingHoursAt24x7Sites | 10,859.6 |
| aboveThe16HourRate | 4,654.8 hours (about 63 hours per robot at 74 robots) |
| robotsAt24x7Sites | 74 |
| avgChargeSessionMin | 100.6 |
| ceilingIfEveryChargeBecameASwap, 24x7 sites | 10,320 hours |
| chargingHoursFleetInScheduledTime | 20,295.2 |
| fleetCeilingIfEverySwap | 19,286.9 hours = 14.4% of scheduled hours |
| weakPacks (health below 85%) | 57 packs |
| lowBatteryStopsPerRobot, weak vs healthier packs | 2.70 vs 0.59 |
The two ceilings are **ceilings, not forecasts**: they assume every swap works first time (Analysis 4, 10).

### 5.5 Firmware and site (Analysis 3)
Docking timeouts per 100 robot-days, at glare-door sites vs elsewhere:
v3.4.2: 8.5 vs 8.3 (gap 1.0x); v3.5.0: 8.3 vs 9.1 (0.9x); v3.5.3: 11.2 vs 5.7 (1.9x); v3.6.0: 20.5 vs 7.2 (2.9x); v3.6.1: 0 vs 7.8 (0, few robots, noisy); v3.7.0: 19.2 vs 5.5 (3.5x). Averages across releases 11.3 vs 7.3.
Reading to show: "compare within a column before blaming firmware".

### 5.6 People, support, customers, noise (Analysis 6, 7, 8)
- Technician mean response minutes: India 168 (99 visits), Southeast Asia 332 (57), Australia 258 (23).
- Support tickets 272; no-fault-found 18.75% (51 tickets); engineering hours on no-fault-found 158 of 1,033.2.
- VLM label matches human label 81.0% (only rows with a human label); glare vs dirty-sensor confusion is the known weak spot (Planted pattern 8: glare labelled dirty_sensor 39% of the time).
- Missions completed 98.1%; incidents that hit a live mission 41.4% (7-day extract only).
- Network dropouts 1,784, of which 1 stopped a robot (7-day extract); traffic waiting 3.7 hours (7-day extract).
- Customers to watch (churn-risk flag): Meridian Auto Components, 26 robots, 6.0 downtime h per robot, ₹7.3 lakh cost borne, contract ₹566.4 lakh; Harbor Cold Chain, 14, 9.1, ₹4.0 lakh, ₹227.6 lakh; Banyan Dairy, 12, 6.0, ₹1.0 lakh, ₹178.2 lakh; Ironbridge Castings, 7, 12.0, ₹1.6 lakh, ₹102.2 lakh. Together ₹1,074.4 lakh, 24.7% (about 25%) of contract value. Rupee rates are assumed.

### 5.7 The three warehouses (copied from tabs `sites`, `stations`, `incidents`, `robot_daily_utilization`, `charge_sessions`; 30 days from 2026-09-01)
| | A: S08 Bangkok Plant | B: S12 Tuas Singapore Plant | C: S20 Johor Bahru DC |
|---|---|---|---|
| Region / industry | Southeast Asia / FMCG | Southeast Asia / FMCG | Southeast Asia / Distribution Centre |
| Site type | brownfield | greenfield | brownfield |
| Floor / lighting | flat / mixed | flat / stable | polished / glare at dock doors |
| Wi-Fi score | 88 | 89 | 94 |
| Min aisle width | 2.4 m | 3.5 m | 2.9 m |
| Shift pattern | **24x7** | **16x7** | **16x6** |
| Robots | 8 | 17 | 16 |
| Stations | 11: floor staging 4, conveyor 4, dock door 2, rack 1 | 17: floor staging 7, dock door 4, rack 4, conveyor 2 | 17: rack 7, conveyor 4, dock door 4, floor staging 2 (4 glare-exposed) |
| Scheduled robot-hours | 5,760 | 8,160 | 6,656 |
| Share moving / charging / idle / error | 66.0% / 23.5% / 9.6% / 0.5% | 54.9% / 11.8% / 32.6% / 0.3% | 63.4% / 11.6% / 24.3% / 0.6% |
| Charge sessions | 659 | 1,020 | 832 |
| Incidents (30 days) | 63 | 32 | 59 |
| Downtime hours | 37.3 | 58.1 | 55.1 |
| Median downtime per incident (min) | 25.9 | 29.1 | 19.3 |
| Emergency low-battery stops | 37 (4.62 per robot) | 6 (0.35 per robot) | 3 (0.19 per robot) |
| Incidents by code | LOW_BATTERY 37, DOCKING 9, POCKET 5, DEADLOCK 4, OBSTACLE 3, WMS 2, LIDAR_DIRT 1, GRIDLOCK 1, FORK_LIMIT 1 | DOCKING 6, LOW_BATTERY 6, FORK_LIMIT 5, SAFETY_ESTOP 4, POCKET 3, WMS 3, OBSTACLE 1, LIDAR_DIRT 1, GRIDLOCK 1, LOCALIZATION 1, CHARGER_CONTACT 1 | DOCKING 28, LIDAR_DIRT 6, LOCALIZATION 5, POCKET 4, OBSTACLE 4, LIFT_MOTOR 3, LOW_BATTERY 3, WMS 2, FORK_LIMIT 2, SAFETY_ESTOP 1, IO_DEVICE 1 |
| How incidents were cleared (recovery_type) | operator 46, auto 11, remote 5, technician 1 | operator 16, technician 6, remote 6, auto 4 | auto 21, operator 21, remote 11, technician 6 |
| Role in the story | The 24-hour pilot site (battery swap). It is one of the three pilot sites in the doc (S08, S21, S22; 8 + 5 + 6 = 19 robots). | The 16-hour contrast (charging is not the problem here). | Glare doors and dust (docking, lidar, vision, level 1 and 2 fixes). |

Per recovery type, downtime minutes when drawn for the sim (from tab `incidents`, all sites): **auto** median 4.0 (log-sigma 0.46); **operator** median 21.2 (0.38); **remote** median 41.9 (0.39); **technician** median 314.3 (0.38). Use a log-normal with those parameters. (Overall median incident 20.6 min.)
Charge session: average 100.6 minutes. Sessions by trigger over the fleet: scheduled 10,517; opportunistic 5,064; low_battery_emergency 267.

### 5.9 Per-site table (all 30 sites; for the fleet overview 4.10)
**Generate this from the workbook with a script; do not type it by hand.** Columns: `site_id`, `site_name`, `shift_pattern`, `robots_deployed` (tab `sites`); `chargingShare` and `movingShare` = sum of `charging_hours` (or `moving_hours`) ÷ sum of `scheduled_hours` per site (tab `robot_daily_utilization`); `incidents` = count per site (tab `incidents`); `lowBatteryStops` = count of `ERR_BATTERY_LOW_CRITICAL` per site; `lowBatteryPerRobot` = stops ÷ robots. Reference rows to test against: S08 24x7, 8 robots, charging 23.5%, 63 incidents, 37 stops (4.62 per robot); S21 24x7, 5 robots, charging 23.2%, moving 44.5%, 103 incidents, 7 stops (1.40); S22 24x7, 6 robots, charging 21.7%, 95 incidents, 33 stops (5.50); S12 16x7, 17 robots, charging 11.8%, 32 incidents, 6 stops (0.35); S20 16x6, 16 robots, charging 11.6%, 59 incidents, 3 stops (0.19). Note for the reader (show on the overview): low-battery stops are **not uniform across the 24x7 sites** (from 0.75 to 5.50 per robot); the pilot is chosen where they are highest.

### 5.8 Assumed values (always tagged "assumed" on screen)
| key | default | range in the game | where it comes from |
|---|---|---|---|
| robot run time on a full battery | 8 h | fixed | spec note in `Assumptions` tab says run time 7-9 h is an assumption |
| usable battery before charging | down to 25% | fixed | assumption |
| charge time | 100 min | fixed | measured average session, Analysis 4 |
| swap time (person swaps pack) | 5 min | 3 to 15 | Analysis assumption cell |
| target swap time | 10 min | | the doc's target |
| spare packs per robot | 0.3 | 0 to 0.6 | the doc's assumption (about 22 packs for 74 robots, about 6 for the 19-robot pilot) |
| operators at the swap bay | 1 | 1 to 2 | assumption |
| chance the recovery agent can propose a fix for a level-1 incident that today needs an operator or remote person | 50% | 20 to 80 | assumption |
| gate pass rate for those proposals | 85% | 60 to 95 | assumption |
| time when a person must approve a failed proposal | 3 min wait plus 1 click | fixed | assumption |
| engineering-hour saving from triage on no-fault-found tickets | 40% of the 158 h | 0 to 60 | assumption |
| pallet moves per moving hour | 2.24 | fixed | derived: 3,868 moves lost ÷ 1,729 downtime hours (Analysis 1); the rate itself is assumed |
| VLM advisory confidence threshold | 0.70 | fixed | assumption; below it a person decides (used in 9.3) |
| scripted example values (VLM confidences such as 0.78, line counts, "12 scripted incidents", the 46% to 60% confirmed-cause climb) | as written in section 9 | fixed | scripted; tag "scripted example" wherever shown |
| work waiting beyond today's volume (headroom) | 25% of today's pallet moves | 0 to 100% | assumption; this is the case's own caveat: freed robot time turns into pallets only if work is waiting (see 8.1b) |
| "Explore mode" incident speed-up | one auto-generated stop every 20 to 40 s of screen time, at 1x | | demo only; the page says "demo speed" |

---

## 6. The pipeline flowchart (the heart of the page)

Used by the Recover button (4.3), by every scenario (9), and by the voice scene (11). It is one reusable component: `Pipeline.run(steps)` draws the boxes in a vertical or horizontal chain, highlights one box at a time, and shows the **input and output of that box** in a small text area below it.

### 6.1 Boxes (from the case's fix flow; tab `ai_flow_steps`)
1. **Fault diagnosis** — input: incident, fleet events, evidence. Output: a structured fault record with the evidence.
2. **Model proposes** (LLM, with VLM label as one input) — input: fault record plus the list of allowed actions. Output: a proposed action or a typed edit. Check: output schema.
3. **Deterministic check** (the evaluator) — Gate 1 at runtime for actions; Gate 1 and Gate 2 offline for changes. Output: PASS or FAIL with the rule that failed.
4. **Robot executes** (ROS 2 action / behaviour-tree node) — the safety layer stays outside the envelope. Output: result logged.
5. **Person fixes it** — only when the check fails or a value sits at its limit. Input: the failed proposal, the evidence and a ready alternative. Output: one-click approval, or a manual fix with a label.
6. **Log back** — the outcome goes to recovery attempts, change requests and eval results, and the label feeds the evaluation set.

Branching rules the animation must follow exactly:
- Check PASS → box 4 → box 6.
- Check FAIL → box 5 (person) → if approved, box 4 → box 6; if rejected, box 6 with "blocked".
- Model produces nothing valid (schema check fails) → "Reject proposal" → box 5.

### 6.2 Gate details to show (tab `eval_results`)
- **Gate 1 (runtime, and first gate for offline changes):** `allowlist_scope_check`, `typed_edit_schema`, `parameter_range_bounds`, `safety_layer_untouched`.
- **Gate 2 (offline only):** `replay_regression` (pass-rate change, threshold -0.5 points), `boundary_diff` (out-of-envelope differences, threshold 0), `sim_scenario_suite` (pass %, threshold 98), `latency_budget_check` (p95 loop ms, threshold 50).
- For runtime recovery actions show these runtime checks: action is on the whitelist, speed at most 0.3 m/s, collision check clear, safety layer untouched.

### 6.3 Explanatory text for the clickable overview diagrams (4.4)
Each box has a 2 to 3 sentence plain description (what goes in, what comes out, who is responsible). Use the wording above in 6.1. The fix-flow diagram also shows the three levels:
- Level 1: choose and sequence actions from a whitelist at runtime.
- Level 2: edit a behaviour tree or a parameter offline, after repeat incidents.
- Level 3: draft a change to a C++ or Python ROS 2 node, offline in simulation, a person must approve. Never on a moving vehicle.

---

## 7. Warehouse maps (`warehouses.js`)

Each warehouse is a data object the canvas draws. Define:
- `scale`: aisle widths drawn **proportional to the real minimum aisle width** (A 2.4 m narrow, B 3.5 m wide, C 2.9 m medium) so the reader can see why A has more path conflicts.
- Racks as filled light-grey rectangles, aisles as white lanes between them, a thin black outline around the building.
- **Stations**, numbered "Bay 1…" with a letter code: D = dock door, F = floor staging, C = conveyor, R = rack face.
  - **A (S08, 11 stations):** Bay 1–2 dock doors, Bay 3–6 floor staging, Bay 7–10 conveyors, Bay 11 rack. (So "Bay 4" and "Bay 6" are both floor-staging bays. The reroute instruction in 9.5 uses these.)
  - **B (S12, 17):** Bay 1–4 dock doors, Bay 5–11 floor staging, Bay 12–13 conveyors, Bay 14–17 rack faces.
  - **C (S20, 17):** Bay 1–4 dock doors (**4 glare-exposed**: draw a sun band across them in the afternoon), Bay 5–6 floor staging, Bay 7–10 conveyors, Bay 11–17 rack faces.
- **Chargers:** a charger zone near one wall. The number of chargers is **not in the data** (there is no chargers tab): draw 1 charger per 3 robots (A 3, B 6, C 6) and tag it "assumed; there is no charger inventory in the data".
- **Swap bay:** drawn only when the battery-swap policy is on (always drawn on A in Guided mode). Contains: the operator figure (a simple circle labelled "Operator"), a rack of spare packs showing "charged / charging" counts.
- **Paths:** each aisle is a polyline graph. Robots follow shortest paths between stations. Two robots may not occupy the same aisle cell head-on; at an intersection one waits (this is the source of "traffic waiting"). Gridlock can occur on A's narrow aisles (code `ERR_INTERSECTION_GRIDLOCK_TIMEOUT`).
- **Maintenance bay:** a small zone used by the dirty-lidar scenario (9.3).
- Robot count and labels: "Bot 1…n" per site (site-local labels; do not claim these map to real robot ids).

---

## 7A. Assets to build (all drawn in code in `draw.js`; no image downloads)

Every visual is drawn with canvas 2D or inline SVG using plain shapes. All assets are **schematic**: they do not claim to show the real MAG1400 dimensions. Draw in a fixed **base unit** (1 unit = 1 px at zoom 1; maps scale by a zoom factor) so every asset scales cleanly. Line width 1 px black unless stated. Fill white unless stated. Use the palette in section 3 only. Each draw function has the signature `drawX(ctx, x, y, angleRad, state, opts)` and must not use `Math.random()` (use the seeded PRNG for any jitter). Layer order on the map, bottom to top: floor, racks, stations, paths (hidden unless a route is being shown), pallets and objects, robots, overlays (safety field, glare band, route lines), labels, selection ring.

### A1. Robot (top-down, drawn pointing right at angle 0)
- Body: rounded rectangle 30 × 20, corner radius 3, white fill, 1.5 px black outline.
- Forks: two rectangles 16 × 3 at the front, 11 px apart, starting at the body's front edge (extend the robot to 46 px long with forks).
- Front sensor: a black half-disc, radius 4, centred on the front edge of the body (the lidar), plus a small black square 3 × 3 above it (the camera).
- Direction mark: a small black triangle 6 wide on the top face, pointing forward.
- Label: "Bot n" above the robot, 12 px, never rotated with the robot (always upright).
- Battery bar below the robot, upright: outline 26 × 5; fill proportional to charge in black; below 25% the outline becomes 2 px and the fill is hatched. A tiny tab 2 × 3 on the right end.
- **States (all must exist and be visible in the assets gallery):**
  - `moving`: as above.
  - `idle`: outline and fork grey `#9E9E9E`, label grey.
  - `toCharge` / `toSwapBay`: as moving, with a small "C" or "S" letter chip (12 px) above the label.
  - `queue`: outline dashed.
  - `charging`: outline black, a zig-zag line (a lightning-style polyline, no emoji) drawn on the body; the battery bar fill animates left to right.
  - `swapping`: body white with a 10 × 5 pack rectangle drawn half out of the rear of the robot.
  - `stopped`: **red** `#C62828` 3 px outline, a red X across the body (two lines corner to corner), slow blink (alpha 1.0 to 0.55 at 1 Hz; constant 1.0 if reduced motion).
  - `recovering`: amber `#B26A00` 2 px outline, a small circular arrow chip.
  - `waitingForPerson`: amber outline, a small person glyph chip (circle head, short body line).
  - `recovered` (for 2 seconds after a fix): **green** `#2E7D32` 2 px outline and a check mark (a two-segment polyline) beside it.
  - `carrying`: a pallet (A2) drawn between the forks, centred, 18 × 14.
  - `selected`: a dashed black 1 px rectangle 6 px outside the robot, label in bold.
- Hit area for clicking: a circle of radius 28 px around the robot centre (generous for a laptop pointer).

### A2. Pallet and loads (top-down)
- Pallet: rectangle 20 × 16, light grey fill `#EEEEEE`, 1 px outline, three parallel lines inside (slats, 4 px apart). Two small notches (3 × 3 white squares) on the long edge at the front (the pockets).
- Load on a pallet: a white box 16 × 12 with a diagonal cross (a package) drawn over the pallet.
- Variants (used by the camera scenes and the map): `good`, `skewed` (rotated 15°), `damaged` (one corner missing: a triangle cut out, and one slat shifted 2 px), `wrapped` (diagonal hatch overlay across the pocket notches), `spilled` (four loose slat rectangles at random angles using the seeded PRNG, scattered in a 40 × 30 area, no pallet outline).

### A3. Things in the aisle
- **Cardboard box:** square 10 × 10, 1 px outline, white fill, a vertical tape line down the middle; `fallen` variant rotated 35° and drawn with a short grey shadow rectangle behind it.
- **Soft curtain:** a row of 8 thin vertical rectangles (2 × 24, light grey) with 2 px gaps, hanging across an aisle opening.
- **Person:** circle head (radius 3) over a short vertical line with two arms and two legs (stick figure), 14 px tall, black.
- **Forklift (a manually driven one):** rectangle 24 × 14, two fork lines 12 px, a small circle seat; used only in the safety-stop scene (A9).

### A4. Building
- Floor: white. Walls: 3 px black outline around the building. Aisle centrelines are not drawn (hidden), aisle edges are the rack edges.
- **Rack:** light grey `#EEEEEE` rectangle with 1 px outline, divided by thin lines every 12 px (shelf bays). A label "Bay n" for rack faces.
- **Dock door:** a 28 px gap in the wall with a small sliding-door symbol (two short horizontal lines with an arrow). Label "Bay n".
- **Glare band** (Warehouse C only, 14:00 to 17:00 simulated time): a diagonal light-grey hatch band 22 px wide across each glare-exposed dock door, extending 40 px into the floor. A small sun symbol (circle radius 5 with 8 short rays) at the wall beside each. Glare is drawn only for the four glare-exposed bays.
- **Conveyor:** rectangle 36 × 14 with 6 short parallel lines (rollers) and an arrow showing direction.
- **Floor staging area:** dashed 1 px rectangle 30 × 24, label "Bay n".
- **Charger:** rectangle 12 × 12 with a plug symbol (a short zig-zag); when occupied the robot is drawn on top of it. A "Charger zone" caption. Tag it "assumed count" (the data has no charger inventory).
- **Maintenance bay:** dashed rectangle 40 × 28, caption "Service bay".
- **Swap bay (A):** rectangle 54 × 36 containing: the operator figure (A3 person), a pack rack of N slots, and a small lift-aid arm (a line with a pivot circle). Caption "Swap bay".
- **Battery pack:** rectangle 12 × 6 with two 2 × 2 terminal nubs at one end. **Pack-rack slots** are 14 × 8 outlines: `charged` = solid dark fill, `charging` = hatched with a small progress bar, `empty` = outline only.

### A5. Overlays
- **Route line:** dashed black 1.5 px polyline with an arrow head, for reroutes and alternate routes (6 px dash, 4 px gap).
- **Safety field (e-stop scene):** a semicircle dashed red polygon in front of the stopped robot, radius 36, with a person or forklift inside.
- **Bounding box (camera view):** a thin red 1.5 px rectangle with a label tab "label · confidence" in 12 px.
- **Selection ring** and **hover tooltip:** a white box with a 1 px border, 12 px text: robot name, state, battery.

### A6. Camera view scenes (canvas 320 × 200, drawn from the robot's front camera)
Common base: a light-grey floor trapezoid, a horizon line, and a pallet (A2, drawn larger, about 120 × 90) centred in the lower half. Frame border 1 px; a small caption "front camera" at top-left; a time stamp at top-right. Scenes:
1. `fallen_box`: a box (A3, scaled 2.5×) lying on the floor to the left of the pallet, partly in the lane.
2. `spilled_pallet`: A2 `spilled` scaled 2.5×, spread across the lane; no intact pallet.
3. `soft_curtain`: A3 curtain scaled 3× in front of the pallet, strips slightly translucent (alpha 0.6).
4. `glare`: a bright diagonal band (white with a thin light-grey outline) crossing the pallet pockets, with a washed-out region (lower alpha on the pallet there).
5. `dirty_lens`: smudge blobs (three overlapping irregular ellipses in grey at alpha 0.5) in the lower-left corner and across the lower edge, and a few dots.
6. `wrapped_pocket`: pallet with the `wrapped` hatch over the pockets.
7. `skewed_pallet`: pallet rotated 15°.
8. `damaged_pallet`: pallet `damaged` variant.
- Overlay on every scene: the VLM bounding box and label from section 9 (U1 to U3, U10), drawn after the scene.
- **Blur demo (9.10):** a stick figure with a face area; after "blur" the head circle is replaced by a grey filled circle with a diagonal hatch, plus a caption "faces and badges blurred before storage".

### A7. Pipeline flowchart components (SVG or canvas)
- **Box:** rectangle 190 × 70, 1 px black outline, 4 px radius, title bold 14 px, one line of subtitle 12 px, a small status chip at the bottom-right. Active box gets a 3 px outline; completed boxes get a thin check mark; failed boxes get "FAIL" in red and a red outline; the waiting-for-person box gets an amber outline.
- **Status chips:** `PASS` green text on white with a green 1 px outline; `FAIL` red; `WAITING` amber; `INFO` grey. Always include the word, never colour alone.
- **Arrows:** 1.5 px black lines with a 6 px triangular head; branch labels ("pass", "fail", "approve", "reject") 12 px on the line.
- **Person icon:** the A3 person figure, 18 px, at the top-left of the "Person fixes it" box.
- **Input / output panels:** a plain rectangle under the active box with two labelled sections "In" and "Out" in monospace 12 px, text wrapping, max height 120 px with scroll.
- **Gate list** (for U4): a table with columns check, result chip, measured value, threshold.
- **Timing:** each box highlights for 700 ms at 1x; Pause freezes; a "Step" button advances one box when paused. Reduced motion: no tweening, the highlight still moves.

### A8. Charts and meters (no chart library; draw with SVG or divs)
- **Time-share bar:** one horizontal stacked bar 100% wide: moving = solid black, charging = diagonal hatch, idle = light grey `#EEEEEE`, stopped = red cross-hatch. A legend row below with the same four patterns. Values printed inside or after each segment (12 px).
- **Comparison bars (Today vs Your policy):** two thin horizontal bars per metric, one black outline unfilled and one solid black, with the numbers at the right end and the difference in bold.
- **Gantt bars (U6):** one row per robot, bars as plain rectangles with the mission label inside; a vertical dashed line for the deadline; amber bar when close to a limit.
- **Mini meters:** 100 × 8 outline with proportional fill.
- **Sortable table:** header cells show a small triangle (CSS border triangle) for the sort direction; the sorted column is bold.

### A9. Safety-stop scene
The robot at `stopped` with the A5 safety field in front of it and a person (or forklift) inside the field; a caption "Person in the safety field. Only a person at the robot can reset this."

### A10. Phone mock (voice scene)
- Outer rounded rectangle 320 × 560, radius 28, 2 px black outline; a notch (a short thick line) at the top; a title bar "Fleet assistant" 14 px bold.
- Chat bubbles: user messages right-aligned, white with 1 px outline; replies left-aligned light grey; small "speech to text" or "scripted" captions in 12 px under each bubble.
- **Tap to speak:** a circle 64 px, 2 px outline, a microphone glyph drawn from shapes (a rounded rectangle, a U shape and a short stand line). While "listening" (a scripted 1.2 s), five vertical bars (4 px wide, varying fixed heights) pulse; with reduced motion they stay static.
- **Preset phrase chips:** pills 36 px tall with the phrase text, 1 px outline.
- **Confirm card:** a white card with the text and two buttons **Yes** and **No**.

### A11. UI components (CSS, no framework)
- Buttons: white fill, 1 px black border, 4 px radius, 14 px bold; hover = black fill and white text; disabled = grey text and grey border; focus ring = 2 px black outline with 2 px offset.
- Primary action (Recover, Run a week): same as a button but 2 px border.
- Switch (policy toggles): a 36 × 20 outlined pill with a 14 px knob; on = filled black with white knob; label to the right; also announces "on/off" via `aria-pressed`.
- Sliders: native `<input type="range">` with `accent-color: #000`; each shows its current value, unit, default, and the "assumed" tag.
- Tag "assumed" / "scripted example" / "simulated": 12 px, uppercase not required, 1 px outline, 2 px radius, 2 × 6 px padding, placed right after the value or the panel title.
- Tabs (months, scenarios): a row of buttons, the active one has a 3 px bottom border.
- Banner (section 2.1): a 1 px bordered bar under the top bar, 14 px text, always visible.
- Toast / log lines: plain text rows with a time stamp in monospace.

### A12. Favicon and legend
- `assets/img/favicon.svg`: a 32 × 32 view box with the A1 robot outline drawn in black on white (also referenced as an inline data URI is not needed; just the file).
- **Legend panel** (a "Legend" button in the top bar): shows every robot state from A1 with its name, the symbols for dock door, rack, conveyor, floor staging, charger, swap bay, service bay, the glare band, the safety field, and the three status chips. Built from the same draw functions.

### A13. Assets gallery (for review and tests)
`index.html#assets` renders one sheet that draws **every asset in every state** from A1 to A12 on a white page with a label under each. It uses only the functions in `draw.js`. It is how the author checks that nothing is missing, and the acceptance tests screenshot it (section 16, test 18).

### A14. Motion and timing constants (put in one `CONFIG` object at the top of `draw.js` or `ui.js`)
- Robot travel on screen: 40 px per second at 1x (4x and 16x scale it); turn at corners over 200 ms.
- Stopped-robot blink: 1 Hz. Recovered tick: 2 s. Camera view: no animation except the VLM box appearing after 400 ms.
- Pipeline box highlight: 700 ms; typewriter reveal of the "Out" text at 40 characters per second (instant with reduced motion).
- Swap animation at 1x: robot arrives, 1.5 s pack out, 1.5 s pack in (scaled to the swap-time slider), robot leaves.
- The map redraw runs with `requestAnimationFrame`, capped at 30 frames per second; pause when the tab is hidden.

---

## 8. Simulation engine (`sim.js`)

One engine drives Explore mode (with demo-speed incidents) and Game mode (with calibrated incidents). It must be **deterministic given a seed** (use a seeded PRNG such as mulberry32; no `Math.random()` anywhere in the engine).

### 8.1 Robot state machine
States: `moving` (carrying out a mission), `idle` (waiting for a task), `toCharge`, `queueCharge`, `charging`, `toSwapBay`, `queueSwap`, `swapping`, `stopped` (an incident is open), `recovering`.
- Battery: 100% full. While `moving`, drains at 100% / (8 h) i.e. 0.208% per minute. While `idle`, drains at 40% of that (assumed). At 25% the robot requests a charge (or a swap if the swap policy is on and a charged pack is available).
- **Today (charger):** robot drives to a free charger, charges **100 min** to 100%, queues if all chargers are busy (this reproduces the "charger wait" minutes in 5.4, which are small).
- **Emergency low battery (hard stop `ERR_BATTERY_LOW_CRITICAL`):** at each charge request, the robot runs flat before arriving with probability `pFlat` = (site's low-battery stops) ÷ (site's charge sessions): **A 37/659 = 5.6%**, **B 6/1,020 = 0.6%**, **C 3/832 = 0.4%**. A flat robot is `stopped`; it is cleared by an operator walk-up (downtime drawn from the operator distribution, 5.7) and then charges.
- **Battery swap policy (person in the loop):** at 25% the robot drives to the swap bay and takes a charged spare pack if one is waiting. The operator swaps it in `swapTime` minutes (default 5; one operator per bay unless set to 2; robots queue). The removed pack goes on the rack and takes **100 min** to recharge, then becomes a spare again. **If no charged spare is waiting, the robot falls back to the charger exactly as today, including `pFlat`.** (This is what makes the number of spare packs matter. The flat-battery stop is never removed by assumption; it can only be avoided by having a pack ready.)
- Robots do missions at a rate that makes the baseline `moving` share match the site's measured share (tune `missionDuty` per site until the baseline matches 5.7 within ±3 percentage points).

### 8.1b Demand: freed time only becomes pallets if work is waiting
The case's own counter-pattern (Planted pattern 3) says the charging gap binds only where demand is about equal to capacity. So the sim must **not** assume every freed hour becomes moves.
- Work arrives as pallet moves. Today's volume for a run = the baseline moving robot-hours × 2.24 (5.8). Under any policy, robots may complete at most **today's volume × (1 + headroom)** moves, where headroom is the slider in 5.8 (default 25%, assumed). When no work is waiting, a robot is `idle`, not `moving`.
- The scoreboard therefore shows **two lines**: "Robot time returned (hours)" (independent of demand: hours no longer spent charging, waiting or stopped) and "Extra pallet moves" (limited by headroom). If the second is capped, show a plain note: "Work ran out: freed time became idle time, not pallets."
- With headroom 0%, no policy may increase pallet moves; the page must show this honestly (a reader who sets it to 0 should see time returned but no extra moves).
- Warehouse B is expected to show little extra moves under any policy because it already has 32.6% idle time (5.7).

### 8.1c Shift hours and time of day
Each simulated day follows the site's shift: **24x7** runs 24 h a day for 7 days; **16x7** runs 06:00 to 22:00 for 7 days; **16x6** runs 06:00 to 22:00 for 6 days and is off on the seventh. Outside shift hours robots are parked and do not count in scheduled hours. Simulated clock time matters for the glare pattern at C (14:00 to 17:00) and is shown on the map.

### 8.1d Movement and traffic
Robots move on a waypoint graph built from the aisles (A* shortest path). Each aisle segment allows one robot per direction at a time (edge reservation); two robots needing the same segment head-on queue, and the later one waits. A robot waiting longer than 60 simulated seconds raises `ERR_PATH_PLANNING_DEADLOCK` (soft stop); a cycle of waiting robots at an intersection raises `ERR_INTERSECTION_GRIDLOCK_TIMEOUT`. These two codes are generated **by this mechanism in Explore mode** and **by the Poisson rates in Game mode** (so Game stays calibrated). Aisle width does not change the physics; it only changes the drawing (7) and, in A, the probability weights of these two codes (A has the narrowest aisles, 2.4 m): multiply their rates by 1.0 at A and keep them as measured everywhere else; do not invent other effects.

### 8.1e Known simplifications (shown in a "Limits of this simulation" box on the Game results screen)
The sim does **not** model: ageing packs (the 57 weak packs and their 2.70 vs 0.59 stops per robot are shown as data, not simulated), the real number of chargers (assumed 1 per 3 robots), mission-level demand by hour, network faults, traffic with people and forklifts (except the e-stop scene), or technician travel. These are stated on screen so the result is read as direction only.

### 8.2 Incidents
- **Game mode (calibrated):** for each code in the site's table in 5.7 (except `ERR_BATTERY_LOW_CRITICAL`, which comes from 8.1), incidents arrive as a Poisson process at rate = (site's count for that code) ÷ (site's scheduled robot-hours), applied per scheduled robot-hour. The station used for docking/pocket codes is chosen at random; at C, docking incidents are 3× more likely at glare-exposed bays between 14:00 and 17:00 simulated local time (**the planted afternoon pattern: glare-site timestamps cluster 14:00 to 17:00**), with the total count preserved.
- **Explore mode (demo speed):** same codes and mix as the site, but at a boosted rate (one stop every 20 to 40 screen seconds at 1x), plus the scenario buttons (9) that inject a specific incident on a specific robot.
- Each incident has: code, severity (from `error_codes`), station, a camera scene (9.2), a VLM label with confidence, and a "how it would be cleared today" recovery type drawn from that site's mix in 5.7, with downtime from the log-normal in 5.7.

### 8.3 Recovery policies (for Game mode and the Recover button)
- **Today:** the incident is cleared by its recovery type (auto, remote, operator, technician), taking the drawn downtime. Operator clearances count as an "operator walk-up".
- **Recovery agent policy:** applies only to **level 1** codes (5.2/5.3) whose drawn recovery type is `operator` or `remote`. With probability `agentCan` (default 50%) the model proposes a fix; with probability `gatePass` (default 85%) it passes the check and executes: downtime = **4 min** (the auto median). If it fails the check (15%): a person approves with one click after **3 min**, then it executes: downtime = 4 + 3 = **7 min**, counted as one human click. If the model cannot propose (50%): as today.
  - Level 2 codes, hardware, safety and everything else: **unchanged by this policy**. Level 2 appears only in the scenarios (9.4).
  - `ERR_SAFETY_LIDAR_ESTOP` is **never** touched by any policy (the safety layer is outside the envelope).
- **Triage policy:** does not change robot time at all. It changes only the "engineering hours on no-fault-found tickets" line in the scoreboard (reduced by the assumed 40%) and the "incidents with a confirmed cause" counter (rises over the simulated week as engineers confirm causes in one click). It must be shown as **a different kind of benefit**, not as robot hours.
- **Voice policy:** does not change the engine; it changes only the **operator walk-up counter** presentation: a supervisor can trigger a Recover from a phone instead of walking to a screen (section 11). Show it as "walk-ups avoided" only for incidents the recovery agent handled. Do not invent a time saving for it.

### 8.4 Metrics the engine must return (per run and per day)
robotHoursReturned (hours no longer spent charging, waiting or stopped, versus the Today run on the same seed), extraPalletMoves (capped by headroom, 8.1b), palletMoves (= moving robot-hours × 2.24, capped at today's volume × (1 + headroom)), shareMoving, shareCharging, shareIdle, shareStopped, emergencyLowBatteryStops, incidents by code, downtimeHours, operatorWalkUps, humanClicks, swapsDone, swapWaitMinutesTotal, flatBatteryEventsAvoided (swaps that took place when a flat stop would otherwise have been possible; computed as swaps × `pFlat`), packsInUse, noFaultFoundEngineeringHours (if triage on), confirmedCausePercent.

### 8.5 Calibration check (build must include `selfTest()` in the console; also run it in the acceptance tests)
Baseline (Today policy), averaged over 20 seeds of a **30-day** run:
- shareMoving and shareCharging within **±3 percentage points** of 5.7 for each warehouse.
- Emergency low-battery stops within **±25%** of 37 (A), 6 (B, small count: allow ±3), 3 (C, allow ±3).
- Total incidents within **±20%** of 63 / 32 / 59.
If a number is outside, adjust `missionDuty` and the charge trigger only; do not edit the data.

---

## 9. Use cases (`scenarios.js`) — scripted, each runs in the Scenario player and through the Pipeline

### 9.0 Scenario player (shared behaviour)
Each scenario has: a title, one sentence of "what this shows", a **map action** (what the floor does), a **Pipeline step list** with scripted input/output text, a **result box** (time to clear versus the "today" path, human clicks, outcome), and a **Variant** toggle ("Make the check fail" or equivalent) where stated. A **Replay** button restarts. A **Next scenario** button moves along. Every pipeline box shows its input and output text; the model boxes carry the tag *scripted example*.
In the result box, show only these numbers: the "today" downtime (median for the recovery type, 5.7) and the scenario's downtime (as specified below). Mark the comparison "illustrative".

### 9.1 U1: Docking timeout at a glare door (level 1)
- Where: Warehouse C, Bot 7, Bay 2 (glare-exposed dock door), 15:42 local time.
- Fault record: `ERR_DOCKING_ALIGNMENT_TIMEOUT`, soft stop, station flag glare = Y, camera front_depth, last two recovery attempts failed (`retry_with_adjusted_pose`, `restart_nav_stack`).
- VLM (scripted example): label `glare`, confidence 0.78. Note shown: "advisory: it has confused glare with a dirty sensor 39% of the time".
- Model proposes: `clear_costmap`, `backup(1.5 m)`, `rotate(15°)`, `retry_dock`.
- Check (runtime): actions on whitelist PASS; speed ≤ 0.3 m/s PASS; collision check clear PASS; safety layer untouched PASS → **PASS**.
- Robot: backs up, turns, docks. Result: cleared in 4 min (agent path) vs 21.2 min (operator median).
- **Variant "make the check fail":** the proposal contains `backup(1.5 m) at 0.6 m/s`. Check FAIL on speed (0.6 m/s is above 0.3 m/s). Fallback to the standard recovery (restart nav stack); if it fails, a help call goes to the operator. Result: 7 min with one person click if the person approves the corrected proposal (0.3 m/s) shown on one screen; or 21.2 min if the operator is called.

### 9.2 U2: Something in front of the robot (VLM names it)
- Where: Warehouse A, Bot 3, aisle between Bay 4 and Bay 7. Code `ERR_OBSTACLE_PERSISTENT_BLOCK`, soft stop.
- The camera view has three **selectable variants** (the reader picks one with three buttons before pressing Recover):
  1. **Fallen cardboard box** (small, lane partly clear): VLM scripted label `unmapped_obstacle`, confidence 0.88, plus the note "small object, lane partly clear". Action: *replan around it* using an alternate route (draw the alternate route on the map as a dashed black line). Check: alternate route clearance ≥ aisle minimum (2.4 m for A) PASS → robot drives around. A person is told to pick the box up later (log line).
  2. **Spilled pallet** (aisle fully blocked): label `damaged_pallet`, confidence 0.81, note "blocks the full aisle width". Action: *hold and call a person*; other robots are rerouted around the aisle (draw their routes). Check PASS for the reroute of the others; the stopped robot waits (amber). A person clears it (operator walk-up counted).
  3. **Soft curtain** (a hanging plastic strip): label `soft_curtain`, confidence 0.74. Action: *wait briefly, then replan* (the curtain is a known cause of false blocks; the wait length is a scripted example, show "scripted"); PASS; robot proceeds.
- The model never overrides the safety layer. The page states this under the camera view.

### 9.3 U3: Dirty lidar window (human in the loop is needed)
- Where: Warehouse C, Bot 11, `ERR_LIDAR_DIRT_OBSCURATION`, hard stop (not auto-recoverable).
- VLM (scripted example): label `dirty_sensor`, confidence **0.62** (below the 0.70 advisory threshold). Display: "Low confidence: glare and a dirty sensor look alike to this model. A person decides."
- Person confirms "dirty" with one click (counts as one human click, and the label is stored for the evaluation set).
- Model proposes: `navigate_to_service_bay`, `request_operator_wipe_lens`, `resume_mission`. Check PASS (navigation at ≤ 0.3 m/s on a cleared path). Robot drives to the maintenance bay; an operator figure wipes the lens (animation, a few seconds); the robot resumes.
- Ticket text (scripted) is created for the maintenance team with the evidence and the cause. Result: shows that the model sequences the work; a person still does the physical task. (Downtime for this code is 216.9 h over 129 incidents in the fleet, Analysis 2.)

### 9.4 U4: Offline change to a parameter or tree (level 2) — three variants
Shown as a **vertical Pipeline with Gate 1 and Gate 2 results listed row by row** (names and thresholds from 6.2). Variants selected by three buttons:
1. **Passing change (glare doors).** Trigger pattern: "Docking timeouts at glare-exposed dock doors" (170 incidents in the pattern). Proposed typed edit: `docking_pose_estimator.exposure_compensation`, 6 lines. Gate 1: allowlist PASS, schema PASS, range PASS, safety untouched PASS. Gate 2: replay regression +0.26 pts PASS (threshold -0.5), boundary diff 0 PASS, scenario suite 99.3% PASS (threshold 98), p95 loop 36.9 ms PASS (threshold 50). Canary at site S16 → released. Post-release incidents -31% (scripted result; tag it "scripted scenario, not measured").
2. **Blocked at Gate 1: charge threshold.** Trigger: emergency low-battery stops at undercharged sites (44 incidents in the pattern). Proposed edit: `charge_trigger_soc_threshold`, 9 lines. Gate 1 allowlist FAIL: "edit reaches min_soc_safety_floor (outside allowlist)". Nothing deploys. A person sees one screen: what failed, why, and an alternative that stays inside the limits (raise the trigger instead of lowering the floor). The point to make visible on screen: *software cannot remove the charging loss; it is a rest-deficit problem, which is why battery swapping is the recommendation.*
3. **Blocked at Gate 2: node code.** Trigger: "Docking timeouts on firmware v3.6.0 pose estimator" (236 incidents). Edit: `pallet_pose_estimator`, 142 lines (level 3, node code). Gate 1 PASS. Gate 2: replay regression -0.03 PASS, **boundary diff FAIL (1 out-of-envelope diff: touched lift speed limit constant)**, scenario suite 98.6% PASS, latency 23.9 ms PASS. Human review required → rejected → blocked.
- A fourth small panel under the variants: **"Rolled back" example** (CHG-008): intersection hold timeout edit passed both gates, released to canary at S18, incidents rose 6% → rolled back. Shows that the canary exists for a reason. Tag "scripted scenario".

### 9.5 U5: Typed fleet instruction ("reroute bot 5 to bay 4 and move everything to bay 6")
- Where: Warehouse A (bays as defined in 7). A text box accepts the instruction; it is pre-filled and the reader may also click three example chips (one valid, one invalid bay, one clashing route).
- Model (scripted example) turns the sentence into typed commands: `{"robot":"Bot 5","action":"reroute","to":"Bay 4"}` and `{"action":"redirect_all","from":"current drop-offs","to":"Bay 6"}`.
- Deterministic check: Bay 4 exists and is open PASS; Bay 6 exists and is open PASS; no other robot's route clashes head-on PASS.
- Map: Bot 5 turns to Bay 4; all robots' current drop-offs change to Bay 6 (show updated route lines).
- **Variants (chips):** "reroute bot 5 to bay 14" → FAIL (Bay 14 does not exist at this site; A has 11 bays): the person sees "Bay 14 does not exist. Nearest open bays: 3, 4, 5, 6" and one click picks one. "Move everything to bay 1" (a dock door that is closed) → FAIL (not open).
- Result: no robot time number; show "instruction applied in one step; checks run before the robots move".

### 9.6 U6: Agentic task planning (business goal to missions)
- Goal text (illustrative): "Move 120 inbound pallets from Dock 2 to racks A and B before the 6 pm truck." (Warehouse B, which has 17 robots and 4 rack faces.)
- Model (scripted example) splits it: two batches of 60 pallets (rack A, rack B), heaviest first, assigns robots, schedules charging windows (Bot 12 and Bot 14 are charging; Bot 7 is low and gets a charge before its run), and orders the missions with start times.
- Deterministic check (hard limits only): each mission has a robot with enough battery; no load above 1,400 kg; no mission through a closed zone or one with people working; no two robots in the same aisle at once; the plan finishes before the deadline → PASS draws the plan on a small timeline (Gantt-style plain bars) and starts it on the map.
- **Variant "tight plan"**: the plan finishes with 5 minutes to spare and uses a robot below the battery threshold → check says "close to a limit" → amber → a person sees one screen (what is close, why, a revised plan with an extra charge slot) → one click approves or edit.
- After the run: "planned vs actual" bars are stored (scripted values); the page says these limits can be tuned.
- Footnote on screen: *No order or warehouse-system data exists in the dummy set, so this job comes last and is the least certain.*

### 9.7 U7: Root-cause triage across the fleet (offline, reads only)
- A table of 12 scripted incidents (mixed codes across warehouses) arrives in a list marked "no confirmed cause" (the real share is 54%, Analysis 1).
- The model (scripted example) returns for each: a likely cause, the evidence it used (e.g. "glare flag on bay, time 15:40, 6 similar this week") and a confidence. Examples (all scripted): `ERR_DOCKING_ALIGNMENT_TIMEOUT` at a glare-exposed bay in the afternoon → "glare, 0.78"; `ERR_LIDAR_DIRT_OBSCURATION` repeated on the same robot → "dirty window; check cleaning schedule, 0.70"; `ERR_BATTERY_LOW_CRITICAL` on a weak pack → "pack health 78%, replace, 0.82".
- An engineer confirms or corrects each in one click; a counter "confirmed causes" climbs from 46% toward 60% as the reader clicks (the starting 46% is the complement of the 54% in Analysis 1; the target 60% is **assumed**, tagged).
- It only reads and suggests, so it carries no risk to the robots. Show "engineering hours saved: assumed 40% of 158 h" as a number tagged assumed.
- Also show the no-fault-found line: 18.75% of tickets (51 of 272) used 158 of 1,033.2 engineering hours (Analysis 7).

### 9.8 U8: Battery swap with a person in the loop (the recommendation)
- Where: Warehouse A (24x7). The reader turns "Battery swap (person)" on in the policy panel.
- Map: a robot at 25% drives to the swap bay; the operator figure swaps the pack in `swapTime` minutes (default 5); the spent pack goes on the rack and its counter shows "charging 100 min"; the robot returns to work.
- Live readout: swaps done, queue at the bay, spare packs charged/charging, and the **charging share of scheduled time** against Today (A today 23.5%).
- Sliders: swap time (3–15 min), spare packs per robot (0–0.6), operators (1–2). The readout shows the effect immediately in the sim (section 8). When the spare packs are too few, the reader sees robots fall back to the charger and the flat-battery stops return. This is the most important thing for the reader to discover.
- **The swap, step by step** (a six-step strip above the map, each step lit as it happens; no minutes are shown per step, only the total from the slider): robot arrives at the bay; latch released; lift aid takes the spent pack out; charged pack goes in; latch closed and connector checked; robot resumes. Under it: "Pack weight is not in the data; engineering has to confirm one operator can handle it".
- **What the case targets, for comparison:** next to the live readout show the case's phase-1 target as a plain reference line: "pilot charging share from about 23% to under 14%; emergency low-battery stops per robot from 2.99 to under 1 (assumed targets)". Also show "ceiling: about 10,320 hours a month at the 24x7 sites if every charge became a swap (Analysis 4); a ceiling, not a forecast".
- Static facts shown alongside (from data): 24x7 sites charge 20.4% of scheduled time vs 11.6% at the 16-hour sites; 4,655 hours a month above the 16-hour rate; 2.99 emergency stops per robot vs about 0.26; 57 weak packs stop 2.70 vs 0.59.
- Phase 2 is shown as a text card only: "Automated swap station: only if the month-4 gate passes (swap time near target, charging share down, no pack damage)". No animation.

### 9.9 U9: Safety stop — the model is refused
- Where: Warehouse B, Bot 2, `ERR_SAFETY_LIDAR_ESTOP` (a person or forklift in the safety field).
- The reader presses Recover. The pipeline runs: the model's box proposes (scripted) "shrink the protective field radius" (CHG-013: `protective_field_radius`, 4 lines). The check: allowlist FAIL, `safety_layer_untouched` FAIL, reason "safety layer is never-edit". Result is **refused**; the only path is a person at the robot who confirms the area is clear and resets it. Show the scoreboard fact: 171 incidents and 113.4 hours fleet-wide (Analysis 2, 9), "a site-process matter, outside every software level".

### 9.10 U10: Vision path (VLM) end to end
- Shows the three image-handling options from the doc: onboard camera capture now (advisory), fixed premises cameras later (only at the worst sites), and on-robot tiny model after the server model works.
- The reader steps through: incident → capture a frame (the camera view from 9.2) → blur faces and badges (draw a blur on a stick figure) → server model names the object → label stored → a person confirms or corrects → the label joins the evaluation set. Show the 81% match figure and the glare-vs-dirty confusion.

### 9.11 Scenario list order (Explore: the Use cases buttons; Guided: the order of the story)
U1, U2, U3, U4, U5, U6, U7, U8, U9, U10 and the voice scene (section 11).

---

## 10. Game mode (`game.js`)

Purpose: let the reader try policies and see which works better, in the way the case reasons.

1. **Pick a warehouse** (A, B, C).
2. **Pick a policy** with switches (any combination): *Battery swap (person)*, *Recovery agent*, *Triage*. (Voice is shown on the results screen as a note, not a switch.) A fourth switch, *Fixed cameras around the site*, is **greyed out** with "later; costs money at every site, the robot's own camera answers the same questions first".
3. **Sliders** for the assumed values in 5.8 (swap time, spare packs per robot, operators at the bay, agent can propose %, gate pass %). Each slider shows its default and the "assumed" tag. A **Reset** button restores defaults.
4. **Run a week** (7 simulated days, animated on the map at about 40 seconds, with Skip to result). It runs the chosen policy and the **Today** baseline with **the same seed** (so the difference is from the policy, not luck), side by side.
5. **Average of 20 runs** button (runs 20 different seeds for both, in chunks via `setTimeout` so the page does not freeze, with a progress bar). Show mean and the range.
5b. **Slider "Work waiting beyond today's volume"** (headroom, 8.1b, default 25%, assumed) sits first in the slider list, with the note "Freed time becomes pallets only if work is waiting."
6. **Scoreboard** (two columns, Today vs Your policy, with the difference): **robot time returned (hours)**; **extra pallet moves** (capped by headroom, with the "work ran out" note when capped); pallet moves; share moving; share charging; share stopped; emergency low-battery stops; incident downtime hours; operator walk-ups; human clicks; swaps done and swap queue minutes (if swap on); engineering hours on no-fault-found tickets (if triage on); confirmed causes % (if triage on).
7. **Plain-language result line** generated from the numbers, e.g. "On Warehouse A, battery swap raised the moving share from X% to Y%. With only N spare packs it fell back to the charger Z times." Generate by template. Never claim certainty; end with "Direction only: swap time, spare packs and the agent's success rate are assumed."
8. **Expected shape of results (a sanity test for the builder, not text to display):** battery swap should help most on A, little on B and C; the recovery agent should help most on C and least on B; triage changes no robot time; with spare packs near 0 the swap policy should show no benefit over Today; raising swap time above about 15 minutes should reduce or erase the benefit; with headroom 0% no policy may add pallet moves, though time returned still shows; with the default headroom, B should show a small gain only (it already has 32.6% idle time). If the sim shows otherwise, check section 8.1 before changing any data.
9. A **"What would change my mind"** box on the results screen (from the case): a real swap taking much longer than 10 minutes; a spare-pack need well above 0.3 per robot; a pack that cannot be handled safely by one person.
10. A **"What argues against"** line: swapping only helps the 24-hour sites (10 of 30 sites, 74 of 250 robots); the 16-hour sites already charge at 11.6%.

---

## 11. Voice from a phone (`voice.js`)

Shows how a supervisor can handle failures by voice from a phone, without walking to a screen.

- A **phone mock** (plain rectangle with rounded corners, 320 × 560) beside the floor map. Inside: a chat-style list and a large **Tap to speak** button.
- **No real microphone and no real speech recognition.** Tapping the button shows a list of 4 preset phrases (chips); choosing one plays the pipeline. A note under the phone: *"In the real version, speech is turned into text by a small model Botsync hosts. Browser speech services are not used because they send audio to an outside provider."*
- Pipeline (reusing section 6): **Speech to text** (in-house small model) → **Model works out the intent** (scripted JSON) → **Deterministic check** → **Robot acts** → **Reply to the phone** (text, and a spoken-style line).
- The four phrases:
  1. "Bot 5 is stuck at dock 2, recover it." → intent `{"intent":"recover_robot","robot":"Bot 5","station":"Bay 1"}` (Warehouse A; Bay 1 is a dock door). Check: robot exists, is stopped, action on whitelist, not a safety code → PASS → recovery runs on the map → reply "Bot 5 is moving again. It took 4 minutes."
  2. "Reroute bot 5 to bay 4 and move everything to bay 6." → same as U5, but with a **confirmation step**: the phone shows "Confirm: send Bot 5 to Bay 4 and all drop-offs to Bay 6?" with **Yes / No** buttons. Anything that changes more than one robot always asks to confirm.
  3. "Release the e-stop on bot 3." → check FAIL: safety layer → reply "I can't do that. Someone has to be at the robot and confirm the area is clear." (matches 9.9).
  4. "Fix the thing at the dock." → the model cannot resolve it → the phone replies with a question: "Which robot, and which dock?" and shows chips for the stopped robots.
- Risks listed under the phone (short bullets): noisy floor (misheard robot number → confirm step for multi-robot or non-reversible actions); who is allowed to command (sign-in on the phone, role limits); a command must never bypass the check; log every command with who, when and the result.

---

## 12. Roadmap and RICE (data for screen 4.5)

### 12.1 RICE (score = reach × impact × confidence ÷ effort)
Impact scale (share of scheduled time returned to the robots reached): 3 = over 10%; 2 = 5 to 10%; 1 = 2 to 5%; 0.5 = 0.5 to 2%; 0.25 = under 0.5%. Effort is person-months. **Effort and confidence are the author's estimates** (tag them).

| item | reach (robots) | impact | confidence | effort | score | hours at stake per month |
|---|---|---|---|---|---|---|
| LLM root-cause triage | 250 | 0.25 | 80% | 4 | 12.5 | 158 engineering hours on no-fault-found tickets (Analysis 7) |
| LLM fleet instructions (reroute) | 250 | 0.25 | 50% | 4 | 7.8 | about 90 (blocked path and deadlock, Analysis 2: 62.8 + 27.1) |
| **Battery swap, phase 1 (24x7 sites)** | 74 | 2 | 50% | 10 | 7.4 | 4,655 above the 16-hour sites' charging rate (Analysis 4) |
| VLM evidence and labels (advisory) | 250 | 0.25 | 50% | 5 | 6.3 | 644 in perception faults it could help diagnose (Analysis 2: docking 250 + lidar dirt 217 + pocket 88 + localisation 89) |
| LLM behaviour tree or parameter changes | 250 | 0.25 | 50% | 8 | 3.9 | 258 (Analysis 9) |
| LLM recovery agent (level 1) | 250 | 0.25 | 50% | 9 | 3.5 | 801, of which 420 operator or remote work (Analysis 9) |
| Battery swap, phase 2 (automated station) | 74 | 3 | 30% | 30 | 2.2 | up to 10,300 at 24x7 sites if every charge became a swap (Analysis 4) |
| LLM task planning | 250 | 0.25 | 20% | 10 | 1.3 | no data |
| Fixed cameras around sites | 100 | 0.25 | 30% | 12 | 0.6 | not sized |

Text under the table (keep): "RICE puts swap third, behind triage and fleet instructions. Those two win because they are cheap. Neither returns robot time directly. I am using RICE as a check and choosing on the size of the prize." The table is sortable by any column; default sort by score, highest first; the swap row is bold.
The builder must **recompute the score from the four inputs and fail a test if it differs from the stored score by more than 0.05** (see acceptance tests).

### 12.2 Six-month roadmap (months Nov to Apr)
| month | battery swap (the one improvement) | LLM and VLM (follows it) | gate or decision |
|---|---|---|---|
| 1 (Nov) | Pick three pilot sites: S08, S21, S22 (19 robots). Define pack, bay and swap steps. Confirm pack weight and the lift aid. Start recording swaps. | Triage on existing logs; engineers confirm the cause on each case. Standard picture capture at every incident. | Baseline charging share and emergency low-battery stops at pilot and unchanged 24x7 sites. |
| 2 | Build bays and a rack, buy about 6 spare packs, train operators. Swaps go live at S08. | Triage live for the maintenance team. Draft a list of recovery actions from past recovery attempts. | Swap time measured on the first 50 swaps. |
| 3 | Swaps live at all three pilot sites. | The model labels objects at incidents (advisory), scored against engineer labels. | |
| 4 | Extend to the other seven 24x7 sites if the gate is passed. | Recovery agent in shadow mode: it proposes, operators act, and the two are compared. | Gate: swap time near the 10-minute target, charging share at pilot sites well below unchanged 24x7 sites, no pack damage. |
| 5 | All 24x7 sites (74 robots, about 22 spare packs). | Recovery agent live at two canary sites behind the evaluator and fallback. | |
| 6 | Measure against the targets. | Fleet instructions in shadow mode. | Decide: automated swap station, 16-hour sites, and how far the LLM work goes. |

Targets (assumed, set in month 1): pilot charging share from about 23% to under 14%; emergency low-battery stops per robot from 2.99 to under 1; no pack damage.

### 12.2b How we would know it worked (a small table under the roadmap)
| measure | baseline in the dummy data | target (assumed) | where it is read |
|---|---|---|---|
| charging share of scheduled time, pilot sites | about 23% (S08 23.5%, S21 23.2%, S22 21.7%) | under 14% | `robot_daily_utilization`, per site |
| emergency low-battery stops per robot, pilot sites | S08 4.62, S21 1.40, S22 5.50 (24x7 average 2.99) | under 1 | `incidents` (code ERR_BATTERY_LOW_CRITICAL) |
| swap time | not in the data | near 10 minutes | new swap record |
| pack damage | not in the data | none | new swap record |
| incidents with a confirmed cause | 46% | rising (the target is set in month 1) | `incidents.root_cause_confirmed` |
| no-fault-found tickets | 18.75% of 272 | falling | `support_tickets` |
Compare pilot sites against the other 24x7 sites that have not switched.

### 12.3 Benefits (two short lists, shown under the roadmap)
- **Customers:** more working hours where it hurts (if the 4,655 excess hours went away, 24x7 sites would get about 63 more working hours per robot per month); fewer surprise stops; faster, better fixes (technicians take 168 to 332 minutes to arrive by region, so a correct remote answer saves the most time where they are slowest; 19% of tickets end as no fault found).
- **Botsync:** more deliveries per robot without selling more robots; less support cost (about ₹54 lakh in 30 days at assumed rates; 158 engineering hours on no-fault-found tickets); renewals (4 customers flagged churn risk hold 25% of contract value, ₹1,074 lakh); data advantage (the swap record and the confirmed causes).

### 12.4 Model choice (small box on the Roadmap screen; from the doc's section on models)
No third-party hosted LLM or VLM, because fault data and pictures of customer sites should not leave Botsync. Pick: a small open LLM (7 to 8 billion parameters) fine-tuned on confirmed causes and recovery outcomes, hosted by Botsync; a large self-hosted model offline only, later, for drafting tree and code changes; a small open VLM (2 to 7 billion parameters) fine-tuned on engineer-labelled incident pictures, advisory first; a tiny on-robot model only after the server model works. Faces and badges are blurred before storage. Choose between the small models by running two or three on about 200 engineer-labelled incidents and comparing accuracy, response time and memory against the 81% match in the dummy set. Model names are examples to benchmark, not final picks; **do not name specific models on the page.**

---

## 13. Guided mode (about 8 minutes, 14 steps)

A fixed sequence. Each step shows a caption (2 to 3 sentences), highlights one part of the screen, and has **Back / Next** buttons plus a step counter. The reader can leave to Explore at any point and return.

1. The situation: 250 robots, 30 sites; robots spend 62% of time moving, 15% charging, 1% failing (Analysis 1). Show the three bars.
2. Who feels it: the six groups, one line each (ops head, floor supervisor and operators, site IT, field technician and support, deployment engineer, product and engineering).
3. Pick Warehouse A (24x7). Show its numbers: 23.5% charging, 37 emergency low-battery stops in 30 days.
4. Contrast with Warehouse B (16x7): 11.8% charging, 6 stops. Shows the counter-pattern (charging binds only at 24-hour sites).
5. The loudest failure is not the costliest: docking 29% of incidents, 14% of hours; technician repairs 8% of incidents, 59% of hours.
6. Switch to Warehouse C: glare doors. A docking timeout appears. Run U1 (pipeline, pass).
7. Make U1's check fail (variant): fallback and the one-click approval.
8. U2: something in front of the robot (three variants).
9. U4: offline change that passes, then the charge-threshold edit blocked. The takeaway line: software cannot remove the charging loss.
10. U9: the safety stop is refused.
11. U5 and U6: a typed instruction and a business goal broken into missions.
12. U7: triage across the fleet.
13. U8 + Game: turn on battery swap on Warehouse A, move the spare-pack slider to 0 and back, and run a week. The takeaway: swap only helps if a charged pack is waiting.
14. The recommendation and roadmap: one improvement (swap, person in the loop, 24-hour sites), what follows, what is deprioritised (task planning, automated station before phase 1, fixed cameras, LLM code changes, hardware wear, safety stops, Wi-Fi and traffic), what would change my mind. Then buttons: Explore, Game, Voice, Roadmap.

---

## 14. Source mapping (every number → where it came from)

| on the page | source |
|---|---|
| fleet, time shares, incidents, downtime, costs | Analysis 1 |
| top-8 codes | Analysis 2 |
| firmware vs glare | Analysis 3 |
| charging by shift pattern; 4,655 h; 63 h/robot; 100.6 min; 10,320 h | Analysis 4 |
| weak packs 57; 2.70 vs 0.59 | Analysis 5 |
| technician response | Analysis 6 |
| support, no-fault-found, VLM match, missions, network, traffic | Analysis 7 |
| customers to watch | Analysis 8 |
| three levels sized | Analysis 9 |
| swap ceiling 19,287 h = 14.4% | Analysis 10 |
| not-trusted list, missing data | Analysis 11, 12 |
| warehouse numbers | tabs `sites`, `stations`, `incidents`, `robot_daily_utilization`, `charge_sessions` |
| gate names, thresholds, scripted change results | tabs `change_requests`, `eval_results` (scripted scenarios, not measured) |
| flow boxes | tab `ai_flow_steps` |
| VLM labels | tab `incident_evidence` |
| spare packs, 5-min swap, 8 h run, 100-min charge | assumptions in the doc and `Analysis` assumption cells |

If a number cannot be found in this table or in 5.8, it must not appear on the page.

---

## 15. Things the page must NOT do

- No live calls to any model, speech service, analytics, font host or CDN.
- No claim that the data is real, that the model steps are live, or that the swap is proven.
- No numbers outside sections 5, 8 (sim outputs, tagged simulated) and 12.
- No colour fills for decoration; no emoji; no stock photos; no animation faster than 3 flashes per second; nothing that auto-plays sound (no sound at all).
- No dependency on screen size above 1280 px; no horizontal page scroll at 1024 px.
- No invented customer names beyond the four in 5.6 (they are fictional in the workbook), and no real company marks.
- Do not put the case author's contact details on the page.
- Do not show rupee amounts other than those in 5.1 and 5.6 (all assumed rates, tagged).

---

## 16. Acceptance tests (run all; fix until all pass)

Run these from a **fresh unzip in a new folder**, opening `index.html` through `file://` (headless Chromium via Playwright is fine; Playwright is used only for testing and is not part of the deliverable).

1. **Opens clean.** No console errors or warnings at load; no failed network requests (there should be none at all). Record `page.on('requestfailed')` and `page.on('console')`; both empty.
2. **No external requests.** Every request URL starts with `file://`. Fail on any `http://` or `https://`.
3. **No setup.** The zip contains no `node_modules`, no `package.json`, no build output requirements. `index.html` references only relative paths under `assets/`.
4. **Banner present** on every screen (section 2.1): check text exists in the DOM on Start, Explore, Game, Roadmap, Voice, and Guided.
5. **Three warehouses** switch correctly; the robot count shown is 8 / 17 / 16; station counts 11 / 17 / 17.
6. **Incident flow:** in Explore on A, wait for a stop (or press "Trigger a stop"), click the red robot, see the camera view and the VLM label, press Recover, see all pipeline boxes light in order, see the result, and see the robot return to `moving`.
7. **Every scenario U1 to U10 and the four voice phrases** can be run to the end without errors; each variant ("fail" cases) ends in the state specified in section 9 and 11. Automate this: call each scenario's player and assert the final result text matches the spec (PASS/FAIL words, bay names, gate names).
8. **Safety refusal** (U9 and voice phrase 3): the result is "refused"; no state in the sim changes.
9. **Data integrity:** a test script loads `data.js` and asserts: shares sum sensibly (moving + charging + idle + error within 0.5 of 100% per warehouse); warehouse incident codes sum to the stated incident counts (63, 32, 59); stations sum (11, 17, 17); level incidents sum 1,475 + 323 + 168 + 171 = 2,137; each RICE score within 0.05 of reach × impact × confidence ÷ effort; the roadmap has six months.
10. **Numbers match the workbook.** A script reads `botsync_dummy_data.xlsx` (`Analysis` tab, cached values) and compares every figure in 5.1 to 5.6 to `data.js` (tolerance: rounding to the displayed precision). Any mismatch fails.
11. **Simulation calibration** (8.5) passes for A, B and C. Determinism: the same seed gives byte-identical results twice.
12. **Game sanity** (10.8): the shape of results holds. Spare packs at 0 gives no benefit from swap; 0.3 per robot gives a benefit on A.
13. **Keyboard:** Tab reaches every button; Esc closes panels; focus ring visible.
14. **Reduced motion:** with `prefers-reduced-motion: reduce`, the pipeline still highlights steps and nothing glides.
15. **Layout:** screenshots at 1440 × 900 and 1024 × 768 for each main screen; no horizontal page scroll, no overlapping text, text size ≥ 14 px (map labels ≥ 12).
16. **Zip test:** build the zip, unzip into a different directory, repeat tests 1 to 3 and 6 there. The zip is under 5 MB.
17. **Speed:** 16x speed in Game mode runs a week in under 3 seconds on a laptop; the 20-run average completes in under 60 seconds without freezing the page.
18. **Assets gallery:** open `index.html#assets`; the page must show every robot state in A1 (moving, idle, toCharge, toSwapBay, queue, charging, swapping, stopped, recovering, waitingForPerson, recovered, carrying, selected), every pallet variant (A2), every aisle object (A3), every building element (A4), all eight camera scenes (A6), the pipeline box in each status (A7), the four time-share patterns (A8), the phone mock (A10) and the UI components (A11). Take a screenshot and check that no asset is blank, clipped, or drawn in a colour outside the palette (section 3). A script that counts the draw functions exported by `draw.js` must match the list in 7A.
19. **Stopped state readable without colour:** convert the gallery screenshot to greyscale and confirm the stopped robot (X mark, thick outline) is still distinguishable from the moving robot.
20. **New screens (4.9 to 4.15):** Evidence shows six charts with source tags; Fleet overview shows 30 tiles, ten with bold outline, three with "pilot", three with "in this demo", and clicking S08, S12 or S20 opens that warehouse; Architecture shows the three lanes and the three callouts; the Approval screen appears in U1 (fail variant), U4 (variants 2 and 3), U5 (fail chips), U6 (tight plan) and refuses out-of-range edits; View as changes the default panel for all six roles; Quick tour runs exactly steps 1, 3, 6, 13, 14; Show sources adds a tag to every number and every tag comes from the `src` field in `data.js`.
21. **Demand honesty (8.1b):** in Game on A with headroom 0%, "extra pallet moves" is 0 under every policy while "robot time returned" is above 0 for the swap policy; at 25% headroom, extra moves are positive and never exceed 25% of today's volume.
22. **Per-site table (5.9):** regenerated from the workbook by script; the reference rows listed in 5.9 match to the displayed precision; the ten 24x7 sites sum to 74 robots.
23. **Shift hours (8.1c):** a simulated week at A has 168 scheduled hours per robot, at B 112, at C 96.

---

## 17. Suggested build order (so nothing is left half-done)

1. `data.js` from section 5, plus the data-integrity test (16.9) and the workbook comparison (16.10).
2. `style.css`, the page shell, banner, top bar, Start screen.
3. `draw.js` (every asset in 7A) and the assets gallery (`#assets`); check it by screenshot before anything else uses it. Then `warehouses.js` and the canvas renderer (static maps first).
4. `sim.js` with the seeded PRNG, then `selfTest()` and the calibration (8.5). Do not move on until it passes.
5. Robots moving on the map; Explore mode; the incident panel and camera scenes.
6. The reusable Pipeline component (section 6), then U1.
7. The remaining scenarios U2 to U10.
8. Game mode (including the demand model 8.1b and the Limits box 8.1e).
9. Voice scene.
10. Roadmap, RICE and the measurement table (12.2b).
10b. Evidence, Fleet overview, Architecture, Approval screen, View as, Show sources (4.9 to 4.15).
11. Guided mode and Quick tour.
12. Run all acceptance tests, fix, zip, unzip elsewhere and run again.

When finished, deliver: `botsync_walkthrough.zip` (the only thing to send to the reader), plus a short `README.txt` inside it.

---

## 18. Facts from the case that the page's wording should follow (plain voice)

- Recommendation: **battery swapping, phase 1, with a person doing the swap, at the 10 sites that run 24 hours.** Pilot: S08, S21, S22 (19 robots).
- Follows, in order: triage; VLM evidence and labels (advisory); recovery agent (level 1) first in shadow then at two canary sites; automated swap station only if the month-4 gate passes.
- Deprioritised: task planning (no order or warehouse-system data); automated swap station before phase 1 has run; fixed cameras around sites; LLM code changes (level 3); hardware wear (168 incidents, 556 hours; technician work); safety stops (171 incidents, 113 hours); Wi-Fi (1 of 1,784 dropouts stopped a robot) and traffic (3.7 hours in the 7-day extract).
- Why the swap and not the cheapest items: RICE ranks swap third; the case says so openly and chooses on the size of the prize (4,655 hours a month above the 16-hour rate, more than seven times the 644 hours lost to docking, lidar, pocket and localisation faults together).
- What argues against: the swap helps only the 24-hour sites (10 of 30 sites, 74 of 250 robots) and needs a pack redesign and a new floor process.
- What I would not trust: why robots fail (54% have no confirmed cause); firmware (compare within a site type); downtime hours (1,729 vs 1,319 do not match); customer availability and cost (SLA not defined, rupee rates assumed); it is all dummy data.
- Three LLM jobs: root-cause triage (first), fleet instructions (second), task planning (third, automated). Three fix levels: runtime recovery action; offline tree or parameter edit; offline node code with mandatory human approval. The safety layer is never editable by a model. Both lists apply together.
