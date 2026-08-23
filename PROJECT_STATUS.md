# Project status

Last Supervisor update: **2026-08-23**.

## Goal

Restore reliable voltage/current/power/energy monitoring on BSEED `_TZ3000_b28wrpvx` / custom `b28wrpvx` / `TS011F-BS-PM` while preserving the custom firmware's good routing/binding and existing socket controls.

For this project, requiring the socket to be opened to restore ordinary OTA update capability is a **brick-class failure**, even if emergency SWS recovery can ultimately restore it.

## Implementation source — no longer a from-scratch PM port

Original Romasku provenance remains pinned:

- `romasku/tuya-zigbee-switch@bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702`
- upstream GPIO-counter precursor PR #314 head: `47611b7d9d4b782556392416769fdb24226a8302`

The implementation source for the first canary is now the later hardware-tested fork:

- `HobboRobin/tuya-zigbee-switch-with-metering@8b8cc4924a353b35880666f7b48f0afbee89eb17`
- release lineage: 1.2.5
- exact provenance: `metering-source.lock.json`

That fork already contains the Telink hardware pulse-counter backend, BL0937/HLW8012-compatible pulse metering, Electrical Measurement + Smart Energy Metering clusters, diagnostics, calibration, energy accumulation/persistence and a matching Zigbee2MQTT converter.

## Frozen BSEED control/OTA identity

```text
manufacturer/model: b28wrpvx / TS011F-BS-PM
role: router
MCU: ZTU / Telink TLSR8258
runtime device_config: b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;
network/status LED: PC3
button: PB5
relay: PD2
relay indicator: PB4
OTA manufacturer: 4417 / 0x1141
OTA image type: 43556 / 0xAA24
```

The canary preserves that runtime `device_config` byte-for-byte. No device-config write or factory reset is required to activate PM.

## Power-meter mapping — source-confirmed

Downstream commit `37de8385e5a661505ac9bc8d47b2e7791c7a5493` records the exact `_TZ3000_b28wrpvx` mapping as hardware-verified:

| Signal | BL0937 function | TLSR8258 GPIO | State |
|---|---|---|---|
| CF | active-power pulse | **PA1** | SOURCE_CONFIRMED |
| CF1 | RMS current/voltage pulse | **PC2** | SOURCE_CONFIRMED |
| SEL | CF1 selector | **PB1** | SOURCE_CONFIRMED |

Hardware-measured downstream starting calibration:

```text
voltage multiplier = 161460
current multiplier = 144679
power multiplier   = 16989
```

These remain generic firmware defaults. The exact-canary runtime campaign later accepted active-power/current calibration against the Shelly reference; those device-specific values are evidence, not new generic firmware constants.

## Accepted exact-canary campaign

