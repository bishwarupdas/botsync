# Round 2 plan (not cleared for development)

Inputs: reviewer feedback (8 points), `botsync_prediction_addon_spec.md`, and the new workbook `botsync_dummy_data_1.xlsx`.

**What I checked before planning**
- The new workbook adds Analysis section 13 (prediction). Its values match the add-on spec's reference table.
- Every number the page already shows still reproduces from the new workbook: 189 of 189 figures, plus the per-site table. Nothing on the existing screens changes because of the new file.
- The generator script in the add-on spec needs pandas, which is installed.

---

## 1. "How it works": say what each box is (screenshot 1)

**Problem.** Several boxes have no subtitle, and nothing says which step is a model and which is plain code.

**Change.** Every box gets a "kind" chip and a one-line "who/what" in the empty space:

| Box | Kind chip | Line |
|---|---|---|
| Fault diagnosis | CODE | fleet manager joins incident, events, camera frame |
| Model proposes | LLM (+ VLM label) | small self-hosted LLM; the VLM label is one input |
| Deterministic check | CODE | plain rules owned by engineering; no model |
| Robot executes | ROBOT | ROS 2 action on the robot; safety layer outside |
| Person fixes it | PERSON | operator, supervisor or engineer |
| Log back | DATA | rows in recovery attempts / change requests / eval set |

- The same treatment applies to the task-planning boxes (Model plans = LLM, Hard-limit check = CODE) and the vision boxes (Server model = VLM, Blur = CODE).
- A small key under the diagrams explains the chips.
- The live pipeline boxes in Explore, scenarios and voice get the same chips, so "is this a model?" is answered everywhere.
- Chip colours stay in the decoration family (blue, teal, violet, grey), never red, green or amber.

## 2. Guided tour covers everything

**Problem.** 14 steps, as section 13 of the spec. It skips U3, U6, U10, voice, a Game run, Fleet overview, Architecture, How it works and Evidence charts 3 to 6. Several steps open a screen and leave the reader to work out what to do.

**Change.** Chapters, each with numbered sub-steps. The counter reads "Chapter 4 of 9 · step 2 of 3", with a chapter list to jump around.

1. The situation: Evidence charts 1 to 6, one step each
2. Who feels it: View-as roles, one step per role
3. The three warehouses: A, B, C, then the Fleet overview
4. How a fix works: How it works, then Architecture
5. Level-1 recovery: U1 pass, U1 fail, U2, U3
6. Changes and limits: U4 (three variants), U9
7. Instructions and planning: U5, U6, U7, U10, Voice
8. **Predict (new screen)**
9. The recommendation: U8 battery swap, a Game week, the Roadmap

**Rules for every step**
- It performs its own action (opens the scenario, picks the variant).
- It waits for the reader. Nothing advances on a timer.
- Where a person must decide, the caption says which button to press, and Next becomes available after the decision.

**Quick tour** stays about 2 minutes: one step from chapters 1, 3, 5, 8 and 9.

**Departs from the spec.** Section 13 fixes 14 steps. This replaces that with chapters, at your request, and will be recorded in `WALKTHROUGH.md`.

## 3. Voice inside the scenario flow

**Problem.** "Next scenario" from U10 jumps to the separate Voice page, which feels out of place.

**Change.** Voice becomes scenario **V** in the same scenario player: same layout, same title bar, same Prev / Next, Replay and variant buttons.
- The four phrases are its variants.
- The phone mock sits inside the right panel above the pipeline.
- The top-bar "Voice from a phone" button opens the same scenario, so the two entry points can't drift apart.

## 4. Previous scenario button

Every scenario gets **Prev** and **Next** (U1 ⇄ U2 … U10 ⇄ V), plus a compact scenario picker ("3 of 11") so you can jump anywhere.

## 5. Steps no longer overwrite each other (voice and everywhere)

**Problem.** The In/Out panel shows only the current box. The previous box's text vanishes before you can read it.

**Change.**
- **Step history.** Under the flowchart, every box that has run stays as a numbered card (box name, kind chip, In, Out, PASS/FAIL), newest at the bottom, the current one highlighted. Nothing is ever replaced.
- **Click any finished box** to scroll its card into view.
- **Slower by default.** At 1x each box waits for its text to finish, then holds for 2.5 s instead of 0.7 s.
- **Auto / Step mode toggle.** In Step mode each box waits for you to press Next.
- Phone chat history already persists. The phone also gets a small "step 3 of 5" line so it ties to the pipeline.

