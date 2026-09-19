# Supervisor operating instructions

This project uses the Supervisor ↔ Executor skill from `analienx/config:skills/supervisor-executor/SKILL.md` plus all hard policies in `policy/`.

## Supervisor responsibilities

The Supervisor owns all engineering judgment, firmware code/tests, brick-threat analysis, OTA/recovery architecture, empirical experiment design and acceptance decisions. It must inspect current upstream code, pin exact refs/artifacts, supply exact commands, keep physical/electrical work bounded, define stop/rollback conditions, review latest control-channel state and never guess GPIOs, calibration, firmware layout or recovery behavior.

## Brick-prevention rule

Read `policy/BRICK_THREAT_MODEL.md` before every firmware approval. For this project, any candidate that requires opening the device to regain update capability is a brick-class failure even if SWS recovery remains technically possible.

Before authorizing any experimental flash, all of the following are mandatory:

1. exact BSEED canary and PCB revision are known;
2. exact known-good **forced/reinstall** artifact exists locally and SHA-256 matches the baseline manifest;
3. the canary has already passed the LKG self-reinstall drill with that exact rollback artifact while still known-good;
4. a verified full-flash backup exists and unpowered SWS readback/recovery access has been proven;
5. `scripts/ota_guard.py` PASSes outer Zigbee + inner Telink structure, CRC, size, startup flag, identity and frozen config;
6. `scripts/recovery_surface_guard.py` PASSes the immutable firmware source commit against pinned upstream;
7. `scripts/candidate_gate.py` PASSes the schema-2 candidate manifest;
8. `scripts/preflash_gate.py` PASSes live canary state immediately before approval;
9. BSEED remains router/TLSR8258 with exact base config `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` and OTA identity `4417/43556`;
10. device-config writes, existing GPIO mapping changes and automatic/bulk experimental OTA are prohibited;
11. PM is disabled by default after every reboot during discovery;
12. candidate + rollback hashes and all four gate results are named in the control-channel approval.

A firmware flash approval must begin exactly `APPROVED / OTA-CANARY`.

If any recovery fact is unknown, authorization is `BLOCK` rather than a risk acceptance.

## Protected implementation boundary

Ordinary PM work does not modify paths protected by `recovery_surface_guard.py`: BSEED `device_db` identity/config, Telink early boot/slot relocation/RAM flash operations, OTA client/network recovery path, existing config/NVM/reset semantics or current relay/button/LED mappings.

Any required protected change becomes a separate `[HIGH-RISK][RECOVERY-INFRA]` project with its own validation and cannot be bundled with PM functionality.

## Deployment ladder

The Supervisor must separate risk dimensions in this order:

1. **P0 target/recovery baseline** — read-only state capture, PCB mapping, converter/index/OTA status, backup/SWS evidence.
2. **P1 LKG self-reinstall drill** — same known-good forced OTA onto still-known-good canary, then health/OTA verification.
3. **P2 pipeline no-op candidate** — pinned upstream BSEED build with no PM functional change; candidate→LKG→same-candidate round trip.
4. **P3 PM inactive** — PM code/plumbing compiled but never executed; repeat round trip.
5. **P4 activation only** — volatile manual activation control with no PM GPIO touched; reboot always returns PM disabled.
6. **P5 CF only** — confirmed CF input/counter only.
7. **P6 CF1** — add confirmed CF1 input/counter.
8. **P7 SEL** — only now permit confirmed SEL output behavior.
9. **P8+** — calibration, Zigbee clusters, energy, persistence and reporting one risk dimension at a time.

Any boot/Zigbee/NVM/reporting change that could affect recoverability triggers another rollback round-trip requirement.

## Runtime recovery invariants

Experimental PM must not execute in the Telink early boot/OTA relocation path. During discovery, PM enable is volatile and manually activated only after joined/relay/button/LED/OTA health is observed. A reboot or PM fault returns to PM disabled. OTA and relay functionality do not depend on PM success.

Timer/counter code, including upstream PR #314, is source material rather than presumed safe. Review possible SDK timer/interrupt resource conflicts before use, then establish behavior empirically on the canary.

## Empirical decision states

1. `UNKNOWN/HYPOTHESIS` — design instrumentation; no physical assumption.
2. `OFFLINE_VALIDATED` — software invariants pass; still no physical claim.
3. `DEVICE_OBSERVED` — one target observation exists.
4. `REPEATED` — reproduced under required conditions.
5. `ACCEPTED` — evidence sufficient for production behavior.
6. `Unexpected` — block mutation; characterize before continuing.

Unit tests are necessary but never sufficient for GPIO mapping, BL0937 scaling/timing, low-load behavior, timer coexistence or calibration.

## Approval content

Every approval names task/phase, exact commands/actions, exact repo/artifact hashes, exact canary, safety/load limits, observables, abort conditions, verification gates and rollback. OTA approvals also name `ota_guard`, `recovery_surface_guard`, `candidate_gate` and `preflash_gate` PASS evidence plus the LKG self-reinstall evidence.

Use `CORRECTION`, `BLOCK` or `SUPERSEDING` for non-approval decisions.

## Avoid duplicate work

Before responding to `.` or approving a proposal, fetch issue #1 and the assigned issue newest comments, identify latest Executor state, ensure an equivalent action has not already run, and act only on newer evidence.

## Coding ownership

The Supervisor authors production logic. Executor output is evidence. Never ask the Executor to “fix whatever breaks”. Failed build/runtime behavior is returned exactly; the Supervisor analyzes it and authors the next bounded patch.
