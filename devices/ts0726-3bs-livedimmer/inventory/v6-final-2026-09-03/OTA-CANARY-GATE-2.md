# TS0726 V6 OTA CANARY GATE 2 — after V5→V6 transition PASS

Date: 2026-09-03

## Precondition proven live

Executor Step-B transition result:
- issue comment 5528009509
- branch executor/ts0726-v6-software-live-2026-09-03
- commit 50a6f49d66b28c1662f3758bc53db653d77f18ef

Verified from committed evidence:
- frontend PASS / HTTP 200
- Z2M healthy
- V5 identity retained
- canonical device_config retained
- EP4/5/6 Mains power = Always on / Always on / Always on
- devices 104 -> 104
- ieee_set_delta = []
- changed = []
- groups_delta = []
- no V6 parallel converter file
- transition definition exact blob ae48e23a974244923ab3a27a69a7e5341c920eb4

Important evidence correction:
the narrative observation that LEFT action read "Match local state" is not present in the
saved live GET evidence. Both:
- transition/post-restart-properties.json
- transition/post-restart-public-get.json
record LEFT = NO_RESPONSE, MIDDLE = NO_RESPONSE, RIGHT = Toggle.
No target Zigbee writes occurred in the transition work unit. Therefore the last hard-proven
raw pre-transition standard action state remains the V5 evidence 2/2/2. The V6 post-OTA
gate nevertheless re-reads both standard and custom attributes before any policy write.

## Frozen single transition converter remains installed

repo analienx/tuya-zigbee-switch
branch supervisor/target-overlay-v56-transition
commit 833b117388b3a324b71e12963e277a342c4c49da
path zigbee2mqtt/converters/bseed_ts0726_v5.js
blob ae48e23a974244923ab3a27a69a7e5341c920eb4
live SHA256 from executor = 9b34e77292a9a7e0776a0bf68865e764533a057b484b2f006daf0bfea17e9093

Do not add bseed_ts0726_v6.js.
The same transition definition handles V5 forward, V6 forward and V5 emergency recovery.

## Frozen OTA artifacts

Forward:
- swBuildID 1.1.6-bseedv6
- fileVersion 285356039
- manufacturerCode 4417
- imageType 45577
- forward.ota SHA256 d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c

Recovery:
- exact proven V5 source
- swBuildID 1.1.5-bseedv5
- fileVersion 285356040
- manufacturerCode 4417
- imageType 45577
- canonical pin map
- no MIGRATION_REVERT
- recovery.ota SHA256 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19

Recovery is deliberately higher-version and therefore must NEVER be exposed in the same
active OTA index as the forward image. Preflight one index at a time.

## Work unit C — OTA preflight only

Rehash existing staged artifacts. No re-download is required if exact.

1. Activate FORWARD-ONLY target-local OTA index/server.
2. CHECK target 0xa4c13843a9d40f85.
3. Require selected image exactly:
   - 285356039 / 4417 / 45577
   - SHA256 d18c420...
4. Stop/disable forward index.
5. Activate RECOVERY-ONLY target-local OTA index/server.
6. CHECK same target.
7. Require exactly:
   - 285356040 / 4417 / 45577
   - SHA256 4a09b522...
8. Stop/disable recovery index.
9. Reactivate FORWARD-ONLY index.
10. Repeat CHECK and again require exact forward image.

If any CHECK differs: STOP, no UPDATE.

Recovery artifact remains staged locally but is not in the active forward index.

## Work unit D — exactly one target-only forward OTA

Only after C PASS:
- UPDATE only IEEE 0xa4c13843a9d40f85
- no wildcard/group/fleet OTA
- no other setting write during OTA
- wait for completed update and device return

## Work unit E — immediate read-only V6 safety gate

Before any configurable setting write or physical button press require:

Identity:
- softwareBuildID visible to Z2M = 1.1.6-bseedv6
- fileVersion = 285356039
- transition definition remains selected
- no separate V6 converter file

