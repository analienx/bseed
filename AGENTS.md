# Agent instructions — `analienx/bseed`

## Mandatory first read

Every agent must read, in order:

1. this file;
2. `SUPERVISOR.md` or `EXECUTOR.md` according to role;
3. `docs/SAFETY.md`;
4. `policy/BRICK_THREAT_MODEL.md`;
5. `policy/OTA_REVERSIBILITY.md`;
6. `policy/EMPIRICAL_DEVELOPMENT.md`;
7. `PROJECT_STATUS.md`;
8. the assigned GitHub issue;
9. control issue #1 latest comments before any mutation approval or execution.

All files under `policy/` are hard project gates, not advisory documentation.

## Roles

### Supervisor

The Supervisor is the authoritative engineering agent. It owns architecture, firmware code/tests, upstream integration, brick-prevention and safety/recovery invariants, empirical experiment design, task decomposition, mutation approvals, evidence review and project status.

The Supervisor never treats runtime/physical action, OTA liveness or rollback capability as successful until Executor evidence proves it on the exact canary.

### Executor

The Executor has local machine access. It follows the assigned `[EXECUTOR]` issue exactly, runs preflight, executes supplied scripts/commands, records failures faithfully, creates only allowed evidence and never invents GPIOs, calibration constants, electrical procedures, firmware fixes, OTA metadata or rollback methods. Failed gate, ambiguity or new risk => `BLOCKED` and stop.

### Human operator / technician

Physical device handling is a human action. For exposed-board measurements the human operator must be competent to perform the requested **unpowered** work safely. The Executor may guide/record but does not substitute for electrical competence.

## Brick definition

For this project, a firmware action is considered a brick-class failure if the socket cannot accept the next approved OTA without opening the device. This includes a device that still boots but has lost OTA matching, Zigbee reachability or converter/update access. Wired SWS recovery is an emergency fallback, not an acceptable deployment outcome.

Unknown/unclassified recovery risk is treated as `BLOCKED` until characterized.

## Control protocol

GitHub issue #1 is the authoritative ledger. Before every state-changing operation, Executor posts `PROPOSAL` with current state, exact action/commands, expected result, verification, rollback and protected invariants, then stops.

Only a Supervisor message beginning with `APPROVED` authorizes a general mutation. A firmware flash specifically requires approval beginning `APPROVED / OTA-CANARY` and all hard gates below.

Unexpected result => post `BLOCKED` and stop. Do not improvise. Read-only software diagnostics may be batched only when the task issue permits them.

## Mandatory firmware gates

No experimental OTA proposal can be approved until:

1. exact canary identity/PCB is established;
2. exact known-good forced/reinstall OTA file is hash-verified;
3. LKG self-reinstall drill has passed on that canary;
4. full flash backup is locally preserved and hash-verified;
5. emergency unpowered SWS readback/recovery access is proven;
6. `scripts/ota_guard.py` PASSes candidate and rollback;
7. `scripts/recovery_surface_guard.py` PASSes the immutable source commit;
8. `scripts/candidate_gate.py` PASSes the schema-2 candidate manifest;
9. `scripts/preflash_gate.py` PASSes the live device state immediately before approval;
10. PM is disabled after every reboot during discovery;
11. the BSEED base config remains exactly `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;`;
12. device-config writes, base GPIO changes and automatic/bulk experimental OTA are prohibited.

If any item is `UNKNOWN`, flashing is prohibited.

## Evidence states

Physical/empirical claims use:

`UNKNOWN -> HYPOTHESIS -> OFFLINE_VALIDATED -> DEVICE_OBSERVED -> REPEATED -> ACCEPTED`

Source provenance may additionally be recorded as `SOURCE_CONFIRMED`, but datasheet/upstream evidence never substitutes for observation on the exact target board.

Never promote a physical claim based only on a unit/simulator test.

## Recovery invariants

Ordinary PM work must not modify the protected source surfaces enforced by `recovery_surface_guard.py`, including BSEED `device_db` identity/config, Telink early boot/OTA relocation, OTA client/network recovery path, existing config/NVM/reset behavior, or current relay/button/LED mappings.

Routine experiments use OTA only; wired SWS is emergency recovery and must never be combined with mains power.

## Git rules

- `main` is integration and should stay usable.
- Supervisor branches: `agent/<description>`.
- Executor evidence branches: `executor/run-<issue>-<slug>`.
- Executor does not modify production firmware unless explicitly delegated.
- Raw dumps, firmware binaries, secrets, Zigbee IEEE addresses, credentials and unsanitized logs must not be committed unless a specific artifact-sharing review explicitly permits it.
- Run `python scripts/validate-evidence.py runs` before committing evidence.
- Candidate/rollback/full-flash files live under `.local/` or approved CI artifacts.

## Electrical boundary

See `docs/SAFETY.md`.

**Open PCB = no mains. Mains = enclosure fully closed.**

No project instruction may weaken this boundary.
