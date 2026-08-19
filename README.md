# BSEED BL0937 power-monitoring firmware

Supervisor/executor engineering workspace for restoring reliable power monitoring to the BSEED Zigbee socket `_TZ3000_b28wrpvx` / custom `b28wrpvx` / `TS011F-BS-PM` while preserving the routing/binding improvements of `romasku/tuya-zigbee-switch`.

## Operating model

This repository follows `analienx/config:skills/supervisor-executor/SKILL.md`.

- **Supervisor (ChatGPT):** architecture, code, tests, safety gates, issues, approvals, review and acceptance.
- **Executor (local agent):** runs exact supervisor-authored commands on the notebook, builds/flashes approved firmware, gathers evidence and coordinates physical tests.
- **Human operator / technician:** performs physical handling and electrical measurements. The executor is not allowed to improvise electrical procedures.

Authoritative mutation/control channel: **GitHub issue #1**.

## Safety boundary

- Exposed PCB: **unpowered only**.
- Energized calibration: **fully reassembled socket only**, through an external reference power meter.
- Never probe an energized open PCB; never attach a grounded scope, logic analyser or USB programmer to an exposed board while mains is connected.
- Producing firmware or CI artifacts is not authorization to flash them.

Read `AGENTS.md`, `SUPERVISOR.md`, `EXECUTOR.md`, `docs/SAFETY.md` and `PROJECT_STATUS.md` before execution work.

## Current technical state

The project is **no longer implementing BL0937 metering from scratch**.

A downstream Romasku fork already implements the complete Telink pulse-metering stack and has hardware-tested the exact `_TZ3000_b28wrpvx` family:

```text
HobboRobin/tuya-zigbee-switch-with-metering
pinned source: 8b8cc4924a353b35880666f7b48f0afbee89eb17
```

Source-confirmed mapping:

```text
BL0937 CF  -> PA1
BL0937 CF1 -> PC2
BL0937 SEL -> PB1
```

Source-confirmed hardware calibration reused as the starting point:

```text
V = 161460
A = 144679
W = 16989
```

Existing socket controls remain frozen:

```text
PC3 = network/status LED
PB5 = button
PD2 = relay
PB4 = relay indicator
```

The first project canary keeps the existing runtime config exactly:

```text
b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;
```

Because converted devices persist this config in NVM, the project does **not** require an `EP` config write or factory reset. The reviewed overlay activates the proven meter pins from the exact `b28wrpvx` + `TS011F-BS-PM` identity while leaving the config unchanged.

## Implementation files

- `metering-source.lock.json` — pinned downstream implementation/mapping/calibration/converter provenance.
- `scripts/apply-metering-overlay.py` — deterministic two-file canary overlay.
- `scripts/metering_overlay_guard.py` — byte-for-byte proof that the firmware worktree equals pinned source + reviewed overlay.
- `scripts/metering_candidate_gate.py` — artifact/source/converter/rollback gate for this adopted implementation path.
- `templates/metering-candidate-manifest.json` — manifest consumed by that gate.
- `scripts/new-metering-candidate.ps1` — prepares a local candidate evidence workspace; does not flash.
- `.github/workflows/build-metering-canary.yml` — manual-only reproducible canary build/package workflow.

The build packages the pinned downstream Zigbee2MQTT `switch_custom.js` separately because the firmware deliberately preserves the old config while still exposing Electrical Measurement and Smart Energy Metering clusters at runtime.

## What is still required from hardware

Coding/building is not blocked. Flashing is.

Before an experimental OTA on one canary:

1. tie one exact physical socket/PCB revision to the source-confirmed BL0937/ZTU design;
2. confirm the source-known `PA1/PC2/PB1` routes on that exact canary (issue #3 / Class A);
3. prove the known-good custom OTA reinstall + unpowered SWS/full-flash recovery path on that same canary (issue #5);
4. pass the artifact/candidate/live preflash gates.

No fleet update or experimental flash is authorized by this README.

## Local checkout

Target Windows path:

```text
C:\Users\jakub\OneDrive\Projects\Bseed
```

The executor can use `scripts/bootstrap-local.ps1` and `scripts/executor-start.ps1 -Issue <number>`.

See `PROJECT_STATUS.md` for the authoritative current state and `DECISIONS.md` for the engineering rationale.
