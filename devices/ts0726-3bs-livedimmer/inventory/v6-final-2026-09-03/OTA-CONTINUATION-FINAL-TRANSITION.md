# TS0726 V6 OTA CONTINUATION — FINAL TRANSITION OVERLAY — 2026-09-03

## Accepted executor gate

Issue comment:
- 5528009509

Evidence:
- branch executor/ts0726-v6-software-live-2026-09-03
- commit 50a6f49d66b28c1662f3758bc53db653d77f18ef

Accepted:
- V56_TRANSITION_STEP_B PASS
- frontend PASS
- Z2M health PASS
- V5 identity PASS
- canonical config PASS
- mains 1/1/1 PASS
- topology delta 0
- transition definition PASS
- no OTA / setting writes / topology mutation / physical press / HA deployment

Evidence note:
the report prose says LEFT/RIGHT action reads returned Match/Toggle, but the committed JSON
post-restart-public-get.json and post-restart-properties.json show:
- LEFT = NO_RESPONSE
- MIDDLE = NO_RESPONSE
- RIGHT = Toggle
Therefore LEFT/MIDDLE legacy action values are not considered proven before OTA. This is not a
blocker because V6 migration explicitly handles legacy 0..4.

## Final transition-overlay hardening after Step-B PASS

Reason:
the transition initially selected V5/V6 action transport from Herdsman's cached
device.softwareBuildID. Firmware Basic/swBuildId is read-only but not automatically reported at boot,
so cached identity could remain V5 immediately after an OTA reboot.

Final design:
every Direct-binding command SET/GET first performs a fresh read:

EP1 genBasic / swBuildId (0x4000)

Then:
- fresh 1.1.5-bseedv5 -> standard named switchActions, allowed 0..2
- fresh 1.1.6-bseedv6 -> raw genOnOffSwitchCfg/0xff06, allowed 0..4
- unknown identity -> fail closed
- Basic identity read failure -> fail closed
- stale meta.device.softwareBuildID is ignored

No action-cluster write/read is attempted until fresh identity is proven.

Final transition source:
- repo analienx/tuya-zigbee-switch
- branch supervisor/target-overlay-v56-transition
- commit 7d649cbac2224c2ecbe73a022011434aaa133898
- path zigbee2mqtt/converters/bseed_ts0726_v5.js
- git blob ed8ee78f882c936afd9a4008ed4f70559c3a5cf7

Repository tests:
- run 33777723492
- test job 100723492482
- PASS
- lint failure only the same unrelated Silicon Labs vendor formatter files

Final exact-runtime validation:
- validation branch supervisor/validate-v56-transition-final
- workflow commit a5f33623a6b46b521167c6da6df4324b37e44a0c
- run 33777822338
- job 100723825391
- PASS

Exact package set:
- zigbee-herdsman-converters 26.90.0
- zigbee2mqtt-windfront 2.14.0

Validated:
- transition processed frontend expose payload byte-identical to frozen V5.1
- exact WindFront package load
- one custom Basic registration only
- no custom genOnOffSwitchCfg registration
- V5 standard action transport
- V6 custom 0xff06 transport
- stale cached V5 identity ignored when fresh Basic returns V6
- fresh firmware identity read occurs before action transport selection
- Basic identity read failure fails closed
- unknown firmware fails closed
- V5 3/4 rejection emits only the Basic identity read and no action-cluster write
- protected device_config transport
- historical action API

## Firmware artifacts remain frozen and unchanged

Forward:
- softwareBuildID 1.1.6-bseedv6
- fileVersion 285356039
- manufacturerCode 4417
- imageType 45577
- forward.ota SHA256 d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c

Recovery:
- exact proven V5 source 69a4775c4cb4c87f2e948a8aa5b6f099df703ba5
- softwareBuildID 1.1.5-bseedv5
- fileVersion 285356040
- canonical config
- no MIGRATION_REVERT
- recoveryChangesPinMap=false
- recovery.ota SHA256 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19

Artifact:
- run 33731847836
- artifact bseed-ts0726-v6-final
- artifact ID 9884225463
- archive SHA256 4064e440c96933b0de1a41d3224f6eec00ff08577da38d94b70f234cd3626efc

## Live continuation contract

### 1. Load final transition revision

Current live transition is older commit 833b117... and already proved frontend-safe.

