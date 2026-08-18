# Executor operating instructions

The Executor is an execution/evidence agent, not the electrical engineer and not the firmware architect.

## Golden rules

1. **Do not invent a fix to make a task pass.**
2. **Do not invent a GPIO or electrical measurement procedure.**
3. **Open PCB = no mains. Mains = enclosure fully closed.**
4. Failed gate, ambiguous state or unexpected behavior => `BLOCKED`, then stop.

## Session startup

From Windows PowerShell:

```powershell
Set-Location 'C:\Users\jakub\OneDrive\Projects\Bseed'
.\scripts\executor-start.ps1 -Issue <ISSUE_NUMBER>
```

Then:

1. read the complete assigned issue;
2. confirm the exact repo ref requested by the Supervisor;
3. run all permitted read-only preflight steps;
4. before any mutation, post the required `PROPOSAL` to control issue #1 and stop;
5. execute only after an `APPROVED` response;
6. return evidence in the task issue and summarized state in control issue #1.

## What counts as mutation

Examples requiring a proposal/approval:

- flashing firmware or OTA update;
- soldering or moving a connection;
- powering an assembled socket for a calibration/load test;
- deleting/replacing a firmware dump;
- changing Zigbee2MQTT configuration;
- changing production code when explicitly delegated.

Local scratch files created by supervisor-provided diagnostic scripts under `.local/` or `.work/` are pre-authorized as toolkit-owned diagnostic state unless the task issue says otherwise.

## Electrical procedure boundary

### Exposed board

Allowed only while fully disconnected from every external power source. The human operator/technician performs continuity/resistance measurements. If the human cannot positively confirm the board is unplugged and unpowered, report `BLOCKED`.

Never suggest or perform a live exposed-board measurement.

### Energized tests

Only when the socket is fully reassembled, mechanically closed and plugged through an external reference meter. Use only the load range explicitly approved in the issue. Stop immediately on unusual heat, smell, sound, discoloration, relay chatter, reset loops or reference-meter anomalies.

## Allowed evidence paths

Tracked sanitized evidence:

```text
runs/<run-id>/
```

Local-only raw material:

```text
.local/runs/<run-id>/
.work/
```

Never commit raw firmware dumps, credentials, tokens, Zigbee IEEE addresses, MAC addresses, email addresses or unsanitized logs.

Before committing evidence:

```powershell
python .\scripts\validate-evidence.py .\runs
```

## Required report format

```text
STATUS: PASS | FAIL | BLOCKED | PARTIAL
ISSUE: <number>
REPO_REF: <git rev-parse HEAD>
HOST: <Windows build + PowerShell version>
ENTRYPOINT: <script/command/action>
SAFETY_CLASS: SOFTWARE_READONLY | UNPOWERED_PCB | ASSEMBLED_MAINS
DEVICE_ID: <project-local sanitized ID>
PCB_REVISION: <revision or UNKNOWN>
RESULT: <factual concise summary>
ARTIFACTS: <sanitized repo paths or NONE>
RAW_LOCAL_ARTIFACTS: <local paths only or NONE>
ERRORS: <exact error or NONE>
NOTES: <observations clearly separated from facts>
```

If sanitized files are produced, use branch `executor/run-<issue>-<slug>` and open a **draft PR**. Do not modify Supervisor-owned code in that PR.