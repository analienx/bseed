# TS0726 V6 OTA RESUME GATE — after transition Step-B PASS

Date: 2026-09-03

## Accepted live evidence

Executor issue comment:
- 5528009509

Evidence:
- repo: analienx/bseed
- branch: executor/ts0726-v6-software-live-2026-09-03
- commit: 50a6f49d66b28c1662f3758bc53db653d77f18ef

Accepted:
- V56_TRANSITION_STEP_B PASS
- frontend PASS / HTTP 200
- Z2M health PASS
- target remains 1.1.5-bseedv5
- canonical config PASS
- EP4/5/6 mains = 1/1/1
- topology delta = 0
- transition definition PASS
- exact installed ZHC 26.90.0 probe PASS
- no OTA, writes, button presses, topology mutation or HA deployment occurred

Live transition overlay now intentionally remains installed IN PLACE:
- repo: analienx/tuya-zigbee-switch
- branch: supervisor/target-overlay-v56-transition
- commit: 833b117388b3a324b71e12963e277a342c4c49da
- path: zigbee2mqtt/converters/bseed_ts0726_v5.js
- git blob: ae48e23a974244923ab3a27a69a7e5341c920eb4
- live SHA256 reported by executor:
  9b34e77292a9a7e0776a0bf68865e764533a057b484b2f006daf0bfea17e9093

No separate bseed_ts0726_v6.js may be present.

## Frozen OTA artifact remains valid

GitHub Actions:
- run: 33731847836
- artifact: bseed-ts0726-v6-final
- artifact ID: 9884225463
- expired: false
- expires: 2026-10-03
- archive SHA256:
  4064e440c96933b0de1a41d3224f6eec00ff08577da38d94b70f234cd3626efc

Forward:
- softwareBuildID: 1.1.6-bseedv6
- fileVersion: 285356039
- manufacturerCode: 4417
- imageType: 45577
- forward.ota SHA256:
  d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c

Recovery:
- exact proven V5 source, canonical pin map, NO MIGRATION_REVERT
- softwareBuildID: 1.1.5-bseedv5
- fileVersion: 285356040
- manufacturerCode: 4417
- imageType: 45577
- recovery.ota SHA256:
  4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19

## Migration nuance

The current transition-overlay work unit could not reliably read LEFT/MIDDLE standard
switchActions before OTA; evidence files show:
- LEFT = NO_RESPONSE
- MIDDLE = NO_RESPONSE
- RIGHT = Toggle

Historical V5.1 live evidence had standard LEFT/MIDDLE at 2/2 and RIGHT is expected 2.

V6 migration semantics are:
- legacy standard action 0..2 -> custom binding policy gets same value, standard stays 0..2
- legacy BSEED 3/4 -> custom binding policy gets 3/4, standard is normalized to Toggle=2
- custom policy is then independently stored in new NVM

Therefore the immediate post-OTA gate MUST NOT assume custom 0xff06 starts at 2/2/2.
It is migration output.

However, before any physical acceptance the standard action MUST be 2/2/2. Any 0/1
value post-OTA is unexpected drift and is a STOP condition.

## C. Exact OTA CHECK gate

Re-hash all staged artifacts before use.

Forward CHECK target-only must prove:
- update_available = true
- candidate fileVersion = 285356039
- manufacturerCode = 4417
- imageType = 45577
- candidate SHA256 exactly d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c

Recovery CHECK target-only must prove:
- update_available = true
- candidate fileVersion = 285356040
- manufacturerCode = 4417
- imageType = 45577
- candidate SHA256 exactly 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19

Keep recovery source/index available until canary completes.

If either CHECK fails: STOP. No OTA UPDATE.

## D. One target-only forward OTA

Only after C PASS:
- target IEEE = 0xa4c13843a9d40f85
- issue exactly ONE forward OTA UPDATE
- no wildcard/group/fleet OTA

## E. Immediate post-OTA read-only gate

Before any setting SET or physical press, require:

Identity:
- softwareBuildID = 1.1.6-bseedv6
- installed fileVersion = 285356039
- model = EC-GL86ZPCS31
- source = external
- the SAME transition overlay remains selected
- no separate V6 converter file exists

Service:
- frontend healthy / port 8099 open / HTTP healthy
- Z2M healthy
- no converter startup error
- no custom genOnOffSwitchCfg cluster registration