**Departs from the spec.** A7 sets 700 ms per box; this changes it to text time plus 2.5 s. The old speed stays available at 4x and 16x.

## 6. Predict screen (`botsync_prediction_addon_spec.md`)

Built as the add-on spec says:
- New top-bar **Predict** button.
- Five PREDICTION panels with "How it is calculated", "What it says", source tags, and every slider (cut-off, window, length, threshold, swap minutes).
- The "How I would accept a forecast" box, the six limits, and the bottom note.
- `predict-data.js` generated by the spec's script; `predict-calc.js` copied exactly; `predict.js` for the screen.
- One Guided step (chapter 8). Its own tests 1 to 9, including the node calculation test against the reference table.

**Conflicts with the app, resolved by the spec's own rule ("follow the app's conventions"):**
- **Colours.** It asks for black on white; the app now uses the agreed colour layer, so the screen uses it too.
- **The workbook.** `source/` switches to the new workbook. All existing data tests still pass against it, as checked above.
- **Files touched.** It allows only `index.html`, the routes file and the stylesheet to change. That stays true for the Predict work itself; the other points in this plan change other files and are listed separately.

## 7. Fleet overview: history for every site (needs your decision)

**What the data can and cannot support**
- **Per robot, 30 days:** daily scheduled, moving, idle, charging and error hours (`robot_daily_utilization`); every incident with time, code, recovery type and downtime (`incidents`); every charge session with start, end, start and end charge, and wait (`charge_sessions`); firmware and pack health.
- **Last 7 days only:** every mission with pickup and drop station and its times (`missions`), plus fleet events, traffic waits and interventions.
- **Not in the data:** robot positions or paths. So the page cannot honestly replay how robots drove around a floor. It can show what each robot was doing hour by hour.

**Recommended design: a "Site history" screen for all 30 sites.** Clicking any tile opens it. S08, S12 and S20 also keep a button into their live warehouse.

1. **Site summary:** the tile's numbers, plus 30 small daily bars (charging share, incidents, low-battery stops), so trends and quiet days are visible.
2. **Robot table:** each robot's firmware, pack health (weak packs flagged), hours split, incidents (top code), low-battery stops and charge sessions. Sortable.
3. **Robot timeline**, opened from a row:
   - A 30-day strip, one stacked bar per day (moving, charging, idle, error), with incident markers.
   - Pick any day for a 24-hour lane: charge sessions as hatched blocks, incidents as red markers with code and how they were cleared.
   - For the last 7 days, missions as blocks ("Bay ST03 → ST09, 12 min").
   - This is the honest version of "how each bot moved and what it did".
4. **Prediction for this site** (PREDICTION tag), using only the add-on's same-as-before method, scoped to the site:
   - its charging share before and after the cut-off;
   - its robots that ran flat before (and whether they did again);
   - its robots on the watch list;
   - for a glare-door site, its afternoon docking share.
   - All from the same calculation module, so the numbers can't disagree with the Predict screen.

**My recommendation on "hypothetical predictions":** don't add them to history. History should be facts from the workbook; predictions should be the add-on's tested method, clearly tagged. Simulated "what-if" futures already live in Game, which is labelled as simulation. Mixing them into history would blur fact, forecast and simulation, which the honesty rules exist to keep apart.

**Cost.** About 250 to 400 KB of extra data, generated by a script from the workbook (no typing). The zip stays far under 5 MB.

## Order of work

| Step | Work |
|---|---|
| 1 | Point 5 step history and pacing, then point 1 kind chips: shared pipeline changes everything else builds on |
| 2 | Points 3 and 4: voice as scenario V, Prev / Next, scenario picker |
| 3 | Point 6: Predict screen, its generator and its tests |
| 4 | Point 7: site history generator, screen, robot timeline, site predictions |
| 5 | Point 2: the chaptered Guided tour, written last because it walks through everything above |
| 6 | Full verification: acceptance tests, prediction tests 1 to 9, the click-through audit extended to every new control and all 30 sites, screenshots, fresh-unzip test, commit |

## Open questions

1. **History design:** is the activity timeline (no paths; positions aren't in the data) acceptable, or do you want a schematic mission replay on the A, B and C maps? The replay would map the data's station IDs onto my drawn bays, and would have to be labelled "approximate".
2. **Hypothetical predictions in history:** OK to leave them out, as recommended?
3. **Pipeline pacing:** is "text time + 2.5 s per box, with an Auto / Step toggle" the right speed, or should Step mode be the default?
4. **Guided tour:** are 9 chapters (roughly 15 to 20 minutes for everything) fine, with the Quick tour as the short path?
