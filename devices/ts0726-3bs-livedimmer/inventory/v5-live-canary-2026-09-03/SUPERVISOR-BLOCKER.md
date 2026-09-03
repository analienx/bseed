# EXECUTOR → SUPERVISOR: v5 live acceptance blocked

Date: 2026-09-03 (Europe/Prague)  
Target: `LivingRoomMainDimmer`, IEEE `0xa4c13843a9d40f85`

## Deployment completed safely

- v5 overlay live beside v4: source `eaba4ceca83df265ddedde5a6ea60e72ff3522d3`
- live overlay SHA-256: `6be460226dfcb1b5fb48efba8ffad95f7ca537399c03cfb38a82d4289dac2c2e`
- installed ZHC probe: PASS; no configure binds/writes/reporting mutations
- overlay restart topology: 104 devices, 21 groups, binding/reporting projection unchanged
- target-only forward and recovery CHECK: PASS
- forward OTA: PASS
  - from `1.1.4-bseedv4` / `285356035`
  - to `1.1.5-bseedv5` / `285356037`
- recovery `1.1.5-bseedv5r` / `285356038` remains staged and hash-verified
- exact canonical hardware config survived:
  `iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;`

## BLOCKER 1 — Mains-power controls are not endpoint-safe

The three unique physical-mode exposes use `enumLookup(... endpointName ...)`, then overwrite the exposed property with `.withProperty(name)`. Installed ZHC `enumLookup` uses:

```js
key: [name]
await determineEndpoint(entity, meta, cluster).write(...)
```

A normal unscoped device `/set` supplies no endpoint in the key after the property override. It defaults to the first endpoint supporting `genOnOff` (EP4). Live reproduction:

1. Raw pre-state EP4/5/6 `0xff03 = 1/1/1`.
2. Publish acknowledged RIGHT `Follow logical state`.
3. Fresh LEFT read returned `Follow logical state`; RIGHT acknowledgement was optimistic.
4. Controlled restart + v5 configure's explicit endpoint reads proved EP4/5/6 still `1/1/1`.

Endpoint-like MQTT topic attempts do not make these normal expose converters endpoint-safe. Current safe electrical state was restored and proven after restart:

- EP4 LEFT `0xff03=1` Always on
- EP5 MIDDLE `0xff03=1` Always on
- EP6 RIGHT `0xff03=1` Always on

Required fix: endpoint-pinned `convertSet` and `convertGet` for each mains property (EP4/5/6), independent of `meta.endpoint_name`. Add tests that invoke ordinary unscoped MQTT-equivalent conversion with `meta.endpoint_name` absent and assert the exact endpoint used for each property.

## BLOCKER 2 — Direct-binding command writes acknowledge but do not persist

Requested and optimistically acknowledged:

- LEFT `Match local state`
- MIDDLE `Match local state`

After controlled restart, explicit per-endpoint reads proved:

- EP1 `genOnOffSwitchCfg/0x0010 = 2` Toggle
- EP2 `genOnOffSwitchCfg/0x0010 = 2` Toggle
- EP3 `genOnOffSwitchCfg/0x0010 = 2` Toggle

Explicit expose GET for LEFT/MIDDLE also produced no fresh response. Determine whether the failure is converter endpoint routing, collision with standard `switchActions`, or firmware attribute write access/persistence. Required regression: normal UI/MQTT SET → raw readback `0x0010=3` on EP1 and EP2 → restart → same raw readback.

## What did work

LED-source writes persisted and survived restart:

- EP4 LEFT `0xff01=4` Binding status
- EP5 MIDDLE `0xff01=4` Binding status
- EP6 RIGHT `0xff01=3` Physical output

Binding intent reads exist at EP4/5/6 `0xff04=0`. Bindings/groups were not changed.

## BLOCKER 3 — Advanced hardware-config GET

`device_config_advanced` SET/GET contract still needs live correction. Explicit GET produced no response, although the canonical string remains in Basic `0xff00` and is preserved in the device database. The final UI must show the string read-only while locked and permit the protected unlock + 60-second edit flow.

## Contract mismatch in frozen HA v2

Frozen HA commit `68972efd...` still fail-closes unless **all three** mains selectors are Always on and **all three** LED selectors are Binding status. That conflicts with the operator's latest accepted profile:

- LEFT/MIDDLE: Always on; Binding status LED; Short press local + bound; Match local state
- RIGHT: Follow logical state; Physical output LED; intentional hard power switching

Update HA v2 and its tests to this latest profile before deployment. HA v2 is **not live**.

## Release-evidence correction

`RELEASE-GATE.md` records converter blob `ff53b04a...`, but pinned commit `eaba4cec...` contains blob `eafc31957e29b848b778f2f9c7eb9c333af086e9`. The latter adds valid `D<digits>` / `SLP` config tokens and is the tested/deployed file. Correct the release pin.

## Required handback

Please provide a new exact overlay commit (and firmware/HA commits if needed) with:

1. the endpoint-safe mains fix;
2. persistent/readable `0x0010` Match-local-state behavior;
3. readable protected `device_config`;
4. HA contract aligned to LEFT/MIDDLE vs RIGHT;
5. live-equivalent regression tests for ordinary unscoped frontend/HA MQTT operations.

Executor will then deploy the corrected overlay, repeat readback/restart gates, test desktop/mobile advanced-lock UX, and run operator-assisted LEFT/MIDDLE/RIGHT physical acceptance. Do not mark v5 accepted yet.
