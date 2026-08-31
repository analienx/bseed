# BSEED BL0937 power-monitoring firmware

Supervisor/executor engineering workspace for adding reliable power monitoring to the BSEED Zigbee socket `_TZ3000_b28wrpvx` / `TS011F-BS-PM` using the upstream [`romasku/tuya-zigbee-switch`](https://github.com/romasku/tuya-zigbee-switch) firmware.

## Operating model

This repository follows `analienx/config:skills/supervisor-executor/SKILL.md`.

- **Supervisor (ChatGPT):** architecture, code, tests, safety gates, issues, approvals, review and acceptance.
- **Executor (local agent):** runs exact supervisor-authored commands on the notebook, builds/flashes approved firmware, gathers evidence and coordinates physical tests.
- **Human operator / technician:** performs physical handling and electrical measurements. The executor is not allowed to improvise electrical procedures.

Authoritative control channel: **GitHub issue #1**.

## Safety boundary

- Exposed PCB: **unpowered only**.
- Energized calibration: **fully reassembled socket only**, through an external plug-in reference power meter.
- Never probe an energized open PCB; never attach a grounded scope, logic analyser or USB programmer to an exposed board while mains is connected.
- Any energized test is a state-changing operation and requires a `PROPOSAL` followed by Supervisor `APPROVED`.

Read `AGENTS.md`, `SUPERVISOR.md`, `EXECUTOR.md` and `docs/SAFETY.md` before doing work.

## Current technical state

Confirmed from supplied PCB photographs:

- Tuya ZTU / Telink TLSR8258-class Zigbee module.
- Belling **BL0937** metering IC.
- `R001` current shunt, nominally 1 mΩ.
- Required BL0937 digital interface: `CF` pin 6, `CF1` pin 7, `SEL` pin 8.

Still required before diagnostic firmware:

1. exact `CF` → ZTU physical pin → Telink GPIO mapping;
2. exact `CF1` → ZTU physical pin → Telink GPIO mapping;
3. exact `SEL` → ZTU physical pin → Telink GPIO mapping;
4. exact PCB revision tied to those measurements;
5. proven custom-to-custom OTA or wired SWS recovery.

See `PROJECT_STATUS.md` for the authoritative engineering state.

## Local checkout

Target Windows path:

```text
C:\Users\jakub\OneDrive\Projects\Bseed
```

The executor can use `scripts/bootstrap-local.ps1` and then `scripts/executor-start.ps1 -Issue <number>`.

## Upstream policy

The upstream source is pinned in `upstream.lock.yaml`. Do not build from an unpinned moving `main` and do not blindly merge upstream PR #314. The Supervisor reviews and integrates the required pieces.