Replace in place only:
- /config/zigbee2mqtt/external_converters/bseed_ts0726_v5.js

with final exact blob:
- commit 7d649cb...
- blob ed8ee78f...

No separate bseed_ts0726_v6.js may exist.

One controlled Z2M restart.

Require:
- frontend healthy
- Z2M healthy
- target V5 identity unchanged
- canonical config
- mains 1/1/1
- topology delta 0
- no target writes during restart

If fail, restore exact proven V5.1 backup and stop.

### 2. OTA preflight

Re-verify exact forward/recovery files and target-only local indexes.

Forward CHECK:
- update available
- fileVersion 285356039
- mfr 4417
- imageType 45577
- selected SHA256 exact forward pin

Recovery CHECK:
- update available
- fileVersion 285356040
- mfr 4417
- imageType 45577
- selected SHA256 exact recovery pin

No OTA if either CHECK differs.

### 3. One target-only forward OTA

Target:
0xa4c13843a9d40f85

One UPDATE only. No wildcard/group/fleet OTA.

### 4. Immediate read-only safety gate

Require:
- OTA installed version 285356039
- canonical device_config exact
- EP4/5/6 physical mode 1/1/1
- EP4/5/6 LED source 4/4/3
- standard EP1/2/3 switchActions 0x0010 = 2/2/2
- custom EP1/2/3 binding mode 0xff06 each is a valid 0..4 value
- frontend healthy
- Z2M healthy
- IEEE/groups/bindings/reportings delta 0

Do NOT require initial custom 2/2/2. LEFT/MIDDLE pre-OTA legacy action values were not
reliably readable and V6 deliberately migrates any legacy 0..4 value.

Also prove fresh Basic identity directly:
- EP1 genBasic swBuildId readResponse = 1.1.6-bseedv6

A stale bridge/devices software_build_id cache alone is NOT a failure if the fresh Basic read is V6.
The final transition action converter ignores that stale cache.

Safety-critical failure:
use exact recovery once, verify canonical V5 recovery state, then stop.

### 5. Configure final custom policy — no physical press

Ordinary public SETs:
- LEFT Direct-binding command = Match local state
- MIDDLE Direct-binding command = Match local state
- RIGHT Direct-binding command = Toggle

Each public SET must first fresh-read EP1 Basic/swBuildId and receive 1.1.6-bseedv6 before the
action-cluster write.

Require after SET:
- custom 0xff06 = 3/3/2
- standard 0x0010 remains 2/2/2
- public GET = Match local state / Match local state / Toggle
- fresh identity reads occurred before each Direct-binding GET/SET

If a fresh identity read times out, retry is allowed; do not bypass it with raw/manual writes.

One controlled Z2M restart, then verify again:
- custom 3/3/2
- standard 2/2/2
- public values correct
- topology delta 0
- frontend healthy

Do not describe a Z2M restart as proof of device NVM persistence across a device reboot.

### 6. Finish software/UX gate

Fresh Advanced Hardware configuration GET:
- canonical config exact

Protected editor:
- locked save rejects without Zigbee mutation/reboot
- Enable editing emits zero Zigbee traffic
- expiry >60 s relocks
- second save rejects without Zigbee mutation/reboot

No successful device_config commit.

Prepare:
LEFT:
- Mains Always on
- LED Binding status
- Direct-binding Match local state
- Update local Short press
- Control bound light Short press
- Local channel Left

MIDDLE:
same / Middle

RIGHT:
- Mains remains Always on for now
- LED Physical output
- Direct-binding Toggle
- no hard-power activation yet

Capture desktop/mobile WindFront UX.

### 7. Return and STOP

Return:
V6_SOFTWARE_LIVE PASS
v6_ota=PASS
fresh_swBuildId=1.1.6-bseedv6
mains_safety=PASS
standard_actions=2/2/2
custom_binding=3/3/2
topology_delta=0
device_config_get=PASS
advanced_lock=PASS
desktop_ux=PASS
mobile_ux=PASS
READY_FOR_V6_OPERATOR
evidence=<SHA>

Still forbidden:
- physical button presses
- RIGHT Mains Follow logical state
- successful device_config commit
- bind/unbind/group mutation
- interview/re-pair
- coordinator mutation
- HA v2 deployment

Physical operator acceptance remains a separate Supervisor gate.
