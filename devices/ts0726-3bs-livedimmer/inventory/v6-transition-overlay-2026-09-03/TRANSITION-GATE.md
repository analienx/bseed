# TS0726 V5→V6 SINGLE-OVERLAY TRANSITION GATE — 2026-09-03

## Trigger

Executor live return:
- issue comment 5527386617
- evidence branch executor/ts0726-v6-software-live-2026-09-03
- evidence commit 984c8beb1d9537dc6f4516619ff7a4dfe43e1102

The original V6 staging design loaded the proven V5.1 overlay and a separate V6 overlay simultaneously.
That composition deterministically prevented the Z2M frontend extension from being reached on both:
- stock Z2M add-on 2.13.0-1
- operator p007 2.13.0-1-p007

Both attempts were rolled back safely. No OTA CHECK, OTA transfer, setting write, button press,
binding/group/interview/coordinator mutation, or HA deployment occurred.

## Supervisor localization

Frozen V5.1 -> V6 source diff contains only:
1. header comment;
2. deployment comment;
3. Direct-binding attribute 0x0010 -> 0xff06;
4. softwareBuildID 1.1.5-bseedv5 -> 1.1.6-bseedv6.

All advanced editor, last-button, network-indicator, legacy-action and config-transport surfaces are
otherwise the same. Therefore the broad suspect list in the executor report is rejected.

ZHC 26.90.0 findDefinition() evaluates fingerprints before prepareDefinition()/modern-extend
processing. While the target is still V5, a separate V6 definition is not matched and its V6-only
0xff06 converter path is not executed. The live-only delta at Step B is therefore the extra parallel
TS0726 external definition/candidate composition itself.

## Corrected architecture

Use ONE transition definition, not V5 + V6 definitions in parallel.

Repository:
- analienx/tuya-zigbee-switch
- branch supervisor/target-overlay-v56-transition
- source commit 833b117388b3a324b71e12963e277a342c4c49da
- path zigbee2mqtt/converters/bseed_ts0726_v5.js
- git blob ae48e23a974244923ab3a27a69a7e5341c920eb4

The one definition has two exact priority-100 fingerprints:
- iedhxgyi / TS0726-3-BS / 1.1.5-bseedv5
- iedhxgyi / TS0726-3-BS / 1.1.6-bseedv6

No bare zigbeeModel fallback exists.

Only one deviceAddCustomCluster("genBasic", ID 0x0000) transport extension is instantiated.
No custom genOnOffSwitchCfg cluster exists.

Public Direct-binding command is one unchanged expose, but transport is selected fail-closed by
the actual device softwareBuildID:

V5:
- transport = standard named switchActions
- domain = 0..2
- Match/Opposite 3/4 rejected BEFORE Zigbee traffic

V6:
- transport = raw genOnOffSwitchCfg 0xff06 ENUM8
- domain = 0..4
- Match local state = 3
- Opposite local state = 4

Unknown firmware:
- no transport guessed
- SET/GET fails before Zigbee traffic

Readback decoder accepts:
- V5 named switchActions
- V6 raw 0xff06

## Validation

Normal repository tests:
- branch supervisor/target-overlay-v56-transition
- head 833b117388b3a324b71e12963e277a342c4c49da
- test job PASS
- lint red only on the two pre-existing Silicon Labs vendor formatter files

Exact runtime validation:
- validation branch supervisor/validate-v56-transition
- workflow commit e2f874a5780a4883e38f7ce7c1a78eddefd4c883
- run 33769292042
- job 100695075845
- PASS

Exact packages:
- zigbee-herdsman-converters 26.90.0
- zigbee2mqtt-windfront 2.14.0
- matches Zigbee2MQTT 2.13.0 package.json

Passed:
- transition installed-ZHC contract
- frozen V5.1 installed-ZHC contract under same package
- processed frontend expose payload byte-identical between frozen V5.1 and transition
- processed expose count = 29 for both
- exactly one local custom Basic cluster registration
- V5 named switchActions path
- V5 extended 3/4 fail closed with zero traffic
- V6 raw 0xff06 path
- unknown firmware fail closed
- protected config transport
- historical action API
- WindFront 2.14.0 package import/default.getPath()

## Next live gate — Step B only

Current safe baseline must remain:
- target 1.1.5-bseedv5 / fv 285356037
- canonical device_config
- EP4/5/6 physical mode 1/1/1
- frontend healthy
- bridge topology unchanged

Deployment:
1. Ensure NO separate bseed_ts0726_v6.js exists in external_converters.
2. Backup current proven V5.1 bseed_ts0726_v5.js outside external_converters.
3. Replace bseed_ts0726_v5.js IN PLACE with exact transition file from source commit 833b117...
4. Keep V4 and all unrelated converters unchanged.
5. One controlled Z2M restart.

Require:
- Started frontend on port 8099
- in-container frontend 200/open
- Z2M healthy
- current V5 target resolves to EC-GL86ZPCS31 through the transition definition
- 104-device IEEE set unchanged
- groups unchanged
- target bindings unchanged
- target configured_reportings unchanged
- firmware unchanged
- canonical config unchanged
- EP4/5/6 mains 1/1/1
- no interview/re-pair
- no converter startup error

Run exact installed-ZHC transition probe in-container if practical.

If PASS:
return V56_TRANSITION_STEP_B PASS + evidence SHA and STOP.

If FAIL:
restore exact proven V5.1 overlay (live SHA256
4940ad694de9c61e9afbdd529f59ffcf02edf3dc707979301dfc7a73068e5bda),
restart once, prove frontend recovery and zero topology delta, report and STOP.

Still forbidden:
- OTA CHECK or UPDATE
- setting writes
- successful device_config commit
- bind/unbind/group mutation
- interview/re-pair
- coordinator mutation
- physical button presses
- HA deployment
