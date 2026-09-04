## EXECUTOR status — root cause of "silent presses" found + operator-authorized binding restore; STOPPED per operator before HA v2

Pausing on operator instruction ("stop and write supervisor"). No device mutation is in flight. Z2M `log_level` restored to `info` (proven via config readback). Summary is evidence-only; I explicitly retract an earlier wrong conclusion of mine.

### 1. Root cause (NOT a V7 regression)

The overnight **rejoin** (nwk `24677 → 17007`, Sep-3→4) wiped the device's **entire** binding table + configured reportings:
- **Before** (Sep-2 baseline `v6-software-live-2026-09-03/baseline/bridge-before.json` and `transition/bridge-post-v6.json`, byte-identical): **20 bindings + 10 configured reportings** across EP1–EP6.
- **After** (today): `bridge/devices` showed `bindings: []` and `configured_reportings: []` on **all six** endpoints, no group membership.

So "presses produce no coordinator traffic / no `action` in exposes" was **expected fallout of the missing multistate→coordinator reporting**, not the device misbehaving. **I retract my earlier "network-level acceptance failure" framing** — that premise was wrong and I'm sorry for the noise.

### 2. Operator-authorized topology repair (binding restore)

The **operator explicitly authorized** programmatic restore (chat: "I restore programmatically (override)"). I re-added **exactly** the pre-rejoin table, recovered from the Sep-2 capture — no invented targets, no deletions, no unbinds:
- 10 `bind` requests (coordinator EP1 for multistate/onOff/level on EP1/2/3; onOff/level on relay EP4/5/6; `switch_left→LivingRoomLinearDimmer/11` onOff+level; `switch_left→self EP4`; `switch_middle→group 25` onOff+level; `switch_middle→self EP5`).
- 6 `configure_reporting` (multistate presentValue 0/65000/1 on EP1/2/3; onOff 0/300/0 on EP4/5; onOff 0/65000/1 on EP6).
- **Result: 16/16 `status: ok`.** Readback on `bridge/devices`: EP1=6, EP2=6, EP3=3, EP4=2, EP5=2, EP6=1 bindings — **exact match** to pre-rejoin. Coordinator is reachable on all six switch/relay endpoints.
- Two pre-rejoin relay entries were `attr0`-labelled on `genOnOff`; I treated them as **redundant with the explicit `onOff` reporting** and restored the `onOff` reporting only. Flag if you want the raw `attr0` form reproduced instead.

### 3. V7 evidence banked this session (raw debug log, endpoint-attributed)

- **RIGHT master-gate (ruling steps 5/6): PASS.** One operator RIGHT short-press moved `relay_right` EP6 `onOff 1→0` exactly once; `0xff05` RIGHT stayed `0` (Never/disabled) before and after; the whole press window contained **zero** outbound `genOnOff`/`genLevelCtrl` bound commands from the dimmer (only a routine `commandQueryNextImageRequest` at 22:34). This is the decisive proof that V7's early-return gate fires at `binded_mode==DISABLED`.
- **MIDDLE bound control (ruling steps 3/4): PASS, fully captured post-restore.** `switch_1` shows clean short-press `commandOn`/`commandOff` (single actuations) and hold→release `commandMoveWithOnOff {rate:44}` → `commandStopWithOnOff`, plus multistate press/long_press/release. `action` events republished live.
- **Config integrity (live reads):** `0xff05 = 3 / 3 / 0` (L/M Short press, R disabled); L/M mains policy = "Always on"; R = "Follow logical state"; `update.installed_version = 285356041` (V7). Local relay/LED control on all three gangs confirmed by operator + reads.

### 4. Open items — need your ruling before I touch the device or HA again

- **(a) Final resting state NOT met right now.** Last read (23:21): EP4=0, EP5=1, EP6=1 — **RIGHT is resting ON**, not the required logical/physical/LED OFF. I stopped before correcting. One more RIGHT short-press (or an authorized SET) is needed to land the required OFF/OFF/OFF.
- **(b) MIDDLE is also ON (EP5=1)** from the last acceptance toggle — likely should return OFF for a clean resting state; confirm intent.
- **(c) LEFT bound-target traffic** (`EP1→LivingRoomLinearDimmer/11`) was restored but not exercised in a captured press this session (only EP2 was pressed on-camera). Do you require one LEFT press to confirm the LinearDimmer actually actuates, or is restoring the documented pre-rejoin binding sufficient?
- **(d) Probe note (non-fatal):** `genOnOffSwitchCfg` attribute `0xff03` (65283, mains policy) reads **time out / UNSUPPORTED** on this firmware; policy state must be sourced from the runtime store, not a live 0xff03 GET. Recommend we record this so future probes stop attempting it.

### 5. NOT done (awaiting your go)

HA v2 deploy (`analienx/home-assistant-stack` @ `9472e5b2`) — **not started**, per operator stop. Ledger close-out and issue #8 closure also held.

**Evidence dir:** `devices/ts0726-3bs-livedimmer/inventory/v6-production-2026-09-04/accept/` — `restore-bindings.js`, `restore-result.json` (16/16 ok), `bindings-dump.js` (before/after), `accept-baseline.js`, `live-relay-probe.js`, `grep-device-log.js`, `set-loglevel.js`.

Requested: a short ruling on 4(a–d) and whether to resume the acceptance tail + HA v2, or hold.
