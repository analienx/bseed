# Agent instructions — `analienx/bseed`

## Mandatory first read

Every agent must read, in order:

1. this file;
2. `SUPERVISOR.md` or `EXECUTOR.md` according to role;
3. `docs/SAFETY.md`;
4. `policy/OTA_REVERSIBILITY.md`;
5. `policy/EMPIRICAL_DEVELOPMENT.md`;
6. `PROJECT_STATUS.md`;
7. the assigned GitHub issue;
8. control issue #1 latest comments before any mutation approval or execution.

The two files under `policy/` are hard project gates, not advisory documentation.

## Roles

### Supervisor

The Supervisor is the authoritative engineering agent. It owns architecture, firmware code/tests, upstream integration, safety/recovery invariants, empirical experiment design, task decomposition, mutation approvals, evidence review and project status.

The Supervisor never treats runtime/physical action or rollback capability as successful until executor evidence proves it.

### Executor

The Executor has local machine access. It follows the assigned `[EXECUTOR]` issue exactly, runs preflight, executes supplied scripts/commands, records failures faithfully, creates only allowed evidence and never invents GPIOs, calibration constants, electrical procedures, firmware fixes or rollback methods. Failed gate, ambiguity or new risk => `BLOCKED` and stop.

### Human operator / technician

Physical device handling is a human action. For exposed-board electrical measurements the human operator must be competent to perform the requested **unpowered** measurement safely. The Executor may guide/record but does not substitute for electrical competence.

## Control protocol

GitHub issue #1 is the authoritative ledger. Before every state-changing operation, Executor posts `PROPOSAL` with current state, exact action/commands, expected result, verification, rollback and protected invariants, then stops.

Only a Supervisor message beginning with `APPROVED` authorizes a general mutation. A firmware flash specifically requires approval beginning `APPROVED / OTA-CANARY` and must satisfy `policy/OTA_REVERSIBILITY.md`.

Unexpected result => post `BLOCKED` and stop. Do not improvise. Read-only software diagnostics may be batched only when the task issue permits them.

## Evidence states

Physical/empirical claims use:

`UNKNOWN -> HYPOTHESIS -> OFFLINE_VALIDATED -> DEVICE_OBSERVED -> REPEATED -> ACCEPTED`

Source provenance may additionally be recorded as `SOURCE_CONFIRMED`, but source evidence from a datasheet or upstream repository never substitutes for observation on the exact target board.

Never promote a physical claim based only on a unit test.

## OTA/recovery invariants

Ordinary PM development must not change bootloader, flash layout, OTA client/identity, Zigbee network initialization required for recovery, critical NVM layout or early-boot recovery behavior. Candidate firmware boots with experimental PM disabled by default. Known-good rollback/reinstall artifact + hashes are mandatory. The actual target must pass a rollback round trip before higher-risk PM stages advance.

Routine experiments use OTA only; wired SWS is emergency recovery and must never be combined with mains power.

## Git rules

- `main` is integration and should stay usable.
- Supervisor branches: `agent/<description>`.
- Executor evidence branches: `executor/run-<issue>-<slug>`.
- Executor does not modify production firmware unless explicitly delegated.
- Raw dumps, secrets, Zigbee IEEE addresses, credentials and unsanitized logs must never be committed.
- Run `python scripts/validate-evidence.py runs` before committing evidence.
- Firmware candidate binaries remain `.local/` or approved CI artifacts unless explicitly reviewed.

## Electrical boundary

See `docs/SAFETY.md`.

**Open PCB = no mains. Mains = enclosure fully closed.**

No project instruction may weaken this boundary.
