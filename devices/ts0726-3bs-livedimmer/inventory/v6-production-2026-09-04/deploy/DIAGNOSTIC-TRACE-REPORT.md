# DIAGNOSTIC TRACE — Supervisor rulings `5542185070` + `5542213036` (2026-09-04 15:0x–15:23Z)

## What was asked
Validate the truth-cache-fixed production wrapper `9070072`, deploy it (wrapper
only), converge the false cache, then **exactly ONE** debug-level SET of
`switch_right_binded_mode=Never (disabled)` and capture the ZCL write status to
localize the `0xff05=0` failure. Restore prior log level. STOP and return.

## Validation of 9070072 — PASS (installed runtime ZHC 26.103.0)
```text
diff d50fd53..9070072 = wrapper + probe + pytest ONLY (base library untouched)
base library at 9070072 sha256 = a2a40497… == live hardened base (byte-identical)
wrapper blob 5e7f5984  sha256(LF) = cb11ccd54bf1caff7f7b259ff304a3fed022e187cecdcf673949268d81a30bb1
pytest tests/test_bseed_ts0726_v6_production_profile.py => 6 passed
production probe (installed ZHC) => PASS (boundModeSetReadbackVerified, rejectedWritePublishesDeviceTruth)
installed-ZHC probe => PASS (1 custom genBasic reg, 0 custom genOnOffSwitchCfg, mutation=0, 29 exposes processed)
```
The fix is correct: convertSet now does `write -> immediate authoritative readback
-> publish the READBACK`, so it can no longer claim "Never (disabled)" on a
rejected write (probe models the reject case and requires publishing `Short press`).

## Deploy — PASS
Overwrote ONLY `/config/zigbee2mqtt/external_converters/bseed_ts0726_v6_production.js`
(`82a1197e`→`cb11ccd5`); converter_lib base untouched (`a2a40497`). One controlled
restart 15:03:18Z. Startup: production converter loaded, v5 absent, frontend 200,
single production definition, V6 identity unchanged. (`installed-hashes.txt`)

## Step-3 cache convergence — DID NOT PASS (reported honestly)
Ruling expected a GET to re-converge `switch_right_binded_mode` to the real `3`.
It does not. `deploy/convergence-isolated.json` (GET-only, strict publish-barrier):
```text
retained_before: null ; after GET -> base="Never (disabled)", ep="Never (disabled)"
```
The wrapper's `convertGet` issues `endpoint.read([0xff05])` but Z2M republishes the
RETAINED property value rather than re-decoding the read into the base-key; the
generic raw `read` (state_property) DOES return truth `3` (`convergence2.json`,
`fresh-ff05-recheck-120329Z.json`). So the false cache from the old wrapper's
optimistic SET is NOT self-healing via GET — only a raw `read` sees truth. This is
a real residual hazard: the Z2M/HA-exposed property can display a value the device
does not hold, in either direction. (Not fixed by 9070072; 9070072 fixes the WRITE
path, not the retained-state-on-GET path.)

## Steps 4–7 — THE DECISIVE RESULT (one SET, debug-captured, log level restored)
`deploy/trace-result.json`, `deploy/debug-segment.log`, `deploy/ep3-traffic-extract.txt`:
```text
15:17:15  bridge/request/options advanced.log_level=debug -> ok (hot, restart_required:false)
15:17:16  ZCL 0xa4c13843a9d40f85/3 genOnOffSwitchCfg.write({"65285":{"value":0,"type":48}}, disableDefaultResponse:true)
15:17:17  ZCL 0xa4c13843a9d40f85/3 genOnOffSwitchCfg.read([65285])
15:17:17  Received Zigbee message from 'LivingRoomMainDimmer', type 'readResponse',
          cluster 'genOnOffSwitchCfg', data '{"65285":0}' from endpoint 3   <-- DEVICE RETURNED 0
15:17:17  (new wrapper published switch_right_binded_mode="Never (disabled)" == the readback, correctly)
15:17:1x  bridge/request/options advanced.log_level=info  -> restored, configuration.yaml lines 2 & 67 = info (PROVEN)
```
READ-ONLY decay poll (`deploy/decay-poll.json`, unique state_property per sample, NO SET):
```text
15:21:04  65285 = 3
15:21:25  65285 = 3
15:21:45  65285 = 3
15:22:25  65285 = 3
15:23:26  65285 = 3
```

### Corrected root cause (replaces my phase-2 "does not retain" wording)
**The `0xff05=0` write IS ACCEPTED** — there is no ZCL write error, and the device's
own immediate readback returns `0`. The value then **reverts to `3` within
0–210 s** (revert already complete by +3.5 min). So the failure is **NOT** an
SDK-layer write-reject; it is an **asynchronous revert of `binded_mode` to 3** in
firmware (candidates the C-only review can't see from Z2M side: an NVM reload, a
periodic/derived recompute that clamps 0→3, or a watchdog). Localizing further is
firmware-side work, consistent with why the Supervisor opened
`supervisor/ts0726-v7-pure-relay-disable` (@ `2cd2944`, the no-transmit guard) —
which is NOT authorized to build/version/OTA here and was not touched.

SETs performed this phase: **exactly one** (15:17:16). No repeat SETs, no raw
manual attribute write, no bind/group/OTA/mains/re-interview.

## As-left (unchanged from safe checkpoint; log level restored)
```text
definition = production wrapper 9070072 (healthy)
standard 0x0010 = 2/2/2 (ABI intact; trace readResponse confirms EP3 switchActions path)
0xff05 (binded_mode) = 3 on EP1/2/3 NOW (device reverted after the trace SET)
0xff06 (action_mode) = 3/3/3 ; LEFT/MIDDLE at final profile ; RIGHT LED=Physical output, action=3(Match, inert)
mains policy = Always on / Always on / Always on  (RIGHT final flip WITHHELD)
binds = untouched ; logical = OFF/OFF/OFF ; frontend/Z2M healthy ; log_level=info (restored)
Z2M cache caveat: switch_right_binded_mode may still DISPLAY "Never (disabled)" from the
   15:17 readback publish even though the device is now 3 — treat raw read as truth.
```

## Ruling compliance
Steps 1–2 PASS. Step 3 reported NOT achieved (GET no self-heal; documented). Steps
4–7 executed exactly once with capture + verified log-level restore. STOP before
§6 bind removal / RIGHT mains flip / physical acceptance per the still-forbidden
list. Rollback to v5 transition remains armed (`backup-production-20260904/`).
Operator resting-state requirement (logical->physical->LED OFF) recorded; still
predicated on the firmware revert being fixed.
