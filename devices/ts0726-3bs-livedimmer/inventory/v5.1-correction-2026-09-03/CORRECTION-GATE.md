# TS0726-3-BS v5.1 correction gate — 2026-09-03

## Disposition

The live v5 firmware itself remains accepted:

```text
1.1.5-bseedv5
fileVersion 285356037
firmware commit 69a4775c4cb4c87f2e948a8aa5b6f099df703ba5
```

**NO firmware reflash is required for v5.1.**

The live canary found defects in the original v5 Zigbee2MQTT endpoint routing and an outdated Home Assistant profile. Those surfaces are superseded by the pins below.

## Frozen corrected pins

### Zigbee2MQTT overlay

```text
repo   = analienx/tuya-zigbee-switch
branch = supervisor/target-overlay-v5
commit = d0ec7c1b3b67cf8265244b768b76684e44691374
path   = zigbee2mqtt/converters/bseed_ts0726_v5.js
git blob = 5e04d9e50fee0c3d6f9b9b2f92114b25daac4b3e
```

### Home Assistant

```text
repo   = analienx/home-assistant-stack
branch = supervisor/ts0726-post-migration-ha-v2
commit = 9472e5b2825e0c1db5705f2b0b2f63349fb09864
```

HA is still staged only until hardware acceptance passes.

## What v5.1 fixes

### 1. Exact endpoint pinning

Every named per-channel control now directly calls the intended endpoint:

```text
switch_left   = EP1
switch_middle = EP2
switch_right  = EP3
relay_left    = EP4
relay_middle  = EP5
relay_right   = EP6
```

No named control uses ZHC `determineEndpoint()` anymore.

This closes the live failure where an ordinary unscoped SET could fall back to the first endpoint supporting the cluster.

The correction applies to:

- Mains power;
- Button type;
- Direct-binding command;
- Update local state;
- Local state channel;
- Control bound light;
- Hold threshold;
- Dimming speed;
- LED shows;
- Bound light (tracked);
- Manual LED;
- diagnostic button GET;
- network LED / reset count where applicable.

### 2. Direct-binding command persistence surface

`Direct-binding command` now writes explicit:

```text
EP1 / EP2 / EP3
cluster genOnOffSwitchCfg
attribute 0x0010
type ENUM8
```

For LEFT/MIDDLE accepted profile:

```text
Match local state = raw 3
```

Firmware already exposes this attribute as writable and persists every switch-cluster attribute write to NVM. No firmware change was required.

The remaining live proof is:

```text
normal UI SET
→ raw 0x0010 = 3 on exact endpoint
→ controlled Z2M/device readback
→ restart
→ raw value remains 3
```

### 3. Advanced hardware configuration GET

The overlay now extends built-in `genBasic` with a real named attribute:

```text
deviceConfig
ID   = 0xff00
type = LONG_CHAR_STR (0x44)
write = true
```

Public property stays:

```text
device_config
```

GET is pinned to EP1 and reads named `deviceConfig`, while the fromZigbee path also tolerates the numeric raw key.

This is separate from the already-proven protected chunked SET protocol.

### 4. Final HA profile

HA no longer treats all three channels as identical.

Accepted profile:

```text
LEFT
  Mains power = Always on
  LED shows = Binding status
  Direct-binding command = Match local state
  Update local state = Short press
  Control bound light = Short press

MIDDLE
  Mains power = Always on
  LED shows = Binding status
  Direct-binding command = Match local state
  Update local state = Short press
  Control bound light = Short press

RIGHT
  Mains power = Follow logical state
  LED shows = Physical output
  intentional hard power switching
```

HA corrective synchronization now covers LEFT/MIDDLE only.

RIGHT is excluded from downstream Circle-light state reconciliation so an unavailable/off downstream dimmer cannot feed back into the hard-power relay.

The manual finalizer:

- seeds LEFT/MIDDLE logical + binding-intent state only;
- selects LEFT/MIDDLE = Binding status;
- selects RIGHT = Physical output;
- never changes Mains power.

## Validation

### Overlay functional suite

```text
run 33722476993
test job 100544309672
result PASS
```

The umbrella job remains red only for the same unrelated Silicon Labs vendor formatting files.

### Exact ZHC 26.90.0

```text
run 33722502239
job 100544387469
result PASS
```

This run validates:

- final overlay loads against exact ZHC 26.90.0;
- processed exposes are valid;
- named `deviceConfig` Basic extension is valid;
- ordinary SET/GET calls with **no meta.endpoint_name** hit exact EP1–EP6;
- all 33 representative channel SET/GET cases are pinned;
- LEFT physical readback does not leak into MIDDLE/RIGHT;
- MIDDLE action-mode readback does not leak into LEFT/RIGHT;
- device_config GET is EP1 + named deviceConfig;
- action API still passes;
- protected editor transport still passes.

### Home Assistant

```text
run 33722202782
commit 9472e5b2825e0c1db5705f2b0b2f63349fb09864
result PASS
real Home Assistant check_config PASS
```

## Next live gate

Do not OTA again.

1. Replace only the current v5 overlay with exact commit `d0ec7c1b...`.
2. Restart Z2M once.
3. Verify target still matches v5 overlay and fleet/topology deltas remain zero.
4. Perform safe endpoint/readback tests first:
   - LEFT Mains power = Always on → raw EP4 0xff03=1;
   - MIDDLE Mains power = Always on → raw EP5 0xff03=1;
   - RIGHT Mains power = Always on (same current value only) → raw EP6 0xff03=1;
   - ensure EP4/EP5 did not change while testing RIGHT.
5. Set LEFT/MIDDLE Direct-binding command = Match local state and prove:
   - EP1/EP2 0x0010 = 3;
   - controlled restart;
   - EP1/EP2 still = 3.
6. GET Advanced — Hardware configuration and require the canonical string to publish through `device_config`.
7. Repeat locked/unlock/expiry test without a successful config commit.
8. Capture corrected desktop/mobile UX.
9. Arm operator monitoring.

Only with the operator present:
- leave LEFT/MIDDLE Mains power = Always on;
- set RIGHT Mains power = Follow logical state;
- set RIGHT LED shows = Physical output;
- verify intentional RIGHT hard cut/restore;
- test LEFT/MIDDLE firmware-local Binding status behavior.

Do not deploy HA until those physical tests pass.
