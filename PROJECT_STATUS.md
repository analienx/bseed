# Project status

Last Supervisor update: **2026-08-19**.

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

## Class A closure state

Hard policy: `policy/CLASS_A_CLOSURE.md`.

Class A means a fact whose wrong value could cause unsafe GPIO drive, wrong-target firmware, hardware damage or loss of OTA/recovery. Class A facts must be made exact before experimental firmware; calibration/timing/filtering remain Class B and are intentionally discovered later at runtime.

### Already source-confirmed Class A invariants

- target board/MCU/router profile;
- frozen base config and existing GPIOs (`D2` relay, `B5` button, `C3` status LED, `B4` indicator);
- OTA identity `4417/43556`;
- Telink `0x40000` OTA slot limit;
- protected early-boot/OTA/NVM/config source surfaces.

### Hardware Class A — issue #3

A-H01..A-H14 must all become `DEVICE_CONFIRMED` on one exact canary. Current status: **OPEN / BLOCKING** because no Executor result has yet closed the exact board-level facts.

Required closure includes exact canary/PCB, runtime identity/config, BL0937 on that canary, BL0937 VDD/GND logic paths, complete CF/CF1/SEL ZTU-pin/TLSR-GPIO/resistance/topology, collision proof against existing GPIOs and SWS/RST/3V3/GND, exact recovery points, and an annotated board map.

### Recovery Class A — issue #5

A-R01..A-R07 must all become `RECOVERY_PROVEN`. Current status: **BLOCKED BY #3**.

Required closure includes exact LKG FORCE artifact/hash, LKG self-reinstall, post-reinstall OTA liveness, actual unpowered SWS readback, reproducible full-flash backup, proven recovery wiring and final reassembled known-good health.

### Machine enforcement

- `templates/class-a-evidence.json` stores the exact canary evidence;
- `scripts/class_a_gate.py` validates hardware/recovery closure and rejects runtime-identity drift, protected GPIO collisions, SWS/RST/3V3/GND pin collisions and incomplete evidence;
- `scripts/preflash_gate.py` now requires a matching `class_a_gate.py --mode all` PASS report with `class_a_unknown_count=0`.

No experimental OTA can therefore pass the preflash gate while a Class A fact remains unknown.

## Hardware evidence already available

Existing photographs identify Belling `BL0937`, `R001` current shunt and Tuya ZTU/Telink hardware. Because earlier photographs may contain more than one board marking/revision, those observations are not promoted to exact-canary Class A closure until issue #3 ties them to the chosen canary.

Exact target mappings remain blocking:

| Signal | BL0937 pin | State |
|---|---:|---|
| CF | 6 | exact ZTU/Telink GPIO BLOCKING_UNKNOWN |
| CF1 | 7 | exact ZTU/Telink GPIO BLOCKING_UNKNOWN |
| SEL | 8 | exact ZTU/Telink GPIO BLOCKING_UNKNOWN |

## Brick-prevention policies

Hard policies:

- `policy/CLASS_A_CLOSURE.md` — dangerous facts must be exact before experiments;
- `policy/BRICK_THREAT_MODEL.md` — known brick/soft-brick threat inventory and deployment ladder;
- `policy/OTA_REVERSIBILITY.md` — OTA/recovery invariants and rollback proof;
- `policy/EMPIRICAL_DEVELOPMENT.md` — empirical evidence ladder and one-variable-at-a-time experiments.

Key rule: `UNKNOWN` Class A/recovery state means **DO NOT FLASH**.

## Machine-enforced gates

### 1. Class A gate — `scripts/class_a_gate.py`

Closes dangerous hardware/recovery facts and validates canary identity plus GPIO/recovery-pin collisions.

### 2. Artifact gate — `scripts/ota_guard.py`

Validates Zigbee OTA structure, exact BSEED identity, Telink payload magic/size/CRC/startup flag/version and frozen base config.

### 3. Source-diff gate — `scripts/recovery_surface_guard.py`

Rejects changes to recovery-critical upstream source/config paths.

### 4. Candidate gate — `scripts/candidate_gate.py`

Requires exact board/MCU/router/config identity, immutable source, verified candidate/rollback hashes, forced LKG rollback and offline checks.

### 5. Live device gate — `scripts/preflash_gate.py`

Requires a zero-unknown Class A report plus fresh healthy canary/OTA/recovery/operational state immediately before a flash proposal.

## Deployment ladder

1. P0 issue #3 closes hardware Class A;
2. P1 issue #5 closes recovery Class A and LKG self-reinstall;
3. P2 no-functional-change pipeline candidate + candidate→LKG→candidate round trip;
4. P3 PM plumbing compiled but inactive;
5. P4 volatile activation control only, touching no PM GPIO;
6. P5 confirmed CF input/counter only;
7. P6 confirmed CF1 input/counter;
8. P7 confirmed SEL output;
9. P8+ calibration → clusters → energy → persistence → reporting, one risk dimension at a time.

During discovery every reboot returns PM to disabled.

## Current blocker summary

```text
CLASS_A_SOURCE   = CONFIRMED
CLASS_A_HARDWARE = OPEN (issue #3)
CLASS_A_RECOVERY = BLOCKED_BY_HARDWARE (issue #5)
EXPERIMENTAL_OTA = NOT_AUTHORIZED
```

No experimental firmware flash is currently authorized.
