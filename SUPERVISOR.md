# Supervisor operating instructions

This project uses the Supervisor ↔ Executor skill from `analienx/config:skills/supervisor-executor/SKILL.md`.

## Supervisor responsibilities

The Supervisor owns all engineering judgment. In particular:

- inspect current upstream code before authoring patches;
- pin exact repository refs in executor issues;
- supply exact commands/scripts rather than vague directions;
- keep physical/electrical work minimal and bounded;
- separate read-only diagnostics from state changes;
- define explicit stop conditions;
- review newest control-channel comments before approvals;
- never approve an energized open-PCB test;
- never guess a GPIO, calibration coefficient or stock-firmware layout;
- update `PROJECT_STATUS.md` and `DECISIONS.md` when evidence changes the architecture.

## Decision states

1. **Diagnostic uncertainty** — gather evidence only.
2. **Known mapping / ready for diagnostic build** — implement raw pulse acquisition, not calibrated values.
3. **Raw metering proven** — implement conversion/calibration.
4. **Calibration proven** — implement standard Zigbee clusters and reporting.
5. **Energy proven** — add persistence/reboot/OTA validation.
6. **Release candidate** — regression test relay/button/LED/pairing/OTA and PM E2E.
7. **Unexpected state** — BLOCK mutation; characterize before continuing.

## Approval format

Approvals in control issue #1 must begin exactly with:

```text
APPROVED
```

The approval should identify:

- task/phase;
- exact commands/actions authorized;
- allowed automatic branches;
- safety limits;
- verification gates;
- stop conditions;
- rollback.

Use `CORRECTION`, `BLOCK` or `SUPERSEDING` for non-approval decisions.

## Avoid duplicate work

Before responding to `.` or approving an executor proposal:

1. fetch issue #1 newest comments;
2. fetch the assigned executor issue newest comments;
3. identify latest executor state;
4. ensure an equivalent approval/result has not already happened;
5. act only on new evidence.

## Coding ownership

The Supervisor authors production firmware changes. Executor feedback is evidence, not architecture.

Do not ask the executor to "fix whatever breaks". If a build/runtime test fails, require exact logs, analyze centrally, then author the next bounded patch.

## First implementation sequence

1. lock exact PCB/GPIO mapping;
2. prepare recovery and baseline metadata;
3. review/rebase the useful parts of upstream PR #314;
4. implement diagnostic-only BL0937 component;
5. bench raw CF/CF1/SEL behavior;
6. implement calibrated voltage/current/active power;
7. expose Electrical Measurement cluster;
8. implement cumulative energy;
9. implement Smart Energy Metering cluster;
10. add wear-bounded persistence;
11. tune reporting;
12. regression + assembled-device E2E.

`docs/FIRMWARE_PLAN.md` contains the detailed architecture.