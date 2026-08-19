# Project status

Last Supervisor update: **2026-08-19**.

## Goal

Restore reliable voltage/current/power/energy monitoring on BSEED `_TZ3000_b28wrpvx` / custom `b28wrpvx` / `TS011F-BS-PM` while preserving the custom firmware's good routing/binding and existing socket controls.

For this project, requiring the socket to be opened to restore ordinary OTA update capability is a **brick-class failure**, even if emergency SWS recovery can ultimately restore it.

## Implementation source — no longer a from-scratch PM port

The original Romasku baseline remains pinned for provenance:

- `romasku/tuya-zigbee-switch@bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702`
- upstream GPIO-counter precursor PR #314 head: `47611b7d9d4b782556392416769fdb24226a8302`

However, the shortest audited implementation path is now the later downstream fork:

- `HobboRobin/tuya-zigbee-switch-with-metering@8b8cc4924a353b35880666f7b48f0afbee89eb17`
- release lineage: 1.2.5
- exact source/provenance is pinned in `metering-source.lock.json`

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

The project canary deliberately preserves that runtime `device_config` byte-for-byte. No device-config write or factory reset is required to activate PM.

## Power-meter mapping — source-confirmed

Downstream commit `37de8385e5a661505ac9bc8d47b2e7791c7a5493` records the exact `_TZ3000_b28wrpvx` mapping as hardware-verified:

| Signal | BL0937 function | TLSR8258 GPIO | Source state |
|---|---|---|---|
| CF | active-power pulse | **PA1** | SOURCE_CONFIRMED |
| CF1 | RMS current/voltage pulse | **PC2** | SOURCE_CONFIRMED |
| SEL | CF1 selector | **PB1** | SOURCE_CONFIRMED |

Downstream hardware calibration for this fingerprint is also available:

```text
voltage multiplier = 161460
current multiplier = 144679
power multiplier   = 16989
```

These values are reused as the canary defaults but remain Class B runtime values until checked against an external reference meter on our exact socket.

## Exact-canary Class A state

Hard policy remains `policy/CLASS_A_CLOSURE.md`.

The important change is that issue #3 is no longer a discovery exercise. The source mapping above is sufficient for coding and offline builds. Before **flashing**, the selected physical canary still has to confirm that it is the same PCB/meter implementation and that PA1/PC2/PB1 do not conflict with the already-proven controls/recovery points.

Therefore:

```text
MAPPING_SOURCE_CONFIDENCE = CONFIRMED
CODING_BLOCKED_BY_MAPPING = NO
OTA_BLOCKED_BY_EXACT_CANARY_CONFIRMATION = YES
```

Existing photographs already identify Belling BL0937, `R001` shunt and ZTU/TLSR8258. Exact-canary confirmation must tie those observations to one chosen socket; it must not involve energized exposed-PCB probing.

## Recovery Class A — issue #5

Recovery proof remains mandatory before experimental OTA, but it does **not** need to wait for new PM coding.

Required evidence on the exact canary:

- exact known-good custom-to-custom FORCE/reinstall OTA + hash;
- successful LKG self-reinstall and post-reinstall relay/button/LED/rejoin/OTA health;
- unpowered SWS readback;
- reproducible full-flash backup + hash;
- documented recovery wiring/points;
- final reassembled known-good state.

Issue #5 can proceed in parallel with final exact-canary pin confirmation.

## First project canary design

Supervisor branch: `agent/adopt-proven-metering`.

The candidate does **not** add `EPA1C2B1` to the persisted/compiled BSEED config. Converted devices may retain their old `device_config` in NVM across OTA, so relying on a changed default would be unreliable and could require an unnecessary NVM write/reset.

Instead `scripts/apply-metering-overlay.py` makes two tightly-scoped source changes to the pinned downstream release:

1. restore the BSEED default config to the existing project value:
   `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;`
2. in `config_parser.c`, when the exact parsed identity is `b28wrpvx` + `TS011F-BS-PM` and no meter token was supplied, initialize the proven pulse meter implicitly on `PA1/PC2/PB1`.

