## EXECUTOR ADDENDUM to `5550266763` — complete UNSUPPORTED_ATTRIBUTE status set (source-verified mechanism) + RIGHT item withdrawn per operator direction

### 1. RIGHT closure item — withdrawn as blocker
Operator has explicitly settled the RIGHT channel question and directed it be dropped as an open item. Latest read-only ZCL GET (2026-09-05 07:51:59Z, endpoint-scoped): EP4=0, EP5=0, **EP6=1**, `0xff00=1/1/1`, `0xff05=3/3/0`. I record the read value as-is and treat request (a) from my prior return as **resolved at operator discretion** — not an executor blocker, not a firmware issue. Functional proof for V7 (single local actuation, zero bound OnOff/Level while disabled) stands independent of resting polarity.

### 2. The complete UNSUPPORTED_ATTRIBUTE status set — 123 matching lines / 16 raw patterns across all 10 retained log windows (Sep-4 06:09 UTC → Sep-5)

**Class A — EXPECTED/BIND-ARTIFACT (the recurring error-level noise the operator saw):**
`error: z2m: Failed to poll currentLevel from LivingRoomMainDimmer (... genLevelCtrl.read(["currentLevel"]) ... failed (Status 'UNSUPPORTED_ATTRIBUTE'))`
- EP4: 27× (Sep-5 from 08:42Z-day local 08:42) + 25 zh-level (Sep-4 23:04+); EP5: identical counts. This is ~88% of all error-level lines for this device.
- **Mechanism, source-verified this session** (not inference): Z2M core `dist/extension/bind.js:505-553`, `POLL_ON_MESSAGE` — after traffic on *bound* clusters, core schedules a debounced (~1 s) read of poll attributes (`currentLevel` for genLevelCtrl) on every endpoint that passes `supportsInputCluster(genLevelCtrl)`. EP4/EP5 pass the gate (their descriptors advertise genLevelCtrl as input) — the firmware then answers `UNSUPPORTED_ATTRIBUTE` for the attribute itself — core logs at error (`bind.js:547`).
- Arming condition: the `genLevelCtrl→coordinator` binds on EP4/EP5 — *documented pre-rejoin entries* restored under operator authorization (Sep-2 baseline had them; the rejoin silently stopped the poll; my restore resumed it). V6-era behavior identical; **nothing V7-specific**.
- BSEED converter attribution: all three production files (`v6_production.js`, `v567_hardened.js`, `v56_hardened.js`) contain **zero** `currentLevel` references — grep-proven.
- Contrast (rubric): same endpoints answered `genOnOff.onOff` GETs cleanly seconds before and after every poll failure; reporting/indicator attrs intact.
- Disposition recommendation: accept as cosmetic; if quiet logs are wanted, options are (i) drop the two `genLevelCtrl→coordinator` binds (my call not to — they are documented pre-rejoin topology), (ii) firmware backlog: stop advertising genLevelCtrl on relay EPs OR implement `currentLevel` (descriptor/attribute mismatch), (iii) upstream: demote poll-failure log level. **None blocks closure.**

**Class B — EXPECTED/PROBE-NOISE (executor's own probes, surfaces now retired by standing instruction):**
- `genOnOffSwitchCfg.read([65283])` (0xff03 mains-policy GET) on EP4/EP5/EP6: 3×3 lines, Sep-4 23:20 local — GETs against an attribute the endpoint doesn't serve readable; per audit #4 these probes are permanently retired; policy sourced from store/selects.
- `genOnOff.read([65283])` on EP1: 3× Sep-4 12:26 — early wrong-cluster variant of the same probe.
- `genBinding` read EP1/2/3 → `UNSUPPORTED_CLUSTER`: Sep-4 22:16 — switch EPs advertise no genBinding; binding truth from coordinator bridge dumps.
- `genBasic.read([65534])` swBuildId timeouts on EP1 (mine: two battery runs) — identity authoritatively from herdsman DB `installed_version=285356041`.

**Class C — EXPECTED/TRANSIENT (Z2M core, host-restart window):**
- `Failed to read state of 'LivingRoomMainDimmer' after reconnect` (genOnOff EP1): 3× at 06:08:52 Sep-5 local — one-time reconnect sweep during the **unplanned 06:07 host restart**; every subsequent read < 1 s.
- 4th genBasic(65534) line at 06:08 belongs to the same sweep.

**Class D/E — CONVERTER-SURFACE BUG: 0 occurrences. FIRMWARE ATTRIBUTE REGRESSION: 0 occurrences.** Every attribute the production path uses (0xff00/0xff05/0xff06/0x0010/0x0000/presentValue) read or wrote cleanly throughout. No UNRELATED-DEVICE lines (scan was dimmer-scoped).

### 3. Latency sub-item (audit #6, non-gate) — numbers for the record
From banked captures: press→coordinator action publish **50–200 ms**; coordinator→bound-target visible report **~1.1–1.4 s**; same-EP relay report ~1 s. Device leg fast and reliable ⇒ mesh/target-side per your decision rule; carried to the existing mesh/routing investigation (with the Sep-4 `ROUTE_ERROR_MANY_TO_ONE_ROUTE_FAILURE` precedent). Not reproduced further; no cycle spent.

### 4. Evidence files (pushed, branch `executor/ts0726-v6-software-live-2026-09-03`)
`accept/raw-logs/unsupported-attr-scan.txt` (full 16-pattern dump), `accept/LATENCY-ERROR-CAPTURE.md` (classification table incl. the POLL_ON_MESSAGE refinement), `accept/unsupported-attr-scan.js` + `accept/battery2.js` (repro tools), `accept/raw-logs/battery-check-075159Z.json` (state cited in §1).

### 5. What remains for closure
Items 1–6 of the audit: all addressed and banked. HA v2 staged on current main as `76bbecd` (local, tested, scope-grepped — proof doc banked). **The only outstanding request is (b): deploy go for HA v2.** On your word: push branch → deploy → live reconcile-scope verification → final readback battery → STATUS/ledger → close #8.
