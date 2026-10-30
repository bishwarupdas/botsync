# Botsync interactive walkthrough: build notes

The deliverable is **`botsync_walkthrough.zip`**. Unzip it and double-click `botsync_walkthrough/index.html`. It works offline over `file://`, with no install.

| Path | What it is |
|---|---|
| `botsync_walkthrough/` | The page (unzipped copy of the zip): `index.html`, `README.txt`, `assets/css`, `assets/js` (data, predict-data, predict-calc, history-data, draw, warehouses, sim, scenarios, ui, game, voice, predict, history), `assets/img/favicon.svg` |
| `botsync_walkthrough.zip` | The only thing to send to the reader |
| `source/` | The brief and the workbook the page was built from |
| `tools/` | Test and generation tools; **not** part of the zip |
| `evidence/` | Test output and screenshots from the last run |
| `PLAN.md` | The build plan written before coding |

## Rebuild and retest

`data.js` has a generated block for the per-site table, error codes and demo robots. To regenerate it from the workbook:

```bash
python3 -I tools/build_data.py source/botsync_dummy_data.xlsx botsync_walkthrough/assets/js/data.js
```

`predict-data.js` (Predict screen) and `history-data.js` (site history) are generated from the same workbook:

```bash
python3 -I tools/build_predict_data.py source/botsync_dummy_data.xlsx botsync_walkthrough/assets/js/predict-data.js
```

```bash
python3 -I tools/build_history_data.py source/botsync_dummy_data.xlsx botsync_walkthrough/assets/js/history-data.js
```

The prediction add-on's own calculation test (its test 1) runs the spec's `test_calc.js` unchanged:

```bash
tools/run_calc_test.sh
```

To run all acceptance tests (Playwright and Chromium are test tools only):

```bash
node tools/run_tests.js botsync_walkthrough
```

To build the zip, unzip it into a new folder and rerun tests 1-3 and 6 there (test 16):

```bash
tools/build_zip.sh
```

To check calibration on its own, run `selfTest()` in the browser console. It takes about 45 s.

## Interpretation choices (where the spec was ambiguous)

