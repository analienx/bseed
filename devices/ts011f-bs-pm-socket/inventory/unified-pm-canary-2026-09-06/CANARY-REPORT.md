# UNIFIED-PM CANARY — LivingRoomSocketWifiLeft (2026-09-06): **STOP — OTA error**

Executor return for the issue #11 executor handoff (one bounded canary, frozen
SHA `ded91a1fb1cdeb320d0858c8f4bcabab32bf5564`). Mandatory STOP hit at step 3
(`OTA error`): the device did not respond to the OTA image notify. Per the
handoff, no repair was attempted; the device is healthy and unchanged; the load
path is OFF. Supervisor owns all next decisions.

## Verdict

```text
STOP — OTA update failed: "Device didn't respond to OTA request" (pre-transfer,
       at the image notify/query stage). Device healthy, unchanged, online.
```

## 1. Artifact retrieval + verification (all PASS)

- GitHub Actions run `34015243265`, artifact `bseed-pm-v8-reproducibility`
  (ID `9983708053`), path `tuya-zigbee-switch/build/bseed-ts011f-pm-v8/forward.ota`.
- bytes `195394`; SHA256
  `c3ccb484c28d7ef08594acc306b2054aed3ba9fcfc9579643da339f7fcc9fe7c` (== required);
- independently parsed header: manufacturer `4417`, imageType `43556`,
  fileVersion `302329858`, totalImageSize `195394` == file size. PASS.
- In-container copy re-hashed before request build; request built from the
  verified bytes (`hex` payload, file_name `bseed-ts011f-pm-v8-ded91a1.ota`).

## 2. Preflight snapshot (`raw/pre/`) — no mismatches

- friendly name `LivingRoomSocketWifiLeft`, IEEE `0xa4c138ba60b92c5f`,
  manufacturer `b28wrpvx`, model_id `TS011F-BS-PM`, Router (Mains single phase),
  networkAddress 12047; Z2M definition `TS011F_plug_1_2` ("BSEED PM outlet 🅰 —
  Romasku custom firmware").
- firmware: `1.2.5-8b8cc492`, dateCode 20260822, `update.installed_version
  302329856` (target = +2 → 302329858).
- `device_config_switch` = `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` — exact.
- relay found **ON** at preflight → set **OFF** per handoff safety requirement
  (not a persisted setting); verified `state_relay: OFF`, power 2 W / 0.1 A
  quiescent reading (old-firmware noise; load path OFF).
- metering as reported by device: voltage 245.06 V, current 0.1 A, power 2 W,
  energy 0.26 kWh, apparent 24 / reactive 23 / power_factor 4;
  `overload_alarm_switch: none`. **Calibration V/I/P NOT exposed** by the
  current build/converter (nothing to pre-read; note: the current definition
  exposes no metering properties at all — values arrive as spontaneous
  reports; `get` of voltage/power/current/energy logs "No converter available").
- other persisted-ish values: multi_press_reset_count 10, network_led OFF,
  indicator `same`+ON, power_on_behavior `previous`, relay_physical_mode null.

## 3. OTA request/response (`raw/ota-update.json`, `raw/ota-run.log`)

- 07:58:44Z request published to `zigbee2mqtt/bridge/request/device/ota_update/update`
  (hex payload, 195394 bytes), explicit id `LivingRoomSocketWifiLeft`. No other
  OTA was running.
- 07:59:45Z response: `{"data":{},"error":"OTA update of 'LivingRoomSocketWifiLeft'
  failed (Device didn't respond to OTA request)","status":"error"}`.
- Z2M had verified availability seconds earlier (`update.state: "available"` —
  the fileVersion query worked), then the image notify went unanswered.
- No progress blocks were transferred (no `image block` lines).

## 4. Post-failure device state (`raw/postfail/`) — unchanged, healthy

- still online (LQI 124), `1.2.5-8b8cc492` / 302329856 / dateCode 20260822;
- `device_config` byte-identical; `state_relay: OFF`; `overload_alarm_switch:
  none`; energy 0.26 (nondecreasing); metering values unchanged; availability
  no flips in the window; no reboot/interview loop.

## 5. Z2M log window (`raw/log-window/window.log`)

Bounded from canary start: single OTA error line, no image transfer, no
availability flips for the target, no new recurring error pattern. The only
target-related errors are (a) the OTA failure itself and (b) my own read probes
(`relay_physical_mode` EP2 genOnOff 65283 → UNSUPPORTED_ATTRIBUTE;
voltage/power/current/energy get → "No converter available" — both are
current-build/converter capability gaps, not failures introduced by the canary).

## 6. Suggested supervisor hypotheses (for the next ruling only)

- The old build (`1.2.5-8b8cc492`) may not answer image notify when the image
  identity matches except fileVersion (mfr/imageType match, fv +2) — i.e. an
  old-firmware OTA-server gap that the previous PM canary path may not have
  exercised;
- or the per-request `hex` path differs from an index/URL path in timing
  (single notify vs query loop);
- relay/load state and all safety conditions were satisfied, so a single
  authorized retry (URL-based index path, or with the coordinator/device
  conditions the supervisor specifies) is possible without any repair to the
  device.

## Return checklist (handoff items 1–8)

1. OTA hash/header — above, PASS.
2. preflight snapshot — `raw/pre/` (bridge entry + device state).
3. OTA request/response + terminal state — `raw/ota-update.json` (status error).
4. post-rejoin identity/build/device_config — n/a (no transfer); post-fail
   identity unchanged (`raw/postfail/device-state.json`).
5. calibration/energy/protection — calibration not exposed pre- or post-;
   energy 0.26 unchanged; overload_alarm none; no defaults written.
6. automated canary — NOT RUN (gated on successful OTA).
7. Z2M logs — `raw/log-window/window.log` + `raw/ota-run.log`.
8. relay final state **OFF**; no source modified (executor worked only from
   the frozen artifact bytes; zero commits to `tuya-zigbee-switch`).
