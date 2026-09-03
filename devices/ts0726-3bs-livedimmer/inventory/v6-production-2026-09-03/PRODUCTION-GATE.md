# BSEED TS0726-3-BS — V6 production gate

Date: 2026-09-03
Target: `LivingRoomMainDimmer` / `0xa4c13843a9d40f85`

## Current live firmware

```text
softwareBuildID = 1.1.6-bseedv6
fileVersion     = 285356039
firmware source = analienx/tuya-zigbee-switch
branch          = supervisor/ts0726-redesign-v6-clean-binding-mode
commit          = 182c0195a8bb781abd7c4f1e2508278079b7b119
```

No further firmware OTA is required for the requested production profile.

## Production converter candidate

The live hardened transition is proven, but the requested final RIGHT profile needs an explicit public `Never (disabled)` value for `Control bound light`.

Supervisor-owned production candidate:

```text
repo   = analienx/tuya-zigbee-switch
branch = production/ts0726-v6
head   = d50fd53db168bc403d89ece2fe3692a8d860d280

external converter:
zigbee2mqtt/converters/bseed_ts0726_v6_production.js

non-auto-loaded hardened base:
zigbee2mqtt/converter_lib/bseed_ts0726_v56_hardened.js
base blob = ed8ee78f882c936afd9a4008ed4f70559c3a5cf7

production profile:
zigbee2mqtt/production/ts0726-v6-profile.json

exact-runtime production probe:
helper_scripts/probe_bseed_ts0726_v6_production.js
```

The wrapper exports exactly one definition and replaces only the three endpoint-pinned `Control bound light` surfaces. It adds:

```text
Never (disabled) = raw 0 on genOnOffSwitchCfg / 0xff05
```

It performs no bind/unbind/group operation.

## Why RIGHT needs targeted binding cleanup for truly pure-relay behavior

V6 firmware currently gates bound On/Off actions on `binded_mode`, so `0xff05=0` suppresses those actions. However the long-press path calls Level Move/Stop when a `genLevelCtrl` binding exists independently of `binded_mode`.

Therefore `Control bound light = Never (disabled)` alone is sufficient for normal short-press On/Off isolation but is **not** enough to claim RIGHT is a pure relay under every physical interaction while EP3 retains an outbound level binding.

For the operator's final requirement, production finalization is authorized to remove only RIGHT switch endpoint EP3 outbound:

```text
genOnOff
genLevelCtrl
```

bindings after preserving their exact pre-change records for rollback.

Do not remove:
- EP3 `genMultistateInput` reporting/coordinator binding;
- any LEFT/MIDDLE binding;
- any group membership or binding elsewhere in the mesh.

This is a deliberately narrow topology change implementing the operator's explicit new requirement that RIGHT be a **pure local relay**.

## Final production profile

### LEFT — smart light / permanent mains

```text
Mains power             = Always on
LED shows               = Binding status
Direct-binding command  = Match local state
Update local state      = Short press
Control bound light     = Short press
Local state channel     = Left
```

Before physical acceptance, seed `Bound light (tracked)` from the real downstream light state if fresh state is available. This is tracker correction only.

### MIDDLE — smart light / permanent mains

```text
Mains power             = Always on
LED shows               = Binding status
Direct-binding command  = Match local state
Update local state      = Short press
Control bound light     = Short press
Local state channel     = Middle
```

Seed the tracker from the real downstream light state before physical acceptance if fresh state is available.

### RIGHT — pure local relay

```text
Mains power             = Follow logical state
LED shows               = Physical output
Direct-binding command  = Toggle        # inert once bound-control is disabled and EP3 command bindings are absent
Update local state      = Short press
Control bound light     = Never (disabled)
Local state channel     = Right
```

Required topology result:

```text
EP3 outbound genOnOff bindings    = 0
EP3 outbound genLevelCtrl bindings = 0
```

The RIGHT physical relay then follows RIGHT logical state directly in firmware. No Home Assistant automation is part of the normal actuation path.

## Existing software gate still must close first

Latest Supervisor ruling `5531743986` remains binding. Before production converter deployment or physical acceptance require:

1. durable live standard ABI evidence `0x0010 = 2/2/2` on EP1/2/3;
2. exact-runtime transition probe PASS under installed ZHC `26.103.0`;
3. fresh route-health snapshot proving the target answers reads:

```text
swBuildId = 1.1.6-bseedv6
device_config = canonical
mains = 1/1/1
custom binding = 3/3/2
standard actions = 2/2/2
frontend/Z2M healthy
```

Do not recover-flash for route failure.

## Production converter deployment gate

Only after the three software gates above pass:

1. Run the new production probe against exact installed ZHC `26.103.0`.
2. Validate frontend expose processing for the production wrapper offline/in-container.
3. Backup the currently live hardened transition file outside `external_converters`.
4. Install hardened base at:
   `/config/zigbee2mqtt/converter_lib/bseed_ts0726_v56_hardened.js`.
5. Remove the old transition file from the auto-load directory.
6. Install only:
   `/config/zigbee2mqtt/external_converters/bseed_ts0726_v6_production.js`.
7. One controlled Z2M restart.
8. Require exactly one target definition, frontend/Z2M healthy, V6 identity, canonical config, no topology change caused by converter deployment, and all pre-existing settings unchanged.

If converter deployment regresses service health, restore the prior hardened transition only, restart once and STOP.

## Settings/topology application order

After production converter deployment PASS:

1. Apply/re-read LEFT final profile while LEFT mains stays `Always on`.
2. Apply/re-read MIDDLE final profile while MIDDLE mains stays `Always on`.
3. Keep RIGHT mains `Always on` initially.
4. Set RIGHT `Control bound light = Never (disabled)` and read back raw EP3 `0xff05=0`.
5. Snapshot exact EP3 binding records.
6. Remove only EP3 outbound `genOnOff` and `genLevelCtrl` bindings; read back binding table.
7. Verify LEFT/MIDDLE binding tables are byte-identical to baseline.
8. Verify RIGHT local state channel = Right, update-local = Short press, LED = Physical output.
9. Read current RIGHT logical state and record it.
10. Set RIGHT `Mains power = Follow logical state`; immediate cut/energize according to the recorded logical state is intended and operator-authorized.
11. Re-read EP4/EP5 mains = Always on and EP6 mains policy = Follow logical state.
12. STOP before physical button acceptance if the operator is not actively observing the load.

## Physical acceptance

LEFT/MIDDLE:
- repeated short presses must never de-energize physical mains;
- exactly one intended bound On/Off action per completed short press;
- local tracked binding state and LED follow command intent;
- hold Move/Stop behavior remains supported.

RIGHT:
- short press changes RIGHT logical state and physical relay exactly once;
- LED follows physical output;
- no outbound On/Off direct-binding command;
- long press/release emits no bound Level Move/Stop because EP3 command bindings are absent;
- LEFT/MIDDLE mains remain continuously on.

## Home Assistant

HA v2 remains staged at `9472e5b2825e0c1db5705f2b0b2f63349fb09864` and must not be deployed until physical acceptance passes.

Its intended runtime role remains:
- LEFT/MIDDLE corrective synchronization only;
- RIGHT excluded entirely from downstream-light reconciliation.