1. **Demo clock in Explore.** At 1x, one screen second is 10 simulated seconds. Robots travel 40 px per second on screen, and a 60-second deadlock wait is 6 screen seconds. Explore is labelled "demo speed"; only Game is calibrated.
2. **Charger waiting counts as idle** in the time shares. The utilisation tab has no waiting column. Waiting is tracked separately and counts in "robot time returned".
3. **Charge trigger calibration.** Per site: A uses 36%. B uses 25% plus a soft trigger up to 30%, used only when a charger is free. C uses 25%. Only the mission duty (site work arrival rate) and the charge trigger were tuned, as 8.5 allows.
4. **Demand model (8.1b).** Work arrives at site level. In Game, both Today and the policy face the same work (today's volume plus headroom). The policy is also capped at today's volume x (1 + headroom). "Extra pallet moves" is the policy's moves above Today's, never shown below 0.
5. **Overstated swap at B and C.** With the assumed 1 charger per 3 robots, 16-hour sites queue for chargers in the afternoon far more than the data's 0.2-minute wait. The Limits box on the Game results says this.
6. **"About 0.26" emergency stops per robot at 16-hour sites** is 46 stops / 176 robots (sites and incidents tabs). The simple mean of 0.28 and 0.25 would give 0.27.
7. **Firmware and pack health** in the robot panel are the site's robots from the `robots` and `battery_packs` tabs, in order, mapped to the site-local Bot labels. The panel says so.
8. **Two-decimal rounding** uses round-half-to-even, so S08 shows 4.62 as in the spec, not 4.63.
9. **U8 has no LLM pipeline.** It is a person-in-the-loop process, not a model step. It has the policy switch, sliders, live readout, the six-step strip, targets and static facts.
10. **The voice confirm step** (phrase 2) is the phone's Yes / No card. The full approval screen (4.12) is used by U1, U2, U3, U4, U5, U6, U9, U10 and the generic Recover flow.
11. **Show sources** tags every number rendered from a value in `data.js`, and simulated values (tag text also defined in `data.js`). Prose taken from the case (roadmap rows, benefits, "what I would not trust") gives its source in brackets instead of a tag per number.
12. **Scripted limits** in approval edits (for example the 25 to 40% charge-trigger range in U4, or the 20 to 40 minute charge slot in U6) are tagged "scripted example".
13. **Colour (changed after review).** The spec asks for black on white with colour for state only. At the reviewer's request the page now has a colour layer:
    - Soft charcoal `#2B2D31` text on warm paper (`#F5F4F0` page, `#FCFBF8` panels), with grey 1 px lines `#7A7D84`.
    - **Blue** `#1F5FA8` for the top bar, headings, primary and active buttons, moving robots, battery bars and main chart bars.
    - **Teal** `#12807F` for charging hatches, chargers, conveyors, staging areas, the role chips and "scripted example" tags.
    - **Violet** `#5B47B0` for "assumed" tags.
    - **State colours unchanged and reserved:** red is stopped or FAIL, green is recovered or PASS, amber is waiting for a person. None of the decoration colours is close to them in hue, and every non-colour cue (X mark, thick outline, PASS/FAIL words) stays. Test 18's palette check now allows the decoration hues and nothing else.
14. **Three different floor plans (changed after review).** One generator builds all three maps; each site gets its own plan, and bay numbers, counts and aisle widths follow section 7 exactly.
    - **A (S08, brownfield, 2.4 m aisles):** turned 90 degrees, dock doors on the left wall, conveyors along the top, and a dense grid of short rack columns.
    - **B (S12, greenfield, 3.5 m aisles):** dock doors on the bottom wall, facing a large open staging floor, with three long rack bays.
    - **C (S20):** the classic layout, with glare-exposed doors along the top.
    - Rotating or flipping a plan keeps every distance. Because A's travel distances changed, its work arrival rate was re-tuned (1.15 to 1.40 missions a minute) and calibration rechecked (test 11).
15. **Traffic in Explore (8.1d).** Robots heading the same way may share an aisle segment but keep one robot-length apart; robots coming head-on wait at the waypoint. A robot that has started waiting is let in next, so nobody waits for ever. A wait over 60 simulated seconds raises ERR_PATH_PLANNING_DEADLOCK, or ERR_INTERSECTION_GRIDLOCK_TIMEOUT when the robot it waits for is itself waiting. Robots that share a spot (a bay, a junction, a charger queue) are drawn side by side.
16. **Robot size on the map.** Robots are drawn at 80% of the asset size on the map, so they fit a 2.4 m aisle. The assets gallery and legend keep the spec size (A1).
17. **Work-screen layout.** Explore, Game and Voice fill the window height. The map with the event log under it stays in view, and the right panel scrolls on its own. Below 1180 px wide the voice screen and very short windows fall back to normal page scrolling.

## Round 2 changes (after review)

The workbook in `source/` is now `botsync_dummy_data_1.xlsx` (saved under the original name). It adds Analysis section 13; every number the earlier screens show still reproduces from it (tests 9, 10, 22).

18. **Step history in every flowchart (departs from A7).** Under each flowchart, every box that has run stays as a numbered card: its name, what kind of step it is, In, Out, gates and any approval. Nothing is replaced. The card currently running is highlighted, and clicking a finished box jumps to its card. A sticky "Now:" line keeps the current step visible while the cards grow.
19. **Pacing (departs from A7's 700 ms).** At 1x each box types its text (never longer than about 3 s), then holds for 2.5 s. An **Auto / Step** switch above each flowchart: in Step mode every box waits for "Next box". 4x and 16x still speed it up; Pause still freezes it.
20. **What each box is.** Every box, live or on How it works, carries a chip: LLM, VLM, SPEECH (models), CODE (plain rules, no model), ROBOT, PERSON or DATA, with a one-line "who does it" on its card. A key explains the chips. Chip colours are the decoration colours, never red, green or amber.
21. **Voice is scenario V (departs from section 11's separate screen).** It plays in the same scenario player as U1 to U10, with the same title bar, Prev / Next, Replay and variant buttons. The four phrases are its variants and "Say it" runs one; the phone is still tappable. The phone sits in its own column between the map and the panel so it stays in view while the pipeline cards grow. The top-bar "Voice" button (shortened from "Voice from a phone" so the top bar keeps two rows at 1024 px) opens scenario V. A follow-up run (picking a robot after phrase 4) keeps the earlier run folded above it.
22. **Prev / Next and a scenario picker** in every scenario, with an "n of 11" counter.
23. **Predict screen** (prediction add-on spec). Built as specified: five PREDICTION panels with every slider, "How it is calculated", "What it says", source tags, the accept box, the six limits and the bottom note. `predict-calc.js` is the spec's code unchanged and `predict-data.js` comes from the spec's script. Where the add-on conflicts with the app, the app's conventions win, as the add-on allows:
    - Colours follow the agreed colour layer, not black on white. The window band and the selected threshold are hatched with a dashed or thick outline, so they read in greyscale.
    - `predict.js` loads after `ui.js` (it registers its screen with the router); the two data and calculation files load right after `data.js`.
    - Files outside the add-on's list changed because of the other review points, not because of Predict.
    - The 100-minute recharge time is tagged "Analysis 4" (measured average session), as the add-on's section 7 says.
    - The Guided step for Predict is chapter 8; the Quick tour includes it and still runs in about 2 minutes.
24. **Site history for all 30 sites.** Every Fleet overview tile opens a history screen: the site summary with 30 daily bars, a sortable robot table, and a robot timeline (30-day stacked hours, then any day hour by hour with charge sessions, incidents and, for the last 7 days, missions). S08, S12 and S20 keep a button into their live warehouse. Positions and paths are not in the data, so there is no replay of where robots drove; the screen says so. Its one PREDICTION box applies the Predict screen's same-as-before method to the site; its figures add up to the fleet-wide ones (test 25). No hypothetical futures appear in history: simulated what-ifs stay in Game.
25. **Guided in 9 chapters (departs from section 13's 14 steps).** The situation (6 charts), Who feels it (6 roles), The three warehouses (A, B, C, the fleet, one site history), How a fix works, Level-1 recovery (U1 pass and fail, U2, U3), Changes and limits (U4 three ways, U9), Instructions and planning (U5, U6, U7, U10, V), Predict, The recommendation (U8, a Game week, the Roadmap). 36 steps. Each step does its own action and then waits; nothing advances on a timer. Where a person has to decide, the caption says which button to press and Next unlocks after the decision (a Skip link is there too). A chapter list jumps anywhere. The Quick tour is one step from chapters 1, 3, 5, 8 and 9 (about 2 minutes).
26. **Acceptance tests added:** test 24 (the add-on's tests 1 to 9) and test 25 (site history). Tests 4, 7, 15 and 20 cover the new screens, scenario V, chapters and the Show sources tags from Predict and history.