For that exact identity the first canary intentionally **does not connect the downstream overload-protection state machine to the relay**. This prevents PM restoration from also introducing a new automatic relay-actuation policy.

The downstream PWM LED flags are likewise omitted, preserving existing PC3/PB4 on/off behavior.

## Reproducible source/build controls

- `metering-source.lock.json` pins downstream source, mapping, calibration and converter provenance.
- `scripts/apply-metering-overlay.py` refuses an unexpected source revision or dirty apply target.
- `scripts/metering_overlay_guard.py` regenerates the expected two modified files from the pinned Git blobs and requires byte-for-byte equality; an allow-list by filename alone is not sufficient.
- `.github/workflows/build-metering-canary.yml` is manual-only and builds only `OUTLET_BSEED_PM_TS011F_b28wrpvx` as a router.
- the workflow runs downstream tests, validates the exact overlay before and after tests, validates normal + forced OTA structure/CRC/config/identity with `ota_guard.py`, hashes artifacts and records provenance.
- the workflow packages the pinned downstream Zigbee2MQTT `switch_custom.js` converter (Git blob `53b7c7bc66df95ca0316a98398f37bcee04a2a23`) rather than regenerating it from the NVM-preserving config.
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
- Z2M reporting configuration;
- apparent power, total PF and reactive-power magnitude derivation.

Known follow-up item before fleet deployment: current downstream energy persistence checkpoints accumulated Wh every five minutes through Telink NVM. It is acceptable for a first functional canary but should receive a separate endurance/wear review after metering is validated.

## Machine-enforced gates

### 1. Class A gate — `scripts/class_a_gate.py`

Requires exact project canary identity, PCB/recovery evidence and zero unknown Class A facts before experimental OTA.

### 2. Artifact gate — `scripts/ota_guard.py`

Validates Zigbee OTA structure, BSEED OTA identity, Telink payload magic/size/CRC/startup flag/version and the preserved base config.

### 3. Source gate

- legacy Romasku-from-scratch candidates: `scripts/recovery_surface_guard.py`;
- adopted metering canary: `scripts/metering_overlay_guard.py`, which validates pinned downstream + exact reviewed overlay.

### 4. Candidate/live gates

`candidate_gate.py` / `preflash_gate.py` remain the flash-authorization path. Their legacy staged-PM assumptions are being retained for old candidates; the adopted metering canary must not be flashed until its candidate manifest/gate reflects the pinned downstream-overlay provenance and the Class A/recovery gates pass.

## Revised deployment ladder

1. **Offline implementation/build** — reuse pinned downstream PM stack; no hardware execution required.
2. **Exact-canary confirmation** — confirm the chosen socket matches the source-proven BL0937/ZTU board and `PA1/PC2/PB1` mapping.
3. **Recovery proof** — close issue #5 on that same canary, including LKG self-reinstall + unpowered SWS backup/readback.
4. **Artifact/candidate gates** — exact source overlay, OTA identity/config/hash and rollback evidence all PASS.
5. **One assembled-device canary OTA** — no exposed PCB; load disconnected for the update; no fleet/bulk action.
6. **Functional validation** — relay/button/LED/rejoin/OTA first, then CF/CF1/SEL diagnostics and V/A/W.
7. **Calibration/energy validation** — resistive reference points, low-load behavior, accumulated Wh and reboot persistence.
8. **Only after acceptance** — consider PWM LEDs, overload protection, persistence endurance improvements and broader rollout as separate changes.

## Current state

```text
SOURCE_MAPPING       = CONFIRMED (PA1 / PC2 / PB1)
PM_IMPLEMENTATION    = REUSED + AUDITED DOWNSTREAM
SUPERVISOR_CODING    = ACTIVE / NOT BLOCKED BY HARDWARE DISCOVERY
EXACT_CANARY_CLASS_A = OPEN (issue #3, confirmation not discovery)
RECOVERY_CLASS_A     = OPEN (issue #5; may proceed in parallel)
CANARY_BUILD_PIPELINE= IMPLEMENTED, MANUAL ONLY
EXPERIMENTAL_OTA     = NOT AUTHORIZED
```

No experimental firmware flash is currently authorized.
