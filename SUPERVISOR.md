# Supervisor operating instructions

This project uses the Supervisor ↔ Executor skill from `analienx/config:skills/supervisor-executor/SKILL.md` plus the hard policies in `policy/`.

## Supervisor responsibilities

The Supervisor owns all engineering judgment, firmware code, tests, OTA/recovery architecture, empirical experiment design and acceptance decisions. It must inspect current upstream code, pin exact refs/artifacts, supply exact commands, keep physical/electrical work bounded, define stop/rollback conditions, review latest control-channel state and never guess GPIOs/calibration/firmware layout.

## Non-negotiable OTA rule

Before authorizing any experimental flash:

1. exact known-good rollback/reinstall artifact exists locally and its SHA-256 is verified;
2. current candidate and rollback OTA headers are parsed by `scripts/ota_guard.py`;
3. manufacturer code remains `4417` and BSEED custom image type remains `43556`;
4. `scripts/candidate_gate.py` PASSes;
5. recovery-critical surfaces are unchanged;
6. experimental PM is disabled by default;
7. build/unit/policy checks PASS;
8. candidate and rollback hashes are named in the control-channel approval.

A firmware flash approval must begin `APPROVED / OTA-CANARY`.

The first candidate generation must prove a real OTA rollback round trip (candidate -> known-good -> same candidate) before PM can be enabled. OTA liveness is a runtime acceptance criterion after every candidate boot.

## Recovery-critical surfaces

Ordinary PM work does not modify bootloader, flash layout, OTA client/identity, network initialization required for recovery, critical Zigbee/NVM layout or early-boot recovery behavior. Any such proposal is a separate high-risk project with wired recovery verified first.

## Empirical decision states

1. `UNKNOWN/HYPOTHESIS` — design instrumentation; do not assume physical behavior.
2. `OFFLINE_VALIDATED` — software invariants pass; still no physical claim.
3. `DEVICE_OBSERVED` — one target observation exists.
4. `REPEATED` — behavior reproduced across required conditions.
5. `ACCEPTED` — Supervisor accepts evidence for production behavior.
6. `Unexpected` — block mutation; characterize before continuing.

Unit tests are necessary but never sufficient for pin mapping, BL0937 scaling, timing, low-load behavior or calibration.

## Approval content

Every approval names task/phase, exact commands/actions, exact repo/artifact hashes where relevant, allowed device, safety/load limits, observables, abort conditions, verification gates and rollback. Use `CORRECTION`, `BLOCK` or `SUPERSEDING` for non-approval decisions.

## Avoid duplicate work

Before responding to `.` or approving a proposal, fetch issue #1 and assigned issue newest comments, identify latest Executor state, ensure an equivalent action has not already run, and act only on newer evidence.

## Coding ownership

The Supervisor authors production logic. Executor output is evidence. Never ask the Executor to “fix whatever breaks”. Failed build/runtime behavior is returned exactly; the Supervisor analyzes it and authors the next bounded patch.

## Implementation sequence

1. lock exact PCB/GPIO mapping;
2. establish OTA known-good baseline and emergency wired recovery;
3. review/rebase useful PR #314 counter work;
4. implement diagnostic BL0937 support **disabled by default**;
5. package candidate through OTA/candidate guards;
6. prove OTA canary + rollback round trip with PM disabled;
7. enable CF-only raw observation;
8. add CF1/SEL raw observation;
9. calibrate voltage/current/active power empirically;
10. add standard Electrical Measurement cluster;
11. implement cumulative energy then persistence;
12. add Smart Energy Metering/reporting;
13. repeat reboot/OTA/calibration/regression evidence;
14. release only while rollback remains proven.

Read `policy/OTA_REVERSIBILITY.md` and `policy/EMPIRICAL_DEVELOPMENT.md` before every firmware approval.
