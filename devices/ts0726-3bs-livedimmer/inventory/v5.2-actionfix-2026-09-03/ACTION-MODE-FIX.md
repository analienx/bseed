# TS0726 V5.2 action-mode correction — 2026-09-03

## Root cause

The live v5.1 result at bseed issue #8 comment 5521746062 proved endpoint pinning was fixed but LEFT/MIDDLE Direct-binding command still remained raw 2.

The failure is in the converter representation of standard attribute 0x0010, not in firmware endpoint routing.

Zigbee Herdsman knows genOnOffSwitchCfg/0x0010 as the standard named attribute switchActions (ENUM8, spec range 0..2). The v5.1 pinned helper passed numeric key 0x0010 with the raw-attribute wrapper {value,type}. Herdsman resolves numeric ID 0x0010 to the known standard attribute first, so the wrapper is treated as the attribute value instead of entering the unknown/raw-attribute path. The same mismatch also prevents our fromZigbee path from decoding the named switchActions readback.

The firmware intentionally extends this same on-wire attribute:
- 0 = On then off
- 1 = Off then on
- 2 = Toggle
- 3 = Match local state
- 4 = Opposite local state

Firmware at 69a4775c already declares 0x0010 writable and persists switch-cluster writes. No firmware reflash is required for this correction.

## Frozen V5.2 overlay

repo   = analienx/tuya-zigbee-switch
branch = supervisor/target-overlay-v5-actionfix
commit = b2f35d44eea1949bf591b79edf8e2130fc5d197f
path   = zigbee2mqtt/converters/bseed_ts0726_v5.js
blob   = ebad3fce381c0e7fdd673703c2b0e2fb69ee3844
bytes  = 35353

The overlay now:
1. extends built-in genOnOffSwitchCfg with target-local switchActions at the same ID 0x0010, ENUM8, writable, min 0, max 4;
2. routes Direct-binding command SET/GET through the named switchActions property;
3. preserves exact EP1/EP2/EP3 pinning;
4. preserves all prior genBasic/device_config and EP1..EP6 corrections.

This follows the same supported ZHC pattern already used by zigbee-herdsman-converters when a device needs an override of a standard genOnOffSwitchCfg attribute.

## Validation

GitHub Actions:
- workflow run 33726284054
- test job 100555864118
- result PASS

Repository-wide lint remains red on the already-classified unrelated Silicon Labs vendor formatter files; no firmware C/H file was changed by V5.2.

The endpoint-routing regression now requires action-mode writes to use a primitive named payload:
switchActions: 3
rather than numeric 16: {value:3,type:0x30}.

The installed-ZHC probe now requires both local metadata extensions:
- genBasic/deviceConfig
- genOnOffSwitchCfg/switchActions 0..4

## Live retest

NO OTA and NO firmware recovery.

1. Backup/hash current live bseed_ts0726_v5.js.
2. Replace ONLY that overlay with exact commit b2f35d44... and verify blob/source/bytes.
3. One controlled Z2M restart.
4. Run the exact installed ZHC 26.90.0 probe. Require two local custom-cluster registrations and zero bind/unbind/reporting/write/command mutation during configure.
5. Reconfirm target identity 1.1.5-bseedv5 and EP4/EP5/EP6 0xff03 = 1/1/1.
6. Ordinary unscoped/WindFront SET:
   - LEFT Direct-binding command = Match local state
   - raw read EP1 genOnOffSwitchCfg/0x0010 MUST = 3
   - explicit property GET MUST publish Match local state
7. Then MIDDLE:
   - SET Match local state
   - raw read EP2 0x0010 MUST = 3
   - explicit property GET MUST publish Match local state
8. Confirm RIGHT EP3 0x0010 remains 2 / Toggle.
9. One controlled Z2M restart, then raw read EP1/EP2/EP3 again. Require 3/3/2 and matching public GET values.

If any write/read is not exact, STOP and preserve the actual ZCL request/default/write response in evidence.

If 3/3/2 passes, continue prior V5.1 sections D-F only:
- fresh device_config GET;
- advanced lock/unlock-expiry proof without successful config commit;
- desktop/mobile WindFront UX;
- then arm READY_FOR_V5_2_OPERATOR.

HA commit 9472e5b remains BLOCKED until physical acceptance.
Successful unlocked device_config commit remains BLOCKED.
Bindings/groups/interview/coordinator mutation remain forbidden.
LEFT/MIDDLE Mains power must remain Always on.
RIGHT Follow logical state is still operator-only physical acceptance.