Electrical safety:
- device_config canonical exactly
- EP4/EP5/EP6 physical mode 0xff03 = 1/1/1
- LED source EP4/EP5/EP6 0xff01 = 4/4/3

Standard action:
- read EP1/EP2/EP3 genOnOffSwitchCfg switchActions / 0x0010
- MUST equal 2/2/2
- if any endpoint is 0 or 1: unexpected migration drift -> STOP
- if repeated read cannot establish the value: STOP before physical gate

Initial custom migration output:
- read EP1/EP2/EP3 genOnOffSwitchCfg 0xff06
- each must decode to a valid value 0..4
- record exact triplet as MIGRATED_CUSTOM_PRESET
- do NOT fail merely because LEFT/MIDDLE are already 3
- RIGHT is expected 2; if RIGHT != 2, STOP for Supervisor

Topology:
- IEEE set unchanged
- groups unchanged
- target bindings unchanged
- target configured_reportings unchanged
- no interview/re-pair

Safety-critical fail:
- canonical config changed, mains != 1/1/1, unrecoverable Z2M/frontend health, identity mismatch
=> use exact preflighted recovery OTA ONCE.

After recovery require:
- sw 1.1.5-bseedv5
- fv 285356040
- transition overlay still selected
- canonical config
- mains 1/1/1
- frontend healthy
- topology delta 0
Then STOP.

Non-safety functional/UX fail:
- leave electrically safe V6 installed
- STOP for Supervisor
- do not recover merely for a UI defect.

## F. Intentionally establish final direct-binding policy

Only after E PASS.

Using ordinary public WindFront controls through the transition overlay:

LEFT:
- Direct-binding command = Match local state

MIDDLE:
- Direct-binding command = Match local state

RIGHT:
- Direct-binding command = Toggle

Require fresh raw/custom readback:
- EP1 0xff06 = 3
- EP2 0xff06 = 3
- EP3 0xff06 = 2

Require standard action remains:
- EP1/EP2/EP3 0x0010 = 2/2/2

Require public GET:
- LEFT = Match local state
- MIDDLE = Match local state
- RIGHT = Toggle

One controlled Z2M restart.
After restart repeat fresh reads:
- custom = 3/3/2
- standard = 2/2/2
- public = Match local state / Match local state / Toggle
- frontend still healthy
- topology delta 0

Evidence wording:
a Z2M restart proves converter/readback stability, not device-power-cycle NVM persistence.
Firmware NVM persistence is covered by simulator/release tests; no electrical device power-cycle
is authorized in this software gate.

## G. Final software/UX gate — no physical press

Fresh Advanced — Hardware configuration GET:
- exact canonical value
- fresh device read/readResponse evidence

Protected editor:
- locked save rejects with zero Zigbee traffic/reboot
- Enable editing emits zero Zigbee traffic
- wait >60s
- save rejects again with zero traffic/reboot
- DO NOT perform a successful unlocked device_config commit

Final LEFT software profile:
- Mains power = Always on
- LED shows = Binding status
- Direct-binding command = Match local state
- Update local state = Short press
- Control bound light = Short press
- Local state channel = Left

Final MIDDLE software profile:
- Mains power = Always on
- LED shows = Binding status
- Direct-binding command = Match local state
- Update local state = Short press
- Control bound light = Short press
- Local state channel = Middle

RIGHT remains pre-operator:
- Mains power = Always on
- LED shows = Physical output
- Direct-binding command = Toggle
- Update local state = Short press
- Local state channel = Right
- DO NOT set Mains power = Follow logical state yet

Capture desktop + mobile WindFront and confirm human labels.

## H. Return and STOP

Require final return:

V6_SOFTWARE_LIVE PASS
transition_overlay=PASS
v6_identity=PASS
frontend=PASS
mains_safety=PASS
standard_actions=2/2/2
migrated_custom_initial=<triplet>
custom_binding_final=3/3/2
device_config_get=PASS
advanced_lock=PASS
desktop_ux=PASS
mobile_ux=PASS
topology_delta=0
READY_FOR_V6_OPERATOR
evidence=<SHA>

Then STOP.

Still forbidden:
- successful unlocked device_config commit
- bind/unbind/group mutation
- interview/re-pair
- coordinator mutation
- physical button presses
- HA v2 deployment
- LEFT/MIDDLE Mains != Always on
- RIGHT Mains = Follow logical state
