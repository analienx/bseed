# UNIFIED-PM CANARY P002 — LivingRoomSocketWifiLeft (2026-09-06): **OTA_CLIENT_QUERY_NOT_OBSERVED**

Executor return for the superseding P002 ruling (issue #11). One additional bounded
diagnostic executed on `LivingRoomSocketWifiLeft` / `0xa4c138ba60b92c5f` only.
Execution mode: **DIRECT_LOCAL_TOOLKIT** (issue #53 runner not yet installed/merged;
same operations and evidence schema run directly from the Windows executor).
Frozen firmware source **not modified** (`ded91a1fb1cdeb320d0858c8f4bcabab32bf5564`
untouched); no rebuild, no second device, no config/calibration/protection writes.

## Verdict

```text
RESULT: STOPPED_EXPECTED
Branch: D1 — OTA_CLIENT_QUERY_NOT_OBSERVED
The old firmware 1.2.5-8b8cc492 (0x12053000) did not originate an OTA Query Next Image
within a 15-minute scheduled-window. Zero image blocks. Candidate firmware NOT executed.
This is the exact discrimination the ruling asked for: the first canary failure is
confirmed as an OTA-initiation/handshake condition, not a transfer/execution failure,
and not an artifact/identity rejection.
```

## How far through the OTA client protocol the old firmware progressed

| stage | result |
|---|---|
| schedule accepted (Z2M) | YES — request `status:ok`, response url `/config/zigbee2mqtt/ota/bseed-ts011f-pm-v8-ded91a1.ota`, `update.state=scheduled` |
| device-originated Query Next Image | **NO** (bounded 15-min window, 11:47:24Z–12:02:24Z) |
| image offered | NO |
| first image block | NO |
| blockRequestCount | **0** |
## Sanitized evidence (banked in this inventory + `/tmp/pm002/` on host)

- `result.json` — P002 schema terminal states (see below)
- `preflight.json` / `target.json` / `hashes.txt` — artifact + target gates
- `mqtt/request-summary.json`, `mqtt/responses.jsonl` (schedule + unschedule), `mqtt/device-states.jsonl`
- `actions.jsonl` — full step/class/result trail
- `observe.json`, `observe-run.log` — the 900s window
- `z2m/target-bounded.log` — current log segment (schedule→unschedule era)

## Phase A — preflight (PASS)

- Z2M 2.14.0; `ota:` config `{block_size:192, default_maximum_data_size:100}`,
  `disable_automatic_update_check:false` (default), update-check interval default 1440 min.
  Reported without modification. No other device `updating`/scheduled.
- Artifact (from run 34015243265 / artifact `bseed-pm-v8-reproducibility`):
  `forward.ota` 195,394 B, SHA256 `c3ccb484…fe7c`, header independently parsed:
  identifier 0x0BEEF11E, headerVersion 256, mfr 4417, imageType 43556,
  fileVersion 302329858 (0x12053002), stackVersion 2, totalImageSize 195394. All gates PASS.
- Target identity exact: friendly `LivingRoomSocketWifiLeft`, IEEE
  `0xa4c138ba60b92c5f`, manufacturer `b28wrpvx`, model `TS011F-BS-PM`, Router,
  `device_config` = `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` (byte-exact).
- Current firmware: `1.2.5-8b8cc492`, dateCode 20260822, installed_version
  `302329856` (intended target +2 → 302329858).
- **Relay OFF** (left OFF from first canary; confirmed, not re-written). Unknown/high-power
  load: none (relay OFF = load path de-energized).
- Metering (as exposed by old build): voltage 245.06 V, current 0.1 A, power 2 W,
  apparent 24 / reactive 23 / PF 4, energy 0.26 kWh, `overload_alarm_switch: none`.
  Calibration V/I/P `NOT_EXPOSED` by the matched `TS011F_plug_1_2` definition.
| terminal OTA state | null (never left `scheduled`) |
| candidate firmware executed | **NO** |
## Phase B — schedule (PASS)

- Payload built from the exact verified bytes (hex, 195,394 bytes as UPPERCASE hex,
  `file_name: bseed-ts011f-pm-v8-ded91a1.ota`). Published 11:47:13Z to
  `zigbee2mqtt/bridge/request/device/ota_update/schedule` (explicit id).
- Response `{"data":{"id":"LivingRoomSocketWifiLeft","url":"/config/zigbee2mqtt/ota/bseed-ts011f-pm-v8-ded91a1.ota"},"status":"ok"}`.
- Verified `update.state = scheduled` at 11:47:18Z. OTA hex is **not** echoed into
  evidence (only file_name/bytes/SHA/header stored).

## Phase C — observe (D1 branch)

- Window 900s (11:47:24Z–12:02:24Z, full 15 minutes per ruling).
- `clientQueryObserved: false`, `imageOffered: false`, `firstBlockObserved: false`,
  `blockRequestCount: 0`, `maxProgress: 0`, `stateTransitions: []`,
  `availabilityFlips: []`, `terminalOtaState: null`.
- No safe target-only MCU power-cycle path existed (relay toggling is not an MCU
  reboot and was not used; no Z2M restart performed as stimulus, per ruling).

## Phase D — branch taken: D1

Exactly-once unschedule published 13:09:01Z to
`zigbee2mqtt/bridge/request/device/ota_update/unschedule` (`{"id":"LivingRoomSocketWifiLeft"}`),
response `{"data":{"id":"LivingRoomSocketWifiLeft"},"status":"ok"}`,
verified `update.state` returned to `idle` (13:09:06Z). `unscheduleVerified: true`.
## Terminal result.json (P002 schema)

```text
verdict: OTA_CLIENT_QUERY_NOT_OBSERVED
result: STOPPED_EXPECTED
scheduledAt: 2026-09-06T11:47:18Z
clientQueryObserved: false
imageOffered: false        imageIdentityMatched: false
firstBlockObserved: false
blockRequestCount: 0       maxProgress: 0
terminalOtaState: null
unscheduleRequired: true   unscheduleVerified: true
candidateFirmwareExecuted: false
postcheckPassed: false     functionalCanaryRan: false   functionalCanaryPassed: false
finalRelayState: OFF
mutationOccurred: false    rollbackRequired: false   rollbackPerformed: false
cleanupVerified: true
```

## Final device state (post-unschedule)

- online (LQI 112–124 throughout), `1.2.5-8b8cc492` / 302329856 / dateCode 20260822, unchanged.
- `device_config` byte-identical; relay **OFF**; energy 0.26 kWh (unchanged/nondecreasing);
  voltage 245.06 / current 0.1 / power 2 W; `overload_alarm_switch: none`.
- No availability flips, no reboot/interview loop, no ZCL flood; no other device touched.

## Executor actions taken / not taken

- Taken: artifact verification, read-only preflight, one schedule request, bounded
  observe, exactly-once unschedule, verification, evidence banking.
- NOT taken (per ruling `may not`): no rebuild/regenerate, no `device_config` change,
  no calibration/protection change, no factory-reset/re-pair, no Z2M restart as
  stimulus, no SWS/wired flash, no index/release publish, no other device, no
  repeated retry.
- Frozen firmware source `ded91a1…` untouched (zero source modifications).

## Suggested interpretation for the supervisor (not an action)

The device accepts and acknowledges the fileVersion query (Z2M sees `update.state:
available` immediately after schedule) but its OTA client does not originate the
Query Next Image within 15 minutes at its normal polling cadence. Two distinct,
non-exclusive hypotheses for a later ruling: (a) the old Tuya/Romasku core advertises
OTA support but its `QueryNextImageRequest` cadence is long (>15 min) — a longer or
power-cycle-provoked window would discriminate; (b) the OTA upgrade client is not
actually active in this production image, in which case only a supervisor-authorized
hardware power cycle or alternate OTA-entry path could provoke it. No further live
action was authorized or taken.