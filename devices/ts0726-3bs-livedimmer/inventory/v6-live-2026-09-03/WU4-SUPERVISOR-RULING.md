# WU4 Supervisor ruling — V6 OTA accepted; final transition reload before writes

Date: 2026-09-03

Issue: analienx/bseed#8  
Target: `LivingRoomMainDimmer` / `0xa4c13843a9d40f85`

## Evidence reviewed

Executor return:

```text
issue comment = 5529082774
branch = executor/ts0726-v6-software-live-2026-09-03
commit = 0259ae31f6ee430d99f053cbc2087679a936f937
```

Frozen V6 firmware:

```text
repo = analienx/tuya-zigbee-switch
branch = supervisor/ts0726-redesign-v6-clean-binding-mode
commit = 182c0195a8bb781abd7c4f1e2508278079b7b119
softwareBuildID = 1.1.6-bseedv6
fileVersion = 285356039
```

Final hardened V5→V6 transition overlay:

```text
repo = analienx/tuya-zigbee-switch
branch = supervisor/target-overlay-v56-transition
commit = 7d649cbac2224c2ecbe73a022011434aaa133898
path = zigbee2mqtt/converters/bseed_ts0726_v5.js
blob = ed8ee78f882c936afd9a4008ed4f70559c3a5cf7
```

## Ruling

### C/D and electrical/read-only E are PASS

Accepted live evidence:

```text
forward OTA hash/check = PASS
recovery hash/check = PASS
target-only V6 OTA = PASS
software_build_id = 1.1.6-bseedv6
fileVersion = 285356039
device_config = canonical
EP4/EP5/EP6 mains 0xff03 = 1/1/1
EP4/EP5/EP6 LED source 0xff01 = 4/4/3
frontend = healthy
Z2M = healthy
devices = 104
groups = 21
IEEE/groups/bindings/configured_reportings delta = 0
```

No recovery OTA is warranted.

### Custom `0xff06 = 3/3/2` is NOT a deviation

The frozen V6 firmware deliberately separates:

- standard `genOnOffSwitchCfg / switchActions / 0x0010`;
- BSEED direct-binding policy `genOnOffSwitchCfg / 0xff06`.

Firmware source at `182c0195...` loads the new custom policy from independent NVM and migrates legacy action intent into it, while standard `switchActions` is normalized to standard Toggle (`2`) if an old extended value was present.

Therefore the live migrated custom state:

```text
EP1 0xff06 = 3  Match local state
EP2 0xff06 = 3  Match local state
EP3 0xff06 = 2  Toggle
```

is valid and is already the desired final binding-command policy.

The still-required live ABI proof is:

```text
STANDARD 0x0010 EP1/EP2/EP3 = 2/2/2
```

### Executor followed a superseded dispatch

WU4 says it executed issue comment `5528641047`. The later Supervisor instruction `5528709005` had already frozen the hardened transition revision `7d649cba...`.

The OTA itself does not need repeating and the device must NOT be recovered merely because the older transition revision was present. The risk in the older transition was stale cached `softwareBuildID` during a subsequent Direct-binding SET/GET. WU4 performed no post-OTA setting SETs, so that unsafe path was not exercised.

Before ANY Direct-binding write, replace the live transition in place with `7d649cba...`.

## Exact generic-read correction

The executor's earlier `No converter available for 'get' 'read'` is explained by the deployed software contract.

In `zigbee-herdsman-converters v26.90.0`, generic `read` is:

```text
key = ["read"]
convertSet(...)
```

It is therefore invoked through the device MQTT `/set` topic, not `/get`.

Zigbee2MQTT 2.13.0 also routes endpoint-suffixed properties by stripping a known endpoint suffix and selecting that endpoint before converter dispatch. For this device, the exact non-mutating standard-ABI probes are therefore:

```json
{
  "read_switch_left": {
    "cluster": "genOnOffSwitchCfg",
    "attributes": [16],
    "state_property": "abi_switchactions_left"
  }
}
```

```json
{
  "read_switch_middle": {
    "cluster": "genOnOffSwitchCfg",
    "attributes": [16],
    "state_property": "abi_switchactions_middle"
  }
}
```

```json
{
  "read_switch_right": {
    "cluster": "genOnOffSwitchCfg",
    "attributes": [16],
    "state_property": "abi_switchactions_right"
  }
}
```

Publish each payload to:

```text
zigbee2mqtt/LivingRoomMainDimmer/set
```

The endpoint suffix itself selects:

```text
switch_left   -> EP1
switch_middle -> EP2
switch_right  -> EP3
```

Capture the Z2M log's `Read result of 'genOnOffSwitchCfg'` plus resulting state property and endpoint evidence. These are reads only; do not use generic `write`.

## Next executor work unit

### A. Install final hardened transition on already-live V6

Replace only:

```text
/config/zigbee2mqtt/external_converters/bseed_ts0726_v5.js
```

with exact:

```text
commit = 7d649cbac2224c2ecbe73a022011434aaa133898
blob = ed8ee78f882c936afd9a4008ed4f70559c3a5cf7
```

There must be no separate `bseed_ts0726_v6.js`.

Take pre-restart topology snapshot. One controlled Z2M restart.

Require:

```text
frontend healthy
Z2M healthy
fresh EP1 genBasic/swBuildId = 1.1.6-bseedv6
EC-GL86ZPCS31 transition definition selected
device_config canonical
EP4/5/6 mains = 1/1/1
IEEE/groups/bindings/reportings delta = 0
```

No setting writes before this passes.

### B. Prove standard ABI live

Use the endpoint-suffixed generic `read` commands above via `/set`.

Require:

```text
EP1 switchActions / 0x0010 = 2
EP2 switchActions / 0x0010 = 2
EP3 switchActions / 0x0010 = 2
```

Also re-read custom policy and retain:

```text
0xff06 = 3/3/2
```

If any standard value is not `2`, leave electrically-safe V6 installed, report and STOP. Do not recovery-flash and do not manually write the standard attribute.

### C. Prove final public Direct-binding path — no physical press

First public GET all three Direct-binding controls using the hardened transition.

For each SET/GET, evidence must show the converter's fresh EP1 Basic `swBuildId = 1.1.6-bseedv6` identity read before the action-cluster access.

Expected GET:

```text
LEFT   = Match local state
MIDDLE = Match local state
RIGHT  = Toggle
```

Then ordinary idempotent public/WindFront SET:

```text
LEFT   = Match local state
MIDDLE = Match local state
RIGHT  = Toggle
```

Require:

```text
custom 0xff06 = 3/3/2
standard 0x0010 = 2/2/2
```

One controlled Z2M restart, then fresh-read V6 identity, custom and standard values again. A Z2M restart is not a physical-device power-cycle persistence claim.

### D. Finish software/UX gate

Fresh:

```text
Advanced — Hardware configuration =
iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;
```

Protected editor:

1. locked canonical save -> reject, zero Zigbee traffic, zero reboot;
2. `Advanced — Enable editing` -> zero Zigbee traffic;
3. wait >60 s;
4. canonical save -> reject locked again, zero Zigbee traffic/reboot.

Do not perform a successful config commit.

Prepare final pre-operator software profile:

LEFT:

```text
Mains power = Always on
LED shows = Binding status
Direct-binding command = Match local state
Update local state = Short press
Control bound light = Short press
Local state channel = Left
```

MIDDLE: same, channel Middle.

RIGHT remains electrically safe pre-operator:

```text
Mains power = Always on
LED shows = Physical output
Direct-binding command = Toggle
Update local state = Short press
Local state channel = Right
```

Do NOT set RIGHT Mains power to Follow logical state yet.

Capture desktop + mobile WindFront.

### E. Return and STOP

Required return:

```text
V6_SOFTWARE_LIVE PASS
v6_ota=PASS
final_transition=PASS
fresh_swBuildId=1.1.6-bseedv6
mains_safety=1/1/1
standard_actions=2/2/2
custom_binding=3/3/2
topology_delta=0
device_config_get=PASS
advanced_lock=PASS
desktop_ux=PASS
mobile_ux=PASS
READY_FOR_V6_OPERATOR
evidence=<SHA>
```

Then STOP for Supervisor.

## Still forbidden

```text
another forward OTA
recovery OTA unless a true safety-critical invariant fails
physical button presses
RIGHT Mains power = Follow logical state
successful unlocked device_config commit
bind/unbind/group mutation
manual standard/custom raw writes
manual interview/re-pair
coordinator mutation
HA v2 deployment
```