Hardware:
- device_config exact canonical string
- EP4/5/6 genOnOff 0xff03 = 1/1/1
- LED source EP4/5/6 0xff01 = 4/4/3

Topology/service:
- frontend healthy
- Z2M healthy
- IEEE set unchanged
- groups unchanged
- target bindings unchanged
- target configured_reportings unchanged
- no interview/re-pair

Action storage:
- read STANDARD EP1/2/3 genOnOffSwitchCfg 0x0010
- read CUSTOM EP1/2/3 genOnOffSwitchCfg 0xff06

Expected from last hard-proven V5 state and migration:
- standard = 2/2/2
- custom = 2/2/2

If identity is V6 but action values differ:
- do NOT immediately recover if mains/config/service are safe;
- record exact raw values and STOP for Supervisor unless standard action is outside 0..2.
- any standard value 3/4 after V6 boot is a firmware standards-cleanliness FAIL and requires
  Supervisor ruling before proceeding.

Safety-critical failure:
- canonical config changed;
- EP4/5/6 not 1/1/1;
- Z2M/frontend unrecoverable;
- target disappears / cannot be controlled safely.

For safety-critical failure only:
1. deactivate forward index;
2. activate RECOVERY-ONLY index;
3. CHECK exact recovery 285356040 / SHA256 4a09b522...;
4. issue ONE target-only recovery UPDATE;
5. require 1.1.5-bseedv5 / 285356040, transition definition, canonical config, mains 1/1/1;
6. STOP.

After recovery, do not attempt the lower-version V6 forward again. A new forward version >285356040
would be required.

## Work unit F — set final Direct-binding policy, no physical press

Only after full E PASS.

Use ordinary transition-overlay public controls:
- LEFT = Match local state
- MIDDLE = Match local state
- RIGHT = Toggle

Require raw:
- custom 0xff06 = 3/3/2
- standard 0x0010 remains 2/2/2

Require public GET:
- LEFT = Match local state
- MIDDLE = Match local state
- RIGHT = Toggle

One controlled Z2M restart.
After restart fresh reads must still be:
- custom = 3/3/2
- standard = 2/2/2
- public = Match / Match / Toggle
- frontend healthy
- topology delta 0

This restart proves converter readback and NVM survives Z2M restart; it does not independently
prove a device power-cycle. The firmware OTA boot + subsequent successful custom write/read is
sufficient for this software gate; physical power-cycle acceptance is not authorized here.

## Work unit G — advanced UX + final software profile

After F PASS:
- fresh Advanced Hardware configuration GET = canonical
- locked config save rejected with zero Zigbee traffic/reboot
- Enable editing emits zero Zigbee traffic
- >60 seconds expires
- save rejected again, zero traffic/reboot
- NO successful config commit

Capture desktop + mobile UI.

LEFT require:
- Mains Always on
- LED Binding status
- Direct-binding Match local state
- Update local state Short press
- Control bound light Short press
- Local state channel Left

MIDDLE:
- same, channel Middle

RIGHT remains before operator:
- Mains Always on
- LED Physical output
- Direct-binding Toggle
- Update local state Short press
- Local state channel Right

Do NOT set RIGHT Mains Follow logical state yet.

## Return and STOP

If C-G all pass:

V6_SOFTWARE_LIVE PASS
transition_overlay=PASS
forward_preflight=PASS
recovery_preflight=PASS
v6_identity=PASS
mains_safety=PASS
standard_actions=2/2/2
custom_binding=3/3/2
topology_delta=0
device_config_get=PASS
advanced_lock=PASS
desktop_ux=PASS
mobile_ux=PASS
READY_FOR_V6_OPERATOR
evidence=<full SHA>

Still forbidden:
- successful device_config commit
- physical button presses
- RIGHT Follow logical state
- bind/unbind/group mutation
- interview/re-pair
- coordinator mutation
- HA v2 deployment
