# TS0726-3-BS V6 FINAL RELEASE GATE — 2026-09-03

Target:
- friendly name: LivingRoomMainDimmer
- IEEE: 0xa4c13843a9d40f85
- manufacturer: iedhxgyi / _TZ3000_iedhxgyi
- modelID: TS0726-3-BS
- board: SWITCH_BSEED_TS0726_3GANG

## Why V6 exists

V5/V5.1 proved the endpoint routing fixes and all mains-safety behavior, but live writes of
standard genOnOffSwitchCfg/switchActions (0x0010) could not reliably carry the BSEED-only
values 3/4. The V5.2 custom-cluster override also regressed Z2M health and was rolled back.

V6 therefore stops overloading the standard attribute.

Standard Zigbee:
- genOnOffSwitchCfg / 0x0010 switchActions remains 0..2.

BSEED direct-binding policy:
- genOnOffSwitchCfg / 0xff06, ENUM8, writable
- 0 = On then off
- 1 = Off then on
- 2 = Toggle
- 3 = Match local state
- 4 = Opposite local state

The standard local switch action and the direct-binding command policy are separate runtime
fields. The custom policy is stored in separate NVM slots 46..50; existing v5 NVM ABI is
unchanged.

Compatibility:
- standard action writes 0..2 continue to synchronize the binding policy to the same value;
- legacy writes 3/4 are captured into the custom binding policy and standard switchActions is
  normalized to Toggle (2);
- on first V6 boot with no custom NVM, policy migrates from the legacy action value;
- current live V5 raw action state is 2/2/2, therefore first V6 boot is expected to expose
  custom policy 2/2/2 until LEFT/MIDDLE are intentionally configured to 3.

## Frozen firmware source

Repository: analienx/tuya-zigbee-switch
Branch: supervisor/ts0726-redesign-v6-clean-binding-mode
Source commit: 182c0195a8bb781abd7c4f1e2508278079b7b119

Relevant validation:
- firmware simulator test job: PASS
- all Supervisor-changed C/H files formatter-clean
- repository lint remains red only on the two pre-existing Silicon Labs vendor files:
  - src/silabs/spiflash_extension/spiflash/btl_storage_spiflash.c
  - src/silabs/spiflash_extension/spiflash/btl_storage_spiflash_configs.h

V6 release build script:
- make_scripts/build_bseed_ts0726_v6.sh
- softwareBuildID: 1.1.6-bseedv6
- fileVersion: 285356039 / 0x11023007
- manufacturerCode: 4417
- imageType: 45577
- canonical config guard enabled
- no MIGRATION_REVERT

## Frozen V6 Zigbee2MQTT overlay

Repository: analienx/tuya-zigbee-switch
Branch: supervisor/target-overlay-v6-clean-binding-mode
Commit: e31221ff19ecb0f90651690a243f9afb28b71b70
Path: zigbee2mqtt/converters/bseed_ts0726_v6.js
Git blob: b64d6af4f60adfd56ee984baad0826d25797f488

Matcher:
- manufacturerName = iedhxgyi
- modelID = TS0726-3-BS
- softwareBuildID = 1.1.6-bseedv6
- priority 100

Direct-binding command uses raw custom 0xff06. It does NOT override or register
genOnOffSwitchCfg as a custom cluster.

The proven V5.1 overlay remains untouched and must remain installed beside V6 for rollback:
- current live V5.1 overlay source commit d0ec7c1b3b67cf8265244b768b76684e44691374
- current verified live SHA256 4940ad694de9c61e9afbdd529f59ffcf02edf3dc707979301dfc7a73068e5bda

## Exact ZHC validation

Exact package:
- zigbee-herdsman-converters 26.90.0

Workflow:
- run 33732054756
- job 100574021869
- PASS

Passed:
- exact installed-ZHC converter loading;
- processed human exposes;
- only the already-proven genBasic custom decoder registration;
- ordinary unscoped EP1..EP6 routing probe;
- V6 Direct-binding command routing to custom 0xff06;
- protected device_config transport;
- historical action API;
- zero bind/unbind/reporting mutation from converter configure.

## Frozen real Telink artifacts

Build workflow:
- branch supervisor/build-v6-final
- workflow commit 411854baa5ce3cf84c834709ffb2159084b7222c
- run 33731847836
- job 100573355841
- PASS
- artifact: bseed-ts0726-v6-final
- artifact ID: 9884225463
- artifact archive SHA256:
  4064e440c96933b0de1a41d3224f6eec00ff08577da38d94b70f234cd3626efc
- artifact expires 2026-10-03

### Forward V6

Source commit:
182c0195a8bb781abd7c4f1e2508278079b7b119

