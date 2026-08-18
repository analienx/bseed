# Project status

Last Supervisor update: **2026-08-18**.

## Goal

Add reliable BL0937 power monitoring to BSEED `_TZ3000_b28wrpvx` / custom `b28wrpvx` / `TS011F-BS-PM` while preserving normal socket behavior and keeping every experimental step recoverable through the already-working OTA path.

For this project, requiring the socket to be opened to restore update capability is a **brick-class failure**, even if emergency SWS recovery can ultimately restore it.

## Source-confirmed upstream state

Pinned upstream main: `romasku/tuya-zigbee-switch@bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702`.

Upstream PR #314 remains source material for Telink GPIO counters, not a complete or pre-approved PM implementation. Pinned PR head: `47611b7d9d4b782556392416769fdb24226a8302`.

Known BSEED PM base profile:

```text
board: WALL_OUTLET_BSEED_TS011F_PM
manufacturer/model: b28wrpvx / TS011F-BS-PM
role: router
MCU: ZTU / Telink TLSR8258
config: b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;
OTA manufacturer: 4417 / 0x1141
OTA image type: 43556 / 0xAA24
```

## Hardware evidence

User PCB photographs identify Belling `BL0937`, `R001` current shunt and Tuya ZTU/Telink hardware. Exact target mappings remain unknown:

| Signal | BL0937 pin | State |
|---|---:|---|
| CF | 6 | exact ZTU/Telink GPIO UNKNOWN |
| CF1 | 7 | exact ZTU/Telink GPIO UNKNOWN |
| SEL | 8 | exact ZTU/Telink GPIO UNKNOWN |

Phase 0 therefore remains active; no PM GPIO may be guessed.

## Brick-prevention policy implemented

Hard policies:

- `policy/BRICK_THREAT_MODEL.md` — exhaustive known brick/soft-brick threat inventory and mandatory P0→P8 deployment ladder;
- `policy/OTA_REVERSIBILITY.md` — OTA/recovery invariants and rollback proof;
- `policy/EMPIRICAL_DEVELOPMENT.md` — empirical evidence ladder and one-variable-at-a-time experiments.

Key rule: `UNKNOWN` recovery state means **DO NOT FLASH**.

### Threats explicitly covered

The threat model includes wrong device/revision/MCU/role/config, runtime device-config mutation, OTA identity drift, malformed Zigbee/Telink artifacts, CRC/length/slot overflow, early-boot flash relocation changes, OTA/network path regression, crashes/watchdog loops/task starvation/timer conflicts, interrupt/report storms, unsafe GPIO drive/SWS-RST conflicts, NVM migration/persistence hazards, flash wear, wrong OTA target/index, bulk update, stale hashes, power/link failures and executor improvisation.

## Machine-enforced gates implemented

### 1. Artifact gate — `scripts/ota_guard.py`

Validates:

- Zigbee OTA header/length/optional fields;
- exact BSEED OTA identity;
- one valid firmware sub-element;
- Telink inner magic;
- embedded firmware size and `<= 0x40000` slot bound;
- Telink CRC;
- startup flag continuity;
- inner/outer firmware version relationship;
- exact frozen BSEED base config present once.

### 2. Source-diff gate — `scripts/recovery_surface_guard.py`

Ordinary PM work is rejected if it changes recovery-critical upstream surfaces, including BSEED `device_db.yaml`, Telink `main.c`, OTA client/network path, NVM/config/reset code or `src/telink/ota_reformating/**`.

### 3. Candidate gate — `scripts/candidate_gate.py`

Requires schema-2 candidate manifest, exact board/MCU/router/config identity, exact candidate/rollback hashes, forced LKG rollback artifact, source-guard evidence, offline build/stub/policy PASS, PM disabled by default and zero recovery/base-config/base-GPIO/NVM-schema changes during current phases.

### 4. Live device gate — `scripts/preflash_gate.py`

Immediately before a flash proposal, requires fresh evidence for exact canary/PCB, current healthy OTA/network/converter state, isolated/manual OTA, relay/button/LED baseline, stable power/link, closed enclosure, no load/automation interference, rollback hash, LKG self-reinstall evidence, verified full-flash backup and unpowered SWS readback/recovery evidence.

### Supporting tooling

- `templates/candidate-manifest.json` — schema 2;
- `templates/preflash-state.json`;
- `scripts/new-candidate.ps1` — creates a local guarded candidate workspace and documents the entire gate chain;
- `docs/RECOVERY_RUNBOOK.md` — prevention-first recovery procedure;
- `templates/experiment.json` and `scripts/record-observation.py` — empirical raw observation workflow;
- `.github/workflows/supervisor-policy.yml` — compile/self-test/unit-test enforcement.

## Automated validation

Expanded brick-prevention tests include malformed outer OTA, total-size mismatch, invalid sub-element, Telink magic/CRC failure, outer/inner version mismatch, oversized image, missing frozen config, OTA identity/startup-flag/hardware-range drift, PM-on-by-default, recovery-source changes, board-role drift, bad hashes, non-forced rollback and live preflash failures.

GitHub Actions completed successfully for:

- expanded prevention test commit `154173f74c27db6e950f44d959f27be810a0f3e6`;
- CI wiring commit `aa82105e997e1ded3857635f1fc3f191e78b091c`, which also explicitly compiles/self-tests `ota_guard`, `candidate_gate`, `recovery_surface_guard` and `preflash_gate`.

## New mandatory recovery proof before experimental code

Before the first experimental candidate, the exact canary must pass:

1. **LKG self-reinstall drill** — install the exact known-good forced/reinstall OTA onto the still-known-good device and re-verify version/rejoin/relay/button/LED/OTA;
2. **full-flash backup** — read and SHA-256 verify a local backup using the unpowered wired path;
3. **SWS recovery readback** — prove actual recovery access on this canary, not just theoretical pad availability.

This does not make wired recovery the normal path; it proves the emergency path before risk is introduced.

## Deployment ladder

1. P0 exact target + recovery baseline;
2. P1 LKG self-reinstall drill;
3. P2 no-functional-change pipeline candidate + candidate→LKG→candidate round trip;
4. P3 PM plumbing compiled but inactive;
5. P4 volatile activation control only, touching no PM GPIO;
6. P5 confirmed CF input/counter only;
7. P6 confirmed CF1 input/counter;
8. P7 confirmed SEL output;
9. P8+ calibration → clusters → energy → persistence → reporting, one risk dimension at a time.

During discovery every reboot returns PM to disabled.

## Current blockers

Before P2 experimental firmware:

- [ ] issue #3: exact canary/PCB identified;
- [ ] CF exact ZTU pin + Telink GPIO + resistance;
- [ ] CF1 exact ZTU pin + Telink GPIO + resistance;
- [ ] SEL exact ZTU pin + Telink GPIO + resistance;
- [ ] annotated mapping photo;
- [ ] sanitized Zigbee2MQTT metadata/current custom firmware identity;
- [ ] exact known-good forced/reinstall OTA artifact obtained locally;
- [ ] LKG self-reinstall drill PASS;
- [ ] full-flash backup + SHA-256 PASS;
- [ ] unpowered SWS readback/recovery PASS.

No experimental firmware flash is currently authorized.
