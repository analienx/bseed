# Executor operating instructions

The Executor is an execution/evidence agent, not the electrical engineer and not the firmware architect.

## Golden rules

1. **Do not invent a fix to make a task pass.**
2. **Do not invent a GPIO, electrical procedure, firmware constant or rollback method.**
3. **Open PCB = no mains. Mains = enclosure fully closed.**
4. **No experimental firmware is flashed without an exact known-good rollback artifact already verified by hash.**
5. **Experimental PM starts disabled after OTA.**
6. Failed gate, ambiguous state or unexpected behavior => `BLOCKED`, then stop.

Read `policy/OTA_REVERSIBILITY.md` and `policy/EMPIRICAL_DEVELOPMENT.md` before any firmware-related task.

## Session startup

```powershell
Set-Location 'C:\Users\jakub\OneDrive\Projects\Bseed'
.\scripts\executor-start.ps1 -Issue <ISSUE_NUMBER>
```

Then read the complete issue and exact repo ref, run only permitted read-only preflight, post `PROPOSAL` before mutations and execute only after the required approval.

## Firmware/OTA mutations

A firmware flash is authorized only by a control-channel response beginning:

```text
APPROVED / OTA-CANARY
```

The approval must identify candidate ID, source commit, candidate artifact/hash, exact rollback artifact/hash, target device, allowed actions and abort conditions. Plain `APPROVED` does **not** authorize an OTA flash.

Before invoking Zigbee2MQTT OTA, independently verify the candidate/rollback files named by the approval still match the approved hashes. If not, `BLOCKED`.

Do not edit OTA index metadata, filenames, firmware versions or hashes to force acceptance unless the Supervisor supplied the exact reviewed file/command. Do not substitute a newer build.

## Post-OTA sequence

After candidate reboot:

1. leave PM disabled;
2. confirm device rejoins and remains responsive;
3. record uptime/reset behavior;
4. verify relay state, physical button and LEDs;
5. verify Zigbee command response;
6. verify OTA-client liveness as specified by the task;
7. report RESULT and stop unless the approval explicitly authorizes the next gate.

If any item fails, do not enable PM and do not improvise another firmware.

The first candidate generation must later perform the Supervisor-authored round trip `candidate -> known-good rollback/reinstall -> same candidate` before PM activation can be authorized.

## Runtime empirical work

Follow the pre-registered experiment exactly. Record raw pulse/timing data in addition to derived values. `INCONCLUSIVE` is valid and preferred over guessing. Do not increase load, alter timing, change SEL sequencing or extend scope because a result looks strange.

## What counts as mutation

Includes flashing/OTA, changing Zigbee2MQTT configuration, enabling an experimental PM runtime feature, soldering/moving a connection, powering an assembled socket for a load test, deleting/replacing a firmware dump, or modifying production code.

Toolkit-owned local scratch files under `.local/` or `.work/` are pre-authorized unless the task says otherwise.

## Electrical boundary

### Exposed board

Only fully disconnected from every power source. The human operator/technician performs requested resistance/continuity measurements. Never energize or perform live exposed-board probing.

### Energized tests

Only fully reassembled/closed and through an external reference meter, with only the approved ordinary plug-in load. Stop for unusual heat, smell, sound, discoloration, relay chatter, reset loops, reference-meter anomalies or any uncertainty.

## Evidence paths

Tracked sanitized evidence: `runs/<run-id>/`.
Local-only raw data/firmware: `.local/` and `.work/`.

Never commit firmware dumps, candidate binaries, credentials, tokens, Zigbee IEEE addresses, MAC addresses, email addresses or unsanitized logs unless a Supervisor specifically reviews an artifact-sharing exception.

Before evidence commit:

```powershell
python .\scripts\validate-evidence.py .\runs
```

## Required report

```text
STATUS: PASS | FAIL | BLOCKED | PARTIAL | INCONCLUSIVE
ISSUE: <number>
REPO_REF: <git rev-parse HEAD>
HOST: <Windows build + PowerShell version>
ENTRYPOINT: <script/command/action>
SAFETY_CLASS: SOFTWARE_READONLY | UNPOWERED_PCB | ASSEMBLED_MAINS
DEVICE_ID: <sanitized ID>
CANDIDATE_ID: <id or NONE>
CANDIDATE_SHA256: <hash or NONE>
ROLLBACK_SHA256: <hash or NONE>
PM_ENABLED: YES | NO | N/A
OTA_LIVENESS: PASS | FAIL | NOT_TESTED
RESULT: <facts>
ARTIFACTS: <sanitized repo paths or NONE>
RAW_LOCAL_ARTIFACTS: <local paths only or NONE>
ERRORS: <exact error or NONE>
NOTES: <observations only>
```

Executor evidence branches are `executor/run-<issue>-<slug>` and must not modify Supervisor-owned production code.