Identity:
- softwareBuildID = 1.1.6-bseedv6
- fileVersion = 285356039
- manufacturerCode = 4417
- imageType = 45577

forward.bin:
- bytes = 185781
- SHA256 = 6241ae184654bba023224496ffc6535e0fa2fdfdf07056e5afec766f0b249e97
- SHA512 = 9f03405fd7bf9b6dacfbd74a4915f5eba441e5b4957be1ccb54b17c9c13f8372f987d341268dec5cfdc21dc0f97024b9da1c7e5736a0c57fcc16b85bf4c4ed1d

forward.ota:
- bytes = 185858
- SHA256 = d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c
- SHA512 = c95a1fe94e7d6a06567d651c370fbe9d2e333d5f45e059d02cf9ce05f3db575d581b06811c9cda0ea2103301c1a1c8e3c622d652d51cd7844975d84dc335e7e6

OTA header independently parsed during build:
- identifier = 0x0BEEF11E
- headerVersion = 0x0100
- headerLength = 56
- fileVersion = 285356039
- manufacturerCode = 4417
- imageType = 45577
- stackVersion = 2

### Emergency rollback — PROVEN V5 CODE, CANONICAL, NO PIN-MAP REVERT

This intentionally replaces the old swapped-pin recovery strategy.

Source commit:
69a4775c4cb4c87f2e948a8aa5b6f099df703ba5

Identity:
- softwareBuildID = 1.1.5-bseedv5
- fileVersion = 285356040
- manufacturerCode = 4417
- imageType = 45577

It is the exact proven/live V5 code rebuilt at a higher OTA version.
It uses the canonical config and forward migration safety logic.
It does NOT compile MIGRATION_REVERT and therefore does NOT restore the historical swapped
GPIO map. After recovery it matches the already-proven V5 overlay again.

recovery.bin:
- bytes = 185613
- SHA256 = 3dfdaf732c94c751f65a75274d0947a852add7b34c636c44466b92724315a139
- SHA512 = 6a1649d35cc90a3e24d4b778c63c174c7ca8c33548ddb6b6b03af85698b0438c93deb03b90ea248c1156b2b425fa0bd7d1c88c94c14c4fb1e4e1ae13938d9cae

recovery.ota:
- bytes = 185682
- SHA256 = 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19
- SHA512 = 12bf5c3bcb0ab0d02d61b11790e9c144f0b66f47f33e5f0b596d6a10fb24a10877fc9e3051ba830ae330dcde8106e3aced8b1253a1902a4f43d9cb8fe8c74c8f

OTA header independently parsed during build:
- identifier = 0x0BEEF11E
- headerVersion = 0x0100
- headerLength = 56
- fileVersion = 285356040
- manufacturerCode = 4417
- imageType = 45577
- stackVersion = 2

Manifest explicitly records:
recoveryChangesPinMap = false

## HA

Corrected HA v2 remains staged only:
- repository analienx/home-assistant-stack
- branch supervisor/ts0726-post-migration-ha-v2
- commit 9472e5b2825e0c1db5705f2b0b2f63349fb09864

Do not deploy before physical V6 acceptance.

## Final per-channel product target

LEFT:
- Mains power = Always on
- LED shows = Binding status
- Direct-binding command = Match local state
- Update local state = Short press
- Control bound light = Short press
- Local state channel = Left

MIDDLE:
- same, Local state channel = Middle

RIGHT:
- Mains power = Follow logical state — operator stage only
- LED shows = Physical output
- Update local state = Short press
- Local state channel = Right
- Direct-binding policy/topology stays existing Toggle unless separately authorized
- hard-power behavior is intentional

## Executor staging and canary contract

### A. Baseline before staging

Require:
- live sw = 1.1.5-bseedv5
- live fv = 285356037
- canonical device_config exactly:
  iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;
- raw EP4/EP5/EP6 genOnOff 0xff03 = 1/1/1
- current V5.1 overlay hash exact
- current target bindings/reportings/groups captured
- current bridge IEEE set/count captured

If baseline changed unexpectedly: STOP.

### B. Stage V6 overlay BESIDE V5

Do not replace/remove V5.

Copy only exact:
zigbee2mqtt/converters/bseed_ts0726_v6.js
from e31221ff19ecb0f90651690a243f9afb28b71b70.

Record:
- source commit
- Git blob
- local bytes
- local SHA256

Before restart run composition test:
- current 1.1.5-bseedv5 -> V5 overlay
- candidate 1.1.6-bseedv6 -> V6 overlay
- no other current bridge device newly matches V6

One controlled Z2M restart.

Require:
- Z2M healthy;
- WindFront reachable;
- both V5 and V6 overlays loaded;
- current target still V5 and selected by V5 overlay;
- IEEE set unchanged;
- groups unchanged;
- target bindings/reportings unchanged;
- no interview/re-pair;
- no custom genOnOffSwitchCfg cluster registration/service regression.

