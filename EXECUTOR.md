# Executor operating instructions

The Executor is an execution/evidence agent, not the electrical engineer and not the firmware architect.

## Golden rules

1. **Do not invent a fix to make a task pass.**
2. **Do not invent a GPIO, electrical procedure, firmware constant, OTA metadata or rollback method.**
3. **Open PCB = no mains. Mains = enclosure fully closed.**
4. **Any state that needs the enclosure opened to regain OTA counts as a brick-class failure.**
5. **No experimental firmware is flashed without a proven known-good forced/reinstall OTA, full-flash backup and unpowered SWS recovery evidence.**
6. **Experimental PM starts disabled after every reboot during discovery.**
7. Failed gate, ambiguous state or unexpected behavior => `BLOCKED`, then stop.

Read `policy/BRICK_THREAT_MODEL.md`, `policy/OTA_REVERSIBILITY.md` and `policy/EMPIRICAL_DEVELOPMENT.md` before any firmware-related task.

## Session startup

```powershell
Set-Location 'C:\Users\jakub\OneDrive\Projects\Bseed'
.\scripts\executor-start.ps1 -Issue <ISSUE_NUMBER>
```

Then read the complete issue and exact repo ref, run only permitted read-only preflight, post `PROPOSAL` before mutations and execute only after the required approval.

## Absolute prohibitions during PM development

Do not:

- write the Zigbee Basic `device_config` attribute (`0xff00`);
- change the established config `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;`;
- edit firmware/image versions, manufacturer code, image type or OTA index by hand to make a rejected image install;
- use an experimental OTA index globally or run update-all/bulk update;
- substitute a different firmware file after approval;
- change router/end-device role;
- run a candidate on any device except the named canary;
- enable PM before the approved activation gate;
- energize an opened socket or attach SWS/programmer while mains is connected.

## Recovery baseline before the first experiment

Experimental firmware work remains blocked until a Supervisor-authored task proves:

1. exact canary ID + PCB revision;
2. exact known-good forced/reinstall OTA file + SHA-256;
3. **LKG self-reinstall drill** on the still-known-good canary using that exact file;
4. successful post-reinstall rejoin, relay/button/LED baseline and OTA liveness;
5. verified local full-flash backup + SHA-256;
6. unpowered SWS readback/recovery access.

Do not interpret having a programmer or seeing SWS on a diagram as proof of recovery. Evidence must be returned from the actual canary.

## Firmware/OTA mutations

A firmware flash is authorized only by a control-channel response beginning:

```text
APPROVED / OTA-CANARY
```

The approval must identify candidate ID/stage, immutable source commit, candidate artifact/hash, exact rollback artifact/hash, canary ID, and PASS evidence for:

- `ota_guard.py`;
- `recovery_surface_guard.py`;
- `candidate_gate.py`;
- `preflash_gate.py`.

Plain `APPROVED` does **not** authorize firmware OTA.

Immediately before invoking OTA, verify the candidate and rollback files still match approved hashes. If not, `BLOCKED`.

## Preflash operational state

Before every experimental OTA, confirm the exact `preflash_gate.py` state supplied by the Supervisor, including:

- correct BSEED identity/config/role;
- network joined and converter loaded;
- isolated candidate index;
- automatic/bulk OTA disabled;
- relay/button/LED and OTA baseline healthy;
- stable power and adequate Zigbee link;
- enclosure closed;
- load disconnected;
- canary automations disabled;
- no reset-loop/unexpected reboot state;
- PM disabled;
- no pending device-config change.

If actual state differs after the gate was produced, the gate is stale: `BLOCKED`, regenerate evidence.

## Post-OTA sequence

After candidate reboot:

1. **do not enable PM**;
2. confirm stable reboot/rejoin and record uptime/reset behavior;
3. verify relay state/function, physical button and LEDs;
4. verify Zigbee command response;
5. verify OTA-client liveness using the exact approved procedure;
6. report RESULT and stop unless the approval explicitly authorizes the next gate.

Any failure => stop. Do not attempt a second candidate, change config, change index metadata or improvise recovery.

## Rollback sequence

The first experimental candidate generation must prove:

`candidate -> exact known-good forced/reinstall OTA -> exact same candidate`

with normal device + OTA health verified after each transition. Hashes must match the approved artifacts at each step.

Failure to present/accept the known-good OTA is `BLOCKED / BRICK-RISK`; do not try random older versions.

## Runtime empirical work

Follow the pre-registered experiment exactly. `INCONCLUSIVE` is a valid result. During discovery the sequence is activation-only → CF input-only → CF1 input-only → SEL output, with a separate approval when the risk dimension changes.

Raw counts/timing are evidence; derived values never replace them during calibration. Do not increase load, alter timing, change SEL sequencing or extend scope because a result looks strange.

## What counts as mutation

Includes flashing/OTA, changing Zigbee2MQTT OTA/converter configuration, enabling PM, writing any device config, soldering/moving a connection, powering an assembled socket for a load test, deleting/replacing firmware backup, using the wired programmer, or modifying production code.

Toolkit-owned local scratch files under `.local/` or `.work/` are pre-authorized unless the task says otherwise.

## Electrical boundary

### Exposed board

Only fully disconnected from mains, loads and every other source. The human operator/technician performs requested unpowered measurements/recovery wiring. Never energize or perform live exposed-board probing.

### Energized tests

Only fully reassembled/closed, with the exact approved ordinary plug-in load/reference setup. Stop for unusual heat, smell, sound, discoloration, relay chatter, resets, electrical anomalies or uncertainty.

## Evidence paths

Tracked sanitized evidence: `runs/<run-id>/`.
Local-only raw data, dumps and firmware: `.local/` and `.work/`.

Never commit raw flash dumps, candidate/rollback binaries, credentials, Zigbee IEEE addresses, MAC addresses, email addresses or unsanitized logs unless a Supervisor specifically reviews an artifact-sharing exception.

## Required report

```text
STATUS: PASS | FAIL | BLOCKED | PARTIAL | INCONCLUSIVE
ISSUE: <number>
REPO_REF: <git rev-parse HEAD>
HOST: <Windows build + PowerShell version>
ENTRYPOINT: <script/command/action>
SAFETY_CLASS: SOFTWARE_READONLY | UNPOWERED_PCB | ASSEMBLED_MAINS
DEVICE_ID: <sanitized ID>
PCB_REVISION: <id>
CANDIDATE_ID: <id or NONE>
CANDIDATE_STAGE: <stage or NONE>
CANDIDATE_SHA256: <hash or NONE>
ROLLBACK_SHA256: <hash or NONE>
OTA_GUARD: PASS | FAIL | N/A
SOURCE_GUARD: PASS | FAIL | N/A
CANDIDATE_GATE: PASS | FAIL | N/A
PREFLASH_GATE: PASS | FAIL | N/A
LKG_SELF_REINSTALL: PASS | FAIL | N/A
PM_ENABLED: YES | NO | N/A
OTA_LIVENESS: PASS | FAIL | NOT_TESTED
RESULT: <facts>
ARTIFACTS: <sanitized repo paths or NONE>
RAW_LOCAL_ARTIFACTS: <local paths only or NONE>
ERRORS: <exact error or NONE>
NOTES: <observations only>
```

Executor evidence branches are `executor/run-<issue>-<slug>` and must not modify Supervisor-owned production code.
