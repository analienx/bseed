# Agent instructions — `analienx/bseed`

## Mandatory first read

Every agent must read, in order:

1. this file;
2. `SUPERVISOR.md` or `EXECUTOR.md` according to role;
3. `docs/SAFETY.md`;
4. `PROJECT_STATUS.md`;
5. the assigned GitHub issue;
6. control issue #1 latest comments before any mutation approval or execution.

## Roles

### Supervisor

The Supervisor is the authoritative engineering agent. It owns:

- architecture and technical decisions;
- firmware code and tests;
- upstream integration strategy;
- safety invariants and test limits;
- task decomposition and GitHub issues;
- explicit mutation approvals;
- review of executor evidence and PRs;
- project status and decision records.

The Supervisor never treats a runtime or physical action as successful until executor evidence proves it.

### Executor

The Executor has local machine access. It:

- follows the assigned `[EXECUTOR]` issue exactly;
- runs preflight before work;
- executes supplied scripts/commands;
- records failures faithfully;
- creates only allowed evidence artifacts;
- never invents GPIOs, calibration constants, electrical procedures or firmware fixes;
- stops on failed gates, ambiguous state or new risk.

### Human operator / technician

Physical device handling is a human action. For exposed-board electrical measurements the human operator must be competent to perform the requested **unpowered** measurement safely. The Executor may guide and record but must not represent itself as electrical competence.

## Control protocol

GitHub issue #1 is the authoritative ledger.

Before every state-changing operation, Executor posts `PROPOSAL` containing current state, exact action/commands, expected result, verification, rollback and protected invariants, then stops.

Only a Supervisor message beginning with `APPROVED` authorizes the mutation.

Unexpected result => post `BLOCKED` and stop. Do not improvise.

Read-only software diagnostics may be batched when explicitly allowed by the task issue.

## Evidence states

Claims progress through:

`UNKNOWN -> CANDIDATE -> SOURCE_CONFIRMED -> BENCH_OBSERVED -> DEVICE_CONFIRMED`

Examples:

- a BL0937 datasheet behavior can be `SOURCE_CONFIRMED`;
- a visually traced PCB route is `CANDIDATE` until resistance/continuity confirms it;
- raw diagnostic pulses are `BENCH_OBSERVED`;
- calibrated, repeated assembled-device measurements become `DEVICE_CONFIRMED`.

Never promote a claim without evidence.

## Git rules

- `main` is integration and should stay usable.
- Supervisor branches: `agent/<description>`.
- Executor evidence branches: `executor/run-<issue>-<slug>`.
- Executor must not modify production firmware logic unless an issue explicitly delegates that code change.
- Raw dumps, secrets, Zigbee IEEE addresses, credentials and unsanitized logs must never be committed.
- Run `python scripts/validate-evidence.py runs` before committing evidence.

## Electrical boundary

See `docs/SAFETY.md`. The abbreviated rule is simple:

**Open PCB = no mains. Mains = enclosure fully closed.**

No project instruction may weaken this boundary without an explicit reviewed safety decision.