# CANARY REPORT — P003 (finalization, predecessor 0x12053000)

- Authorization: issue #11 comment `5560609637` (APPROVED / OTA-CANARY — P003 FINALIZATION)
- Executed: 2026-09-06, DIRECT_LOCAL_TOOLKIT (`tools/pm003.js`), all mutations target-only
- Frozen source: PR #5 head `ded91a1fb1cdeb320d0858c8f4bcabab32bf5564` — reconfirmed pre-run, untouched
- Artifact: `forward.ota` 195394 B, SHA256 `c3ccb484…fe7c`, header 4417/43556/302329858 — verified in-container pre-schedule

## RESULT

```json
{"result": "P003_POWER_CYCLE_UNAVAILABLE", "unschedule": {"ok": true, "sched": "idle"}, "finishedAt": "2026-09-06T18:46:41Z"}
```

## Timeline (UTC, HA host clock)

- 18:01:25  log-source snapshot (file log first/last timestamps recorded BEFORE scheduling)
- 18:01:26  schedule hex OTA -> status ok, url /config/zigbee2mqtt/ota/bseed-ts011f-pm-v8-ded91a1.ota; update.state=scheduled
- 18:13:47  power_cycle UNAVAILABLE recorded (operator: inbuilt wall socket shares breaker with coordinator/HA infrastructure; target-only power cycle impossible without switching unrelated infrastructure — forbidden by ruling step 5)
- 18:46:34  deterministic unschedule -> status ok, update.state=idle
- 18:46:41  result written

## Key observations

- Continuous bounded MQTT capture (3693 lines) covering the ENTIRE armed window (18:01:26–18:46:41):
  INFO `Updating 'LivingRoomSocketWifiLeft'` count = **0** (deterministic event for any processed query, proven in P002 correction) -> no Query Next Image occurred while armed, consistent with P002.
- No transfer, no blocks, no availability flips of the target.
- Unrelated events in window (not ours, not touched): HallBulb2/3 ZCL timeouts; LivingRoomCircleLightDimmer OTA INVALID_IMAGE at 18:30:54 (originated outside this run).
- Final device health: relay **OFF**, installed 302329856 (`1.2.5-8b8cc492`) unchanged, update.state=idle, online, energy 0.26 nondecreasing. No reboot loop.
- Note: Z2M stored the scheduled hex at `/config/zigbee2mqtt/ota/bseed-ts011f-pm-v8-ded91a1.ota`; left in place (config-dir writes not authorized in P003).

## FINALIZATION_FALLBACK (prepared per ruling, read-only/offline)

### A. Stock-family OTA execution path
- Stock inventory (live, read-only): `raw/stock-inventory.json` — 35 family devices.
- Genuine unconverted stock `_TZ3000_b28wrpvx / TS011F` candidates (no custom build id): LivingRoomSocketWifiRight, LivingRoomSocketHA, LivingRoomSocketTableLeft/Right, LivingRoomSocketEntrance, KitchenSocketLeft/Right, LivingRoomSocketHifiLeft (0 W measured — unloaded), LivingRoomSocketHifiRight.
- NOT eligible: WorkroomSocketCabinet and LivingRoomSocketWifiLeft (already custom, advertise 43556).
- Best candidate by noncritical/unloaded criteria: LivingRoomSocketHifiLeft; alternates KitchenSocketRight, LivingRoomSocketTableRight. Selection is a Supervisor decision; nothing mutated.
- Wrapper: `tools/bseed-ts011f-pm-v8-ded91a1-from_tuya.bin` + `tools/wrapper-proof.json`
  - derivation per proven issue-#1 Workroom `from_tuya` model, applied to the exact frozen V8 bytes;
  - ONLY bytes 12–17 differ: imageType 43556->54179 (stock 0xD3A3), fileVersion 0x12053002->0xFFFFFFFF (forced outer version);
  - inner Telink payload (offsets 56..195393) byte-identical to frozen forward.ota; totalImageSize unchanged (195394);
  - wrapper SHA256 `032cfc6b604da15d5eabba5368706ec54a93adad972f16336a516a473f8cf8d0`, SHA512 `cea55949…72ac`;
  - NOT published, NOT flashed; PR #5 source untouched (packaging only).

### B. Wired recovery/deployment feasibility
`SWS_PATH_NOT_PROVEN_ON_THIS_CANARY` — no empirically proven unpowered SWS/RST/3V3/GND readback + full-flash/NVM-preserving write procedure exists in the inventory for LivingRoomSocketWifiLeft. Minimum missing prerequisite: a documented, board-verified Telink swire dump+restore run on this exact hardware revision with mains fully removed. Never connect a programmer while mains is present.

## Boundaries honored
No code changes to PR #5, no merge, no release/index publish, no device_config write, no calibration change, no factory-reset/re-pair, no other device flashed, no SWS write. Relay left OFF.