`LivingRoomSocketWifiLeft` is the exact `b28wrpvx / TS011F-BS-PM` canary. The assembled-device campaign was accepted in the control ledger ([issue #1 comment](https://github.com/analienx/bseed/issues/1#issuecomment-5385101150)):

- protection-enabled descendant: repeated soft and hard/peak over-power trips, alarm publication, autonomous relay-off and settings restoration;
- active power/current calibration: accepted against the Shelly phase-B differential, with post-calibration power error approximately +0.21% at the kettle load;
- no-load suppression: zero current and zero power when the relay is off;
- power factor, apparent power and reactive-power derivation: observed and reconciled for the accepted load;
- voltage: do not bake the no-load Shelly offset into generic firmware; loaded local/reference values are close, while no-load voltage remains a follow-up;
- optional reboot-persistence and 325 W linearity checks are non-blocking follow-ups.

The repository task is now productionization only: finish the exact-target Zigbee2MQTT canonical-unit/readback fix, pin this evidence, and leave PR #6 **DRAFT** until Supervisor merge review. No further physical or OTA action is authorized by this state.

## Exact-canary Class A — issue #3

Issue #3 is now a **confirmation**, not a discovery task. Coding/offline builds are not blocked by it.

Before flashing, one selected physical canary still has to confirm it is the same BL0937/ZTU implementation and confirm the source-known `PA1/PC2/PB1` routes, logic power/ground, collision-free control pins and recovery points on that exact PCB.

```text
MAPPING_SOURCE_CONFIDENCE = CONFIRMED
CODING_BLOCKED_BY_MAPPING = NO
OTA_BLOCKED_BY_EXACT_CANARY_CONFIRMATION = YES
```

No energized open-PCB probing is allowed.

## Recovery Class A — issue #5

Recovery proof remains mandatory before experimental OTA, but read-only preparation can proceed in parallel after the exact canary is selected.

Required on that same canary:

- exact known-good custom-to-custom FORCE/reinstall OTA + hash;
- successful LKG self-reinstall and post-reinstall relay/button/LED/rejoin/OTA health;
- unpowered SWS readback;
- reproducible full-flash backup + hash;
- documented SWS/RST/3V3/GND recovery points;
- final reassembled known-good state.

## First project canary design

Supervisor branch: `agent/adopt-proven-metering`  
Draft implementation PR: **#6** into `agent/bootstrap-bl0937-pm`.

The candidate does **not** add `EPA1C2B1` to the persisted/compiled BSEED config. Converted devices may retain their old `device_config` in NVM across OTA, so relying on a changed default would be unreliable.

`scripts/apply-metering-overlay.py` makes only the reviewed source changes needed for the canary:

1. restore the BSEED default config to the current project value:
   `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;`
2. in `config_parser.c`, if the parsed identity is exactly `b28wrpvx` + `TS011F-BS-PM` and no meter token was supplied, initialize the proven pulse backend on `PA1/PC2/PB1`;
3. reset the relay-protection policy on every config reparse; the baseline overlay disables PM-derived overload relay actuation for the exact BSEED identity, while the separately gated protection-enabled descendant opts into the already-reviewed policy.

The first canary also omits downstream PWM LED flags, preserving existing PC3/PB4 on/off behavior.

## Reproducible source/build controls

- `metering-source.lock.json` pins source, mapping, calibration, reference artifacts and converter provenance.
- `scripts/apply-metering-overlay.py` refuses an unexpected source revision or dirty apply target.
- `scripts/metering_overlay_guard.py` regenerates the two expected modified files from pinned Git blobs and requires byte-for-byte equality.
- `tests/test_metering_overlay.py` checks overlay/idempotence/config invariants and policy reset.
- `.github/workflows/build-metering-canary.yml` runs as safe offline PR CI and via manual dispatch; it builds only `OUTLET_BSEED_PM_TS011F_b28wrpvx` as a Telink router.
- PR builds check out the **actual supervisor head SHA**, not GitHub's synthetic merge ref.
- the workflow installs only the Telink toolchain, runs the downstream Makefile test prerequisites, rechecks the exact source overlay, then builds the target.
- normal + forced custom-to-custom OTA files are validated with `ota_guard.py` for CRC, Telink payload, exact base config and OTA identity `4417/43556`.
- `build-provenance.json` binds supervisor head SHA, downstream commit, overlay/guard hashes, converter hash/blob, PA1/PC2/PB1, preserved config and normal/forced OTA hashes/versions.
- builds are serialized per PR/ref with stale runs cancelled.
- the pinned downstream `switch_custom.js` source Git blob is `53b7c7bc66df95ca0316a98398f37bcee04a2a23`; CI applies the deterministic converter patch and gates the derived blob `c8d03d1fa2d5ef125e720a7878908a4f5a63992e`. The patch preserves write scaling, repairs older raw-wire overload readback, and keeps the additional `STATE_GET` exposes scoped to `TS011F-BS-PM`.
- producing an artifact is **not** flash authorization.

## Metering implementation audit notes

Reused downstream behavior already present:

- Telink hardware GPIO counters for CF/CF1;
- 5 s accurate pulse sample window and SEL multiplexing;
- raw `freq_cf`, `freq_cf1`, `sel_state` diagnostics;
- voltage/current/active power;
- cumulative energy;
- standard Zigbee Electrical Measurement and Smart Energy Metering clusters;
- runtime calibration + persisted multipliers;
- Z2M reporting;
- apparent power, total PF and reactive-power magnitude derivation.

The implicit BSEED meter hook executes before endpoint construction, so the standard energy clusters are registered on endpoint 1 in the same boot pass.

Known follow-up before fleet deployment: downstream energy persistence checkpoints accumulated Wh every five minutes through Telink NVM. This is acceptable for the first functional canary but needs a separate endurance/wear review after metering is validated.

## Machine-enforced gates

### 1. Hardware/recovery Class A

`scripts/class_a_gate.py` requires exact project-canary identity, PCB/recovery evidence and zero unknown Class A facts before experimental OTA.

### 2. OTA artifact

`scripts/ota_guard.py` validates Zigbee OTA structure, BSEED identity, Telink payload magic/size/CRC/startup/version and the preserved base config.

### 3. Source

- legacy Romasku candidates: `scripts/recovery_surface_guard.py`;
- adopted metering canary: `scripts/metering_overlay_guard.py`.

### 4. Candidate

- legacy staged candidates: `scripts/candidate_gate.py`;
- adopted metering: `scripts/metering_candidate_gate.py` + `templates/metering-candidate-manifest.json`.

The adopted gate now binds the local reviewed overlay scripts, CI `build-provenance.json`, exact source-guard report, candidate hash, source converter blob, derived converter blob/hash and the proven rollback/baseline. All offline checks must be `PASS`.

`scripts/new-metering-candidate.ps1` prepares the local evidence workspace only; it never performs OTA.

### 5. Live preflash

`scripts/preflash_gate.py` still requires a zero-unknown `class_a_gate.py --mode all` report plus fresh healthy canary state, exact rollback evidence and no pending device-config mutation before an OTA proposal can be considered.

## Revised deployment ladder

1. **Offline implementation/build** — pinned downstream PM stack + reviewed overlay.
2. **Exact-canary confirmation** — issue #3 confirms the chosen BL0937/ZTU socket and PA1/PC2/PB1 routes.
3. **Recovery proof** — issue #5 proves LKG self-reinstall + unpowered SWS/full-flash recovery on the same canary.
4. **Source/artifact/candidate gates** — exact provenance, identity/config/hash, converter and rollback all PASS.
5. **One assembled-device canary OTA** — completed on the exact canary under the control ledger; no exposed PCB and no fleet action.
6. **Functional/protection validation** — completed and accepted for the exact canary, including repeated relay-off protection behavior.
7. **Calibration/metrology validation** — active power/current/PF/Q and no-load zero behavior accepted; voltage offset, reboot persistence and optional 325 W linearity remain bounded follow-ups.
8. **Repository productionization** — converter canonical-unit/readback fix, evidence pinning and PR #6 review; only then consider one hardware-equivalent additional canary and broader rollout.

## Current state

```text
SOURCE_MAPPING          = CONFIRMED (PA1 / PC2 / PB1)
PM_IMPLEMENTATION       = REUSED + AUDITED DOWNSTREAM
SUPERVISOR_CODING       = IMPLEMENTED; REPO PRODUCTIONIZATION IN PROGRESS (PR #6)
POLICY_CI               = PASSING ON CURRENT ITERATIONS
EXACT_CANARY_CLASS_A    = OPEN (#3; confirmation, not discovery)
RECOVERY_CLASS_A        = OPEN (#5; may proceed in parallel)
CANARY_BUILD_PIPELINE   = IMPLEMENTED; PR + MANUAL OFFLINE CI
METERING_CANDIDATE_GATE= IMPLEMENTED + PROVENANCE-BOUND
CANARY_RUNTIME          = ACCEPTED (protection + metrology; issue #1 ledger)
Z2M_CONVERTER            = CANONICAL-UNIT READBACK FIX + DETERMINISTIC TESTS
PR6                     = DRAFT; READY FOR SUPERVISOR MERGE REVIEW AFTER CLEANUP
EXPERIMENTAL_OTA        = NOT AUTHORIZED
```

No experimental firmware flash is currently authorized.
