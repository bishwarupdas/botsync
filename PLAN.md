# Build plan: Botsync interactive walkthrough

Source brief: `botsync_interactive_build_spec.md` (sections 1 and 2 are hard rules). Data: `botsync_dummy_data.xlsx`.
Deliverable: `botsync_walkthrough/` (plain HTML/CSS/classic JS, works from `file://`) and `botsync_walkthrough.zip`, on branch `walkthrough-build`.
Test tooling (Playwright, Python, openpyxl) lives in `tools/` and is **not** in the zip.

## Build order (spec section 17) and the checks run after each step

| # | Step | What gets built | Checks before moving on (section 16) |
|---|---|---|---|
| 1 | Data | `tools/site_table.py` generates the 30-site table (5.9) from the workbook; `data.js` holds 5.1-5.9 + 12 as `{v, src}` values, full precision | T9 data integrity, T10 workbook comparison, T22 per-site table |
| 2 | Shell | `style.css`, `index.html`, top bar, banner, Start screen, screen router, Esc/keyboard basics | T1, T2, T3, T4 (Start) |
| 3 | Assets | `draw.js`: every asset in 7A with `drawX(ctx,x,y,angle,state,opts)`, seeded PRNG only; `#assets` gallery; then `warehouses.js` (A/B/C maps, waypoint graph) + static map renderer | T18 gallery screenshot + palette scan, T19 greyscale, draw-function list matches 7A, T5 station counts |
| 4 | Sim | `sim.js`: mulberry32, robot state machine (8.1), shifts (8.1c), demand cap (8.1b), calibrated Poisson incidents (8.2), policies (8.3), metrics (8.4), `selfTest()`; tune `missionDuty` + charge trigger only | T11 calibration over 20 seeds x 30 days, determinism, T23 shift hours |
| 5 | Explore | robots gliding on the map, edge reservations, deadlock/gridlock by mechanism, demo-speed stops, fleet panel, robot panel, incident panel, camera scenes, event log, counters | T5, T6 (up to Recover) |
| 6 | Pipeline + U1 | reusable `Pipeline.run(steps)` (branching pass / fail / reject), Approval screen (4.12), U1 + fail variant | T6 complete, T14 reduced motion |
| 7 | Scenarios | U2-U10 with every variant, scenario player, Replay / Next | T7, T8 |
| 8 | Game | policy switches, sliders, run a week (same-seed Today vs policy), 20-run average in chunks, scoreboard, result line, limits box | T12, T17, T21 |
| 9 | Voice | phone mock, tap to speak, 4 phrases, confirm card, clarifying question | T7 (voice), T8 |
| 10 | Roadmap | month tabs, sortable RICE with recomputed scores, what-follows line, 12.2b, 12.3, 12.4 | T9 (RICE, 6 months) |
| 10b | Other screens | Evidence (6 SVG charts), Fleet overview (30 tiles), Architecture, View as (6 roles), Show sources tags from `src` | T20 |
| 11 | Guided | 14 steps, highlight, Back/Next, leave and return; Quick tour = steps 1, 3, 6, 13, 14 | T4 (Guided), T20 (tour) |
| 12 | Ship | full suite, layout screenshots at 1440x900 and 1024x768, keyboard; zip; unzip into a new folder; rerun T1-T3, T6 there | all 23 tests, T16 |

## Design decisions made up front

- **One engine, two modes.** `sim.js` works in simulated minutes. Robots drive along the waypoint graph at one fixed map speed in both modes. Explore adds edge reservations (deadlock/gridlock by mechanism) and demo-speed stops. Game turns reservations off and uses the calibrated Poisson rates, as 8.1d says.
- **Same seed, same incidents.** Incidents, recovery types, downtimes and agent/gate draws are pre-drawn per robot from separate seeded streams. Today and a policy therefore see the same incidents, and the policy causes the difference. With 0 spare packs the swap run is identical to Today.
- **Demand cap (8.1b).** The policy run may move at most Today's moving robot-hours x (1 + headroom) on each day. When work runs out, robots go idle.
- **Every number** goes through one formatter that writes `<span class="num" data-src="...">`. The `src` text comes from the value object in `data.js`. Simulated and scripted values use source strings that are also defined in `data.js`.
- **No library.** Canvas for map and assets, inline SVG for diagrams and charts. Classic scripts only. No fetch, no workers, no CDN.
