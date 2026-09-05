# UNSUPPORTED_ATTRIBUTE / latency bounded capture + classification (Supervisor `5546884577`, audit `5549663848` #4/#6)

Method: read-only scan of all retained Z2M log windows (10 windows, 2026-09-04T06:09 →
2026-09-05T06:17 UTC dirs) via `unsupported-attr-scan.js`. **122 matching lines, 16 distinct
patterns.** No new device probing was performed for this capture; no log_level mutation.
Raw scan output: `raw-logs/unsupported-attr-scan.txt`.

## Classification table (Supervisor rubric)

| # | Pattern (cluster.attr on EP) | Occurrences / first-seen | Trigger (provable) | Endpoint's used attrs still OK? | Class |
|---|---|---|---|---|---|
| 1 | `genOnOffSwitchCfg.read(65283)` on EP4/5/6 (=0xff03 mains policy GET) | 3 × 2026-09-04 23:20:25–53 (+earlier 22:xx instances) | Executor `accept-baseline.js` probe | YES — same run read `genOnOff.onOff` fine on those EPs | **EXPECTED/PROBE-NOISE** (audit #4 pre-classified; probes now retired — policy sourced from store) |
| 2 | `genOnOff.read(65283)` on EP1 (wrong-cluster GET of 0xff03) | 3 × 2026-09-04 12:26 | Executor probe from earlier work unit | YES — `genOnOffSwitchCfg` GETs answered same day | **EXPECTED/PROBE-NOISE** |
| 3 | `genBinding` read on EP1/2/3 → `UNSUPPORTED_CLUSTER` | 3 × 2026-09-04 22:16 | Executor `bt-probe.js` | YES — multistate/onOff reads fine | **EXPECTED/PROBE-NOISE** — switch EPs advertise genBinding NOWHERE in descriptors (capture `raw-logs/probe-bt-genbinding.json`); binding truth = coordinator bridge dumps |
| 4 | `genBasic.read(65534)` (swBuildId) on EP1 fail | 3 × 2026-09-05 06:08/08:39 + 1 timeout | 06:08 = **Z2M core** post-reconnect state restore during the unplanned 06:07 host restart; 08:39 = executor battery GET timeout | YES — identity authoritative from herdsman DB `installed_version=285356041`; other attrs fine | **UNRELATED to firmware behavior / transient restart artifact + probe timeout** |
| 5 | `Failed to read state after reconnect` genOnOff on EP1 | 3 × 2026-09-05 06:08 | Z2M core reconnect sweep mid-reboot | YES — device answered all subsequent reads <1 s | **EXPECTED/TRANSIENT (core)** |
| 6 | **`Failed to poll currentLevel` `genLevelCtrl.read(currentLevel)` on EP4 + EP5 → `Status 'UNSUPPORTED_ATTRIBUTE'`** | 27+27 (2026-09-05 08:42…) + 25+25 zh-level (2026-09-04 23:04…) — the ONLY recurring error-level noise | **Z2M core `dist/extension/bind.js`**: after a binding is (re)established, core reads initial state of bound attributes incl. `currentLevel`. Fired by the operator-authorized restore of the *documented pre-rejoin* `genLevelCtrl→coordinator` binds on the relay EPs. | YES — `onOff` on the same EPs read/poll fine seconds before & after; LED/indicator attrs intact | **EXPECTED/BIND-ARTIFACT — not BSEED converter (0× `currentLevel` refs in all three converter files), not V7 (bindings identical pre-rejoin under V6-era config; rejoin simply stopped the poll; restore restarted it). Firmware quirk: EP4/5 ADVERTISE genLevelCtrl in input cluster list but do NOT implement `currentLevel` → descriptor/attribute mismatch, V6-invariant.** |

**Zero occurrences classified as CONVERTER-SURFACE BUG or FIRMWARE ATTRIBUTE REGRESSION** for any
attribute the production flow uses (0xff00/0xff05/0xff06/0x0010/0x0000 all read/write clean
throughout).

## Latency (the operator's "takes some time on press") — bounded correlated evidence

From the banked 06:42 capture (`raw-logs/left-events.jsonl`), timestamps:
- press → coordinator `action` publish: **50–200 ms** (device→coordinator leg is fast/reliable)
- action → LINEAR target visible state publish: **~1.1–1.4 s** (68 @ +1.16 s; 114; 203)
- Same-EP relay report (`onOff`): 23:06:57 cmdOn → 23:06:58 EP5 report (~1 s)

=> BSEED reacts promptly; residual delay sits on the target/mesh delivery-and-report side.
Known corroborator: `ROUTE_ERROR_MANY_TO_ONE_ROUTE_FAILURE` during the Sep-4 OTA attempt-1.
Per audit #6 decision rule: **network/mesh is the leading suspect; firmware latency NOT
suspect.** Not reproduced further; carried into the existing mesh/routing investigation
item. Not a release gate.

## Recommendation to Supervisor
- Item 6 is the only thing worth acting on, and it is cosmetic log noise: options
  (i) accept, (ii) future firmware: drop the unimplemented `currentLevel` behind the
  advertised genLevelCtrl on relay EPs (or stop advertising the cluster), (iii) none of it
  belongs to the BSEED converter. Recommend (i) for closure + a one-line firmware backlog note.
- All probe-driven patterns (1–3) are retired by construction: probe scripts now exclude
  0xff03/genBinding surfaces (documented in TOPOLOGY-ACCOUNTING-CORRECTION.md + audit #4).
