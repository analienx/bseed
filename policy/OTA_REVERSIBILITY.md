# OTA reversibility and recovery policy

Status: **MANDATORY / HARD GATE**

This policy governs every firmware experiment on BSEED `_TZ3000_b28wrpvx` / `TS011F-BS-PM` and must be read together with `policy/BRICK_THREAT_MODEL.md`.

## Core rule

No experimental firmware may be offered to the Executor unless the Supervisor has evidence that:

1. the exact target/canary is the confirmed BSEED PM hardware and PCB revision;
2. the current known-good firmware is preserved as an exact **forced/reinstall** OTA artifact with a recorded SHA-256;
3. that exact known-good forced artifact has already passed an **LKG self-reinstall drill on the canary while it is still known-good**;
4. a verified full-flash backup exists locally and emergency unpowered SWS readback/recovery access has been proven before experimental flashing;
5. the candidate is a structurally valid Zigbee OTA **and** structurally valid Telink payload for the same custom-firmware identity and startup scheme;
6. the candidate contains the exact frozen BSEED base config `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;`;
7. the candidate source does not modify a recovery-critical surface;
8. device-config writes and base GPIO changes are prohibited;
9. offline build/stub/policy/source checks pass;
10. experimental PM behavior is disabled by default after every reboot during discovery;
11. the live preflash state gate passes immediately before authorization;
12. the first live candidate proves boot, Zigbee rejoin, relay/button/LED baseline and OTA liveness before PM is enabled;
13. candidate → known-good → same-candidate OTA rollback round trip is empirically proven before PM activation.

A successful compile, OTA file generation or simulator test is never sufficient authorization to flash.

## Important limitation

`OTA-reversible` is a workflow property, not an absolute guarantee. A bad application may fail before Zigbee/OTA becomes available. The project therefore treats any state requiring the enclosure to be opened for recovery as a **brick-class prevention failure**, even if SWS can ultimately restore it.

Routine development is OTA-only. Wired SWS is emergency recovery, performed only with the socket completely disconnected from mains and loads.

## Frozen recovery-critical surfaces

Ordinary PM work must not alter:

- `device_db.yaml` / the existing BSEED base config and board role;
- bootloader/boot handoff/startup markers;
- Telink flash slot addresses, maximum image size or linker/start layout;
- `src/telink/ota_reformating/**` and RAM flash write/erase/status code;
- Telink `main.c` early-boot behavior;
- OTA client/cluster implementation and callback;
- OTA manufacturer code or custom firmware image type;
- Zigbee radio/network initialization required to rejoin;
- config/NVM parsing and existing NVM item layout;
- reset/factory-reset path;
- watchdog/early-boot behavior needed for stable startup;
- code required to receive/apply the next OTA.

`scripts/recovery_surface_guard.py` enforces these source boundaries. Any legitimate need to change a protected surface becomes a separate `[SUPERVISOR][HIGH-RISK][RECOVERY-INFRA]` project and is never combined with PM feature work.

## Locked target identity

- board: `WALL_OUTLET_BSEED_TS011F_PM`;
- manufacturer/model: `b28wrpvx` / `TS011F-BS-PM`;
- MCU: ZTU / Telink TLSR8258;
- role: router;
- base config: `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;`;
- OTA manufacturer code: `4417` (`0x1141`);
- custom firmware image type: `43556` (`0xAA24`).

Do not assume image type uniquely identifies the physical board. A candidate index is isolated to one project-local canary device and automatic/bulk OTA is disabled.

## Device-config immutability

The writable Basic-cluster device config is a recovery-critical interface because it is persisted to NVM, applied during boot, controls GPIO assignments and can alter OTA image type through an `i...` entry.

Therefore **writing `device_config` is prohibited during all BSEED PM experiments**. PM CF/CF1/SEL configuration must be implemented separately and must not mutate the established base string.

## Candidate gates

### R0 — known-good recovery baseline

Before first experimental OTA:

- identify exact canary and PCB revision;
- record current custom firmware version/build and exact config;
- obtain exact known-good forced/reinstall OTA file;
- parse it with the current `ota_guard.py`;
- record SHA-256 and source/release;
- capture current Zigbee2MQTT converter/index/OTA state;
- preserve/verify a full flash backup;
- prove unpowered SWS readback/recovery access;
- perform the **LKG self-reinstall drill** using the exact rollback file;
- after reinstall, verify known-good version, rejoin, relay/button/LED and OTA liveness.

Failure of any item => experimental flashing is blocked.

### R1 — artifact integrity

`ota_guard.py` must validate:

- Zigbee OTA magic/header/lengths/optional fields;
- manufacturer/image type;
- one firmware sub-element with correct length;
- Telink inner image magic;
- embedded firmware size and `<= 0x40000` OTA-slot limit;
- Telink CRC;
- startup flag unchanged from LKG;
- outer/inner version consistency or explicit forced mode;
- exact frozen BSEED config present exactly once.

### R2 — source and candidate integrity

Before target flash:

- immutable clean source commit;
- `recovery_surface_guard.py` PASS;
- firmware build PASS;
- upstream stub tests PASS;
- project policy tests PASS;
- PM disabled by default;
- no recovery-critical changes;
- no device-config/base-GPIO/NVM-schema changes during current development phases;
- exact candidate and rollback hashes recorded;
- `candidate_gate.py` PASS.

### R3 — live preflash gate

Immediately before a flash proposal, `preflash_gate.py` must PASS. It verifies exact target identity, recovery files, LKG drill evidence, SWS/backup proof, normal-device baseline, OTA liveness, converter/index state, isolated/manual OTA, stable power, closed enclosure, no connected load/automation interference, and absence of reset anomalies.

### R4 — OTA canary

One designated socket only. Install candidate by OTA. After reboot **PM remains disabled**.

Verify stable boot/uptime, rejoin, relay, physical button, LEDs, Zigbee command response and OTA-client liveness. Any failure => stop; do not activate PM and do not improvise another image.

### R5 — candidate rollback round trip

Before first PM activation:

1. OTA install exact known-good forced/reinstall artifact.
2. Verify expected LKG version, rejoin, relay/button/LED and OTA liveness.
3. OTA reinstall the exact same candidate artifact/hash.
4. Repeat R4 health verification.

Only this target-device round trip promotes candidate recovery from assumed to proven.

### R6 — runtime PM activation

During discovery:

- PM boots disabled every time;
- PM activation is manual and volatile;
- PM can run only after normal Zigbee/OTA health is already established;
- a PM failure/reboot returns to disabled state;
- relay and OTA operation do not depend on successful PM initialization;
- first activation adds one hardware risk dimension at a time: CF, then CF1, then SEL.

### R7 — persistence/release

PM persistence/NVM is forbidden until raw acquisition/calibration/cluster behavior is proven. When persistence is later introduced it requires its own NVM review, a new non-colliding item, safe defaults/integrity checking, bounded writes, and another rollback round trip proving the older LKG remains valid.

## Candidate rollback bundle

Every flashable candidate locally contains or references:

- exact candidate OTA and SHA-256;
- exact source commit;
- schema-2 `candidate_manifest.json`;
- `ota_guard` report;
- `recovery_surface_guard` report;
- `candidate_gate` report;
- live `preflash_gate` report;
- LKG baseline manifest;
- exact forced/reinstall rollback OTA and SHA-256;
- LKG self-reinstall evidence;
- verified full-flash backup/hash;
- emergency SWS recovery evidence;
- exact OTA procedure and post-rollback verification checklist.

Firmware/raw backups remain local or in explicitly approved CI artifacts; do not casually commit them.

## Stop conditions

Stop further flashing when any guard fails, identity/config differs, OTA stops responding, the device fails to rejoin, reset loops occur, relay/button/LED behavior changes unexpectedly, rollback/backup cannot be hash-verified, the experiment violates its pre-registration, or any abnormal electrical/thermal behavior appears.

A stopped experiment is evidence. Do not improvise.

## Flash authorization

A firmware flash approval must begin exactly:

`APPROVED / OTA-CANARY`

and name candidate ID/stage, exact source commit, candidate path/hash, rollback path/hash, canary ID, the four guard results, LKG self-reinstall evidence, permitted actions/observations, abort conditions and whether PM activation is forbidden or allowed.
