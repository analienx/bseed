# TS0726 V6 LIVE OTA GATE AFTER TRANSITION PASS — 2026-09-03

## Accepted live prerequisite

Executor issue comment: 5528009509
Evidence branch: executor/ts0726-v6-software-live-2026-09-03
Evidence commit: 50a6f49 (full 50a6f49... as GitHub resolves)

V56_TRANSITION_STEP_B = PASS:
- frontend healthy after one restart with the single transition overlay;
- Z2M healthy;
- target remains 1.1.5-bseedv5;
- canonical device_config;
- EP4/5/6 mains Always on / raw 0xff03 = 1/1/1;
- 104 devices / 21 groups;
- IEEE set/groups/target bindings/reportings delta 0;
- no target writes, interview, re-pair or other topology mutation;
- actual installed ZHC 26.90.0 transition composition probe PASS.

Transition overlay currently live:
- repo analienx/tuya-zigbee-switch
- source commit 833b117388b3a324b71e12963e277a342c4c49da
- blob ae48e23a974244923ab3a27a69a7e5341c920eb4
- on-disk SHA256 9b34e77292a9a7e0776a0bf68865e764533a057b484b2f006daf0bfea17e9093

## Evidence correction

Do NOT use the prose observation in EXECUTOR-REPORT that LEFT/RIGHT action reads returned
"Match local state" / "Toggle" as a migration baseline.

Committed authoritative JSON says:
- switch_left_action_mode = NO_RESPONSE
- switch_middle_action_mode = NO_RESPONSE
- switch_right_action_mode = Toggle

Paths:
- transition/post-restart-properties.json
- transition/post-restart-public-get.json

Therefore pre-V6 LEFT/MIDDLE standard action values are unknown at this gate.
The post-OTA gate must read and validate the migrated standard/custom values instead of assuming
custom 2/2/2 or 3/3/2 before the first V6 setting write.

## Frozen images remain unchanged

Forward:
- swBuildID 1.1.6-bseedv6
- fileVersion 285356039
- manufacturerCode 4417
- imageType 45577
- forward.ota SHA256 d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c

Emergency recovery:
- exact proven V5 source 69a4775c4cb4c87f2e948a8aa5b6f099df703ba5
- swBuildID 1.1.5-bseedv5
- fileVersion 285356040
- canonical pin map
- no MIGRATION_REVERT
- recovery.ota SHA256 4a09b5221d06889f34abd5c3cf89405d42bb168810013b45f1cef64433bf1b19

Build:
- run 33731847836
- job 100573355841
- artifact bseed-ts0726-v6-final / ID 9884225463

## Critical OTA-provider rule

Recovery has fileVersion 285356040, which is higher than forward 285356039.

Therefore:
- NEVER leave forward and recovery as simultaneously selectable candidates for the forward UPDATE.
- Preflight them one at a time.
- During the actual forward UPDATE, the active provider/index must expose ONLY the forward image for this target.
- Keep the recovery file/index available on disk but INACTIVE as an OTA candidate.
- Activate the recovery provider/index only if the recovery condition is met after forward OTA.

Immediately before UPDATE, perform a target-only CHECK and record the actually selected candidate.
Hard require selected candidate:
- fileVersion 285356039
- manufacturerCode 4417
- imageType 45577
- SHA256 d18c420d18e1a741b8946482c8ef885b61d8ceb92a434f7bb1beddb6dd3ec79c

If the selected candidate is recovery/285356040 or cannot be proven: STOP.

## C. OTA preflight

1. Re-hash the staged archive and all four files.
2. Verify forward OTA header.
3. Activate forward-only target-local provider/index.
4. Target-only CHECK forward: require 285356039 and exact forward hash.
5. Disable forward candidate.
6. Activate recovery-only target-local provider/index.
7. Target-only CHECK recovery: require 285356040 and exact recovery hash.
8. Disable recovery candidate.
9. Re-activate forward-only provider/index.
10. Repeat target-only CHECK and require exact forward selection immediately before UPDATE.

No UPDATE if any CHECK differs.

## D. ONE target-only forward OTA

Issue exactly one UPDATE to:
0xa4c13843a9d40f85

No wildcard/group/fleet OTA.

Wait for OTA success and device announce/timeout according to the normal Z2M OTA flow.

## E. Refresh Basic firmware identity BEFORE any V6 setting write

Important: the transition converter dynamically selects 0x0010 vs 0xff06 from
meta.device.softwareBuildID. Zigbee-Herdsman OTA completion waits for device announce but does not
itself guarantee that cached genBasic.swBuildId was refreshed.

Therefore, after OTA success and before Direct-binding SET/GET:

1. Perform a target-scoped EP1 genBasic read of swBuildId (attribute 0x4000 / named swBuildId).
   Reading is authorized; writing is not.
2. Require the actual device response:
   swBuildId = 1.1.6-bseedv6