If health regresses: remove ONLY V6 overlay, restart once, prove rollback and STOP.

### C. Stage exact forward + recovery OTA files

Download artifact bseed-ts0726-v6-final from run 33731847836.
Hard-stop on any hash mismatch.

Create target-only/local OTA source for each artifact.

Target-only CHECK forward:
- update_available = true
- fileVersion = 285356039
- manufacturerCode = 4417
- imageType = 45577
- selected SHA256 = d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c

Target-only CHECK recovery:
- update_available = true
- fileVersion = 285356040
- manufacturerCode = 4417
- imageType = 45577
- selected SHA256 = 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19

Keep recovery file/source alive through the canary.

### D. One target-only V6 OTA

Only if A-C all pass:
issue ONE forward OTA UPDATE to IEEE 0xa4c13843a9d40f85.

No group/fleet/wildcard OTA.

### E. Immediate post-OTA READ-ONLY safety gate

Require:
- sw = 1.1.6-bseedv6
- fv = 285356039
- V6 overlay selected
- canonical device_config unchanged
- EP4/EP5/EP6 physical mode 0xff03 = 1/1/1
- LEFT/MIDDLE/RIGHT LED source remains raw 4/4/3
- standard switchActions EP1/EP2/EP3 0x0010 = 2/2/2
- custom binding policy EP1/EP2/EP3 0xff06 = 2/2/2
- topology deltas = 0
- Z2M healthy / WindFront reachable

Safety-critical fail (config, mains policy, unrecoverable health):
use exact preflighted recovery once, verify return to:
- 1.1.5-bseedv5 / 285356040
- V5 overlay selected
- canonical config
- mains 1/1/1
then STOP.

Do not recover solely for a non-safety UX defect; leave safe V6 and STOP for Supervisor.

### F. Prove new custom policy live — still no physical button press

Ordinary WindFront/unscoped SET:
- LEFT Direct-binding command = Match local state
- MIDDLE Direct-binding command = Match local state

Raw require:
- EP1 0xff06 = 3
- EP2 0xff06 = 3
- EP3 0xff06 = 2

And standard action MUST remain:
- EP1/EP2/EP3 0x0010 = 2/2/2

Explicit GET require:
- LEFT = Match local state
- MIDDLE = Match local state
- RIGHT = Toggle

One controlled Z2M restart, then repeat fresh raw/public reads:
- custom = 3/3/2
- standard = 2/2/2

This proves converter/live write-read routing. A Z2M restart is NOT claimed as proof of
device NVM persistence across a device reboot.

### G. Finish software/UX gate

If F passes:
- fresh Advanced — Hardware configuration GET must show canonical string;
- locked save rejected with zero Zigbee traffic/reboot;
- Enable editing button emits zero Zigbee traffic;
- >60 s expiry returns to locked;
- still NO successful config commit;
- capture desktop + mobile WindFront;
- confirm human labels and no raw implementation values.

Also read/configure LEFT/MIDDLE software profile before operator:
- Mains Always on
- LED Binding status
- Direct-binding Match local state
- Update local Short press
- Control bound light Short press
- Local state channel correct

RIGHT remains Mains Always on until operator is physically present.
RIGHT LED may remain Physical output; Direct-binding remains Toggle.

Return:
V6_SOFTWARE_LIVE PASS
v6_identity=PASS
mains_safety=PASS
standard_actions=2/2/2
custom_binding=3/3/2
device_config_get=PASS
advanced_lock=PASS
desktop_ux=PASS
mobile_ux=PASS
READY_FOR_V6_OPERATOR
evidence=<SHA>

Then STOP.

## Still forbidden before operator

- successful unlocked device_config commit
- bind/unbind/group mutation
- interview/re-pair
- coordinator mutation
- HA v2 deployment
- physical button presses
- LEFT/MIDDLE Mains power != Always on
- RIGHT Mains Follow logical state

## Operator physical gate after Supervisor review

LEFT/MIDDLE:
- Mains Always on
- LED Binding status
- custom Direct-binding = Match local state
- Short press local + bound
- two short presses + hold/release
- no mains interruption
- exactly one target state change per short press
- firmware-local binding intent and LED follow accepted direct command
- supported Move/Stop behavior on hold

RIGHT:
- only with operator physically present
- set Mains Follow logical state
- LED Physical output
- Short press local state / Right
- OFF must physically de-energize Circle dimmer and LED OFF
- ON must restore mains and LED ON
- LEFT/MIDDLE mains remain continuously powered
- right bindings/groups unchanged

HA deployment remains after physical PASS only.
