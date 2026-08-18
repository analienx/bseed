# Project status

Last Supervisor update: **2026-08-18**.

## Goal

Add reliable BL0937-based power monitoring to BSEED `_TZ3000_b28wrpvx` / `TS011F-BS-PM` while preserving normal socket behavior and a proven OTA recovery path.

Target measurements: RMS voltage, RMS current, active power, cumulative imported energy, and standard Zigbee reporting for Zigbee2MQTT/Home Assistant.

## Source-confirmed upstream state

Pinned upstream main: `romasku/tuya-zigbee-switch@bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702`.

Upstream PR #314 remains source material for Telink GPIO pulse counters, not a complete PM implementation. Pinned PR head: `47611b7d9d4b782556392416769fdb24226a8302`.

## Hardware evidence

User PCB photographs identify Belling `BL0937`, `R001` current shunt and Tuya ZTU/Telink hardware. Exact target mappings remain unknown:

| Signal | BL0937 pin | State |
|---|---:|---|
| CF | 6 | exact ZTU/Telink GPIO UNKNOWN |
| CF1 | 7 | exact ZTU/Telink GPIO UNKNOWN |
| SEL | 8 | exact ZTU/Telink GPIO UNKNOWN |

## OTA/recovery invariants now implemented

Hard policy: `policy/OTA_REVERSIBILITY.md`.

Locked BSEED custom OTA identity:

- manufacturer code `4417` / `0x1141`;
- image type `43556` / `0xAA24`.

Implemented Supervisor tooling:

- `scripts/ota_guard.py` parses Zigbee OTA headers, hashes artifacts and rejects recovery-identity drift;
- `scripts/candidate_gate.py` blocks PM-on-by-default builds, recovery-critical changes, missing/mismatched rollback artifacts and failed offline checks;
- `scripts/new-candidate.ps1` creates a local-only guarded candidate workspace;
- `.github/workflows/supervisor-policy.yml` compiles tooling and runs safety/unit tests;
- `tests/test_safety_tooling.py` exercises malformed OTA, size/identity/hardware-range changes, rollback hashes and recovery-surface violations;
- `docs/RECOVERY_RUNBOOK.md` defines OTA-first recovery and emergency SWS boundaries.

The tooling test suite was executed by the Supervisor before publication: **9 tests PASS**.

## Empirical development model

Hard policy: `policy/EMPIRICAL_DEVELOPMENT.md`.

Physical claims progress:

`UNKNOWN -> HYPOTHESIS -> OFFLINE_VALIDATED -> DEVICE_OBSERVED -> REPEATED -> ACCEPTED`

Implemented:

- `templates/experiment.json` for pre-registering hypotheses/stimuli/observables/abort criteria;
- `scripts/record-observation.py` for timestamped raw CF/CF1/SEL + device/reference observations.

Unit tests can reject bad software behavior but cannot establish board pinout, BL0937 scaling, calibration or low-load behavior.

## Blocking inputs

Before first diagnostic target firmware:

- [ ] one exact physical test socket/revision selected;
- [ ] CF exact ZTU pin + Telink GPIO + resistance;
- [ ] CF1 exact ZTU pin + Telink GPIO + resistance;
- [ ] SEL exact ZTU pin + Telink GPIO + resistance;
- [ ] annotated mapping photo;
- [ ] sanitized Zigbee2MQTT metadata;
- [ ] exact current known-good custom firmware/OTA baseline identified;
- [ ] known-good rollback/reinstall artifact obtained and hash recorded;
- [ ] current custom-to-custom OTA behavior documented;
- [ ] wired SWS emergency recovery availability documented before higher-risk candidate work.

## Phase state

`PHASE 0 — HARDWARE + RECOVERY BASELINE` = **ACTIVE**.

Issue #3 collects hardware mapping/metadata only; it does not authorize firmware flashing.

## First diagnostic candidate requirements

After #3:

1. Supervisor reviews mapping and upstream PR #314;
2. diagnostic PM code is implemented with **PM disabled by default**;
3. recovery-critical surfaces remain unchanged;
4. candidate + known-good rollback artifacts pass OTA/candidate guards;
5. first OTA canary proves boot/rejoin/relay/button/LED/OTA liveness with PM disabled;
6. actual target performs candidate -> known-good -> candidate OTA round trip;
7. only then is raw CF observation enabled;
8. CF1/SEL, calibration, clusters, energy and persistence advance empirically one stage at a time.
