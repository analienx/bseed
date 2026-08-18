# OTA reversibility and recovery policy

Status: **MANDATORY / HARD GATE**

This policy governs every firmware experiment on BSEED `_TZ3000_b28wrpvx` / `TS011F-BS-PM`.

## Core rule

No experimental firmware may be offered to the Executor unless the Supervisor has evidence that:

1. the artifact is a structurally valid Zigbee OTA image for the same custom-firmware identity;
2. the current known-good firmware is preserved as an exact rollback/reinstall artifact with a recorded hash;
3. a device-accepted rollback/reinstall path is documented;
4. the candidate does not modify a recovery-critical surface unless a separate high-risk recovery-infrastructure issue explicitly authorizes it;
5. offline checks pass;
6. experimental PM behavior is disabled by default after OTA;
7. the first live gate proves boot, Zigbee rejoin, existing relay/button/LED behavior and OTA liveness before PM is enabled;
8. rollback is empirically round-trip tested before advancing to higher-risk PM stages.

A successful compile is never sufficient authorization to flash.

## Important limitation

`OTA-reversible` is a workflow property, not an absolute guarantee. A bad application can fail before Zigbee/OTA becomes available. Therefore this project minimizes risk by freezing recovery-critical code, keeping an exact known-good artifact, using staged runtime activation, testing rollback on the actual target and maintaining wired SWS as an emergency-only fallback.

Routine development is OTA-only. Wired SWS is not the normal experiment path.

## Frozen recovery-critical surfaces

Ordinary PM work must not alter:

- bootloader or boot handoff;
- flash partition/layout assumptions;
- OTA client/cluster implementation;
- OTA manufacturer code or custom firmware image type;
- Zigbee radio/network initialization required to rejoin;
- device identity used for OTA matching;
- critical Zigbee/NVM storage layout;
- watchdog/early-boot behavior needed for stable startup;
- code required to receive/apply the next OTA.

Any change above requires a separate `[SUPERVISOR][HIGH-RISK]` issue, verified wired recovery, its own rollback plan and no combined PM feature work.

## Locked target OTA identity

For the pinned upstream BSEED profile:

- manufacturer code: `4417` (`0x1141`);
- custom firmware image type: `43556` (`0xAA24`);
- upstream supports custom→custom OTA;
- upstream publishes `*-FORCE.json` / forced artifacts for same-version reinstall and branch/mode switching.

Do not assume that an arbitrary older image is a working rollback simply because an OTA server can present it. The rollback artifact itself must be proven accepted on this target.

## Candidate gates

### R0 — known-good baseline

Before first experimental OTA:

- record current firmware version/build;
- identify the exact known-good OTA/reinstall artifact;
- record SHA-256, size, OTA header and source commit/release;
- identify a proven forced/reinstall route;
- capture current Zigbee2MQTT OTA metadata;
- verify emergency wired SWS recovery availability before higher-risk work.

No known-good rollback artifact => flashing is blocked.

### R1 — artifact packaging

`python scripts/ota_guard.py verify-candidate ...` must PASS against the known-good baseline.

Hard failures include malformed OTA headers, image-size mismatch, manufacturer/image-type changes, unexpected hardware-version constraints and candidate identity drift.

### R2 — offline behavior

Before device flash:

- build PASS;
- unit/simulator tests PASS;
- policy CI PASS;
- PM disabled by default;
- no recovery-critical surface changed;
- exact candidate SHA-256 recorded;
- exact rollback SHA-256 recorded;
- `candidate_gate.py` PASS.

### R3 — OTA canary

Use one designated development socket only. Install candidate by OTA. After reboot **do not enable PM**.

Observe boot/rejoin, stable uptime/reset behavior, sane relay state, physical button, LEDs, Zigbee command response and OTA-client liveness. Failure at any point => stop; PM remains disabled.

### R4 — rollback round trip

Before enabling PM on the first candidate generation:

1. OTA install the exact known-good rollback/reinstall artifact.
2. Verify known-good version, rejoin, relay/button/LED and OTA liveness.
3. OTA reinstall the exact candidate artifact.
4. Repeat R3 health verification.

Only a successful target-device round trip can promote rollback from assumed to proven.

### R5 — runtime PM activation

Experimental PM must be runtime-gated. Preferred design:

- firmware boots with PM disabled;
- PM is enabled only after normal Zigbee health is established;
- activation is reversible without reflashing where practical;
- a PM fault/repeated-reset condition leaves PM disabled on subsequent boot;
- relay control and OTA remain independent of PM.

First activation proves raw observability only; it must not immediately enable calibrated production measurements.

### R6 — staged empirical expansion

Advance one risk dimension at a time:

1. CF raw pulses;
2. CF1 + SEL raw behavior;
3. raw diagnostic reporting;
4. conversion/calibration;
5. standard Zigbee measurement clusters;
6. cumulative energy;
7. persistence;
8. reporting optimization.

Each stage retains the previous proven rollback path.

## Candidate rollback bundle

Every flashable candidate must locally contain or reference:

- exact candidate OTA image and SHA-256;
- source commit;
- `candidate_manifest.json`;
- `ota_guard` report;
- baseline manifest;
- exact rollback/reinstall artifact and SHA-256;
- exact OTA procedure;
- expected post-rollback version;
- post-rollback verification checklist.

Binary firmware remains local or in explicitly approved CI artifacts; do not casually commit it.

## Stop conditions

Stop further flashing when OTA stops responding, the device fails to rejoin, reset loops occur, relay/button behavior changes unexpectedly, the artifact identity changes, rollback cannot be located/hash-verified, observed behavior violates the pre-registered experiment, enclosure/insulation is uncertain, or abnormal heat/odor/sound/smoke/electrical behavior appears.

A stopped experiment is evidence. Do not improvise.

## Flash authorization

A firmware flash approval must begin exactly:

`APPROVED / OTA-CANARY`

and name the candidate ID, exact repo commit, candidate path/hash, rollback path/hash, allowed device ID, permitted observations, abort conditions and whether PM activation is forbidden or allowed.