3. Require bridge/devices to reflect software_build_id = 1.1.6-bseedv6.
4. Require transition definition remains EC-GL86ZPCS31 / external.
5. If needed only to prove the updated cache is used consistently, one controlled Z2M restart is
   allowed AFTER the successful Basic read; do not interview/re-pair.

If firmware OTA reports success but Basic swBuildId cannot be proven V6:
- do NOT issue Direct-binding setting writes;
- leave electrically safe state untouched;
- report and STOP for Supervisor unless a separate safety invariant also failed.

## F. Immediate post-OTA READ-ONLY electrical + ABI gate

Require:
- swBuildId = 1.1.6-bseedv6
- installed OTA/fileVersion = 285356039 where the updater exposes it
- canonical device_config exactly unchanged
- EP4/5/6 Mains power = Always on / raw 0xff03 = 1/1/1
- LED source EP4/5/6 = Binding status / Binding status / Physical output = raw 4/4/3
- bridge IEEE set unchanged
- groups unchanged
- target bindings unchanged
- target configured_reportings unchanged
- frontend healthy
- Z2M healthy

Read raw genOnOffSwitchCfg standard 0x0010 on EP1/2/3:
- every value MUST be within standard domain 0..2;
- expected product value is Toggle=2 on all three;
- if any value is 3/4, ABI migration FAIL: leave safe V6, report and STOP;
- if any value is 0/1, leave safe V6, report and STOP before physical acceptance. Do not recover
  merely for this non-electrical behavior defect.

Read raw custom 0xff06 on EP1/2/3:
- every value MUST be within 0..4;
- record actual migrated values exactly;
- do not assume LEFT/MIDDLE values from pre-OTA NO_RESPONSE evidence.

Safety-critical recovery conditions:
- canonical device_config lost/corrupted;
- LEFT/MIDDLE/RIGHT physical mains policy no longer 1/1/1 unexpectedly;
- Z2M/frontend cannot be restored to healthy operation;
- device identity/board mismatch suggesting wrong image.

Only for those safety-critical conditions:
- disable forward candidate;
- activate recovery-only candidate;
- prove CHECK selects 285356040 / exact recovery SHA256;
- issue ONE target-only recovery UPDATE;
- read EP1 Basic swBuildId and require 1.1.5-bseedv5;
- require canonical config, mains 1/1/1, healthy frontend/Z2M;
- report and STOP.

Do not recover for a merely incorrect UX/action value while the device is electrically safe.

## G. Configure final V6 direct-binding policy — still NO physical button press

Only after E/F PASS and cached swBuildId is proven V6.

Using ordinary WindFront/unscoped public controls:
- LEFT Direct-binding command = Match local state
- MIDDLE Direct-binding command = Match local state
- RIGHT Direct-binding command = Toggle (set explicitly if necessary)

Require public GET:
- LEFT = Match local state
- MIDDLE = Match local state
- RIGHT = Toggle

Require raw custom 0xff06:
- EP1 = 3
- EP2 = 3
- EP3 = 2

Then re-read standard 0x0010:
- EP1 = 2
- EP2 = 2
- EP3 = 2

This is the key V6 split proof:
custom changes to 3/3/2 while standard remains 2/2/2.

One controlled Z2M restart is allowed after successful SET/GET.
After restart perform fresh reads again:
- swBuildId V6
- custom 3/3/2
- standard 2/2/2
- mains 1/1/1
- canonical config
- frontend healthy

A Z2M restart proves fresh converter/device readback; it is not claimed as a device-power-cycle NVM test.

## H. Software/UX gate

After G PASS:
- fresh Hardware configuration GET = canonical
- locked save rejected with zero Zigbee traffic/reboot
- Enable editing emits zero Zigbee traffic
- wait >60 s and prove save is locked again
- NO successful device_config commit
- capture desktop + mobile WindFront
- labels remain human-readable

Prepare LEFT:
- Mains Always on
- LED Binding status
- Direct-binding Match local state
- Update local state Short press
- Control bound light Short press
- Local state channel Left

Prepare MIDDLE:
- same with Local state channel Middle

RIGHT remains before operator:
- Mains Always on
- LED Physical output
- Direct-binding Toggle
- do NOT set Follow logical state yet

## Return and STOP

Return:

V6_SOFTWARE_LIVE PASS
transition_step_b=PASS
ota_forward=PASS
v6_identity_refresh=PASS
canonical_config=PASS
mains_safety=1/1/1
standard_actions=2/2/2
custom_binding=3/3/2
topology_delta=0
frontend=PASS
z2m_health=PASS
device_config_get=PASS
advanced_lock=PASS
desktop_ux=PASS
mobile_ux=PASS
READY_FOR_V6_OPERATOR
evidence=<SHA>

Then STOP.

Still forbidden:
- physical button presses
- RIGHT Mains Follow logical state
- successful unlocked device_config commit
- bind/unbind/group mutation
- interview/re-pair
- coordinator mutation
- HA v2 deployment
