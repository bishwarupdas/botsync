# Botsync interactive walkthrough: build notes

The deliverable is **`botsync_walkthrough.zip`**. Unzip it and double-click `botsync_walkthrough/index.html`. It works offline over `file://`, with no install.

| Path | What it is |
|---|---|
| `botsync_walkthrough/` | The page (unzipped copy of the zip): `index.html`, `README.txt`, `assets/css`, `assets/js` (data, warehouses, sim, scenarios, draw, ui, game, voice), `assets/img/favicon.svg` |
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
