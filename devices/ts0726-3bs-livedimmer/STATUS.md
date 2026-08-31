# STATUS — LivingRoomMainDimmer (`TS0726-3-BS`)

Ledger: <https://github.com/analienx/bseed/issues/8>
Preconditions and forbidden actions: [`.supervisor/project.yaml`](./.supervisor/project.yaml)
Safety invariants: [`docs/LR_MAINDIMMER_SWAPPED_PINS.md`](./docs/LR_MAINDIMMER_SWAPPED_PINS.md)

**Nothing has been flashed. No OTA, no reset, no re-pair, no bind or group change by this
stream.**

## Gate — 4 open, 1 BLOCKED

| # | Precondition | Status |
|---|---|---|
| 1 | `converter_determinism` — resolve which definition governs the device | **open** |
| 2 | `converter_regenerated_and_deployed` — prove `relay_*_physical_mode` read+write in Z2M | **open** |
| 3 | `firmware_side_migration` — one-shot, pre-parse, marker + pre-seed `detached_on` | **open** |
| 4 | `rollback_artifact` — purpose-built migration-revert recovery image | **open** |
| 5 | `stale_bind_capacity` — reclaim stale entries one at a time | **BLOCKED `blocked_pending_eui64`** |

> **STOP — precondition 5 is not executable from this evidence.** The "dead" coordinator
> spelling `0x00124b002d12b1fd` and the "current" coordinator spelling `0xfdb1122d004b1200`
> are octet-reversals of each other, and only the former carries the Silicon Labs OUI. They
> may be **one** IEEE in two byte orders, not two nodes. The 7 entries below labelled `DEAD`
> are separated from the 14 labelled `coord` purely by which spelling the store holds, and
> the capture itself labels **both** forms `UNKNOWN-OR-DEAD`. **Neither address is proven
> dead and no bind on this device may be removed** until the coordinator's actual on-air
> IEEE is identified by a live read. If they are one node, those 7 are live reporting binds
> and deleting them silently breaks this device's reporting — and the same byte-order
> assumption undersizes the network-wide figure `home-assistant-stack#41` is built on.
> Full statement in [`.supervisor/project.yaml`](./.supervisor/project.yaml)
> (`stale_bind_capacity.block_reason`). Nothing has been reclaimed.

## Identity

```text
friendly_name   LivingRoomMainDimmer
ieee            0xa4c13843a9d40f85
manufacturer    _TZ3000_iedhxgyi        model  TS0726-3-BS
board           SWITCH_BSEED_TS0726_3GANG   role router   mcu TLSR8258 (Telink)
installed       1.1.2-8542fc05   dateCode 20260612   fileVersion 285356032
ota identity    manufacturerCode 4417   imageType 45577
canary build    b82774b7   fileVersion 285356043   flashed: NO
coordinator     0xfdb1122d004b1200  labelled SONOFF Dongle Max MG24 (ember) -- UNPROVEN, see gate
dead previous   0x00124b002d12b1fd  labelled SLZB-06p7 -- UNPROVEN; octet-reversal of the line above
              neither spelling is evidenced: the capture's coordinator block carries only
              adapter/channel/transmit_power and no IEEE at all (2026-08-31T18:13:00Z blob)
z2m             2.13.0-1
```

## Device state — captured `2026-08-31T18:13:00Z`

Z2M's stored records now **agree with** the five authoritative raw `readResponse` captures
taken `06:44Z`–`07:04Z`, which is the first time in this investigation both sources match.

Relay endpoints (raw ZCL attribute ids):

| EP | `0x0000` onOff (panel LED slot) | `0xff01` indicator mode | `0xff02` indicator state (**mains**) | `0x4003` |
|---|---|---|---|---|
| EP4 LEFT | `0` | **`2` manual** | **`1` ON** | `255` |
| EP5 MIDDLE | `1` | **`2` manual** | **`1` ON** | `255` |
| EP6 RIGHT | `0` | `0` same | `0` | `255` |

Switch endpoints — `0xff01` is `relay_mode`, and **3 = `short_press`, never `detached`**:

| EP | switch type | relay_mode | relay_index | long press ms | move rate | binded_mode | switchActions |
|---|---|---|---|---|---|---|---|
| EP1 LEFT | 1 momentary | **3** | 1 | 921 | 39 | 3 | 2 |
| EP2 MIDDLE | 1 momentary | **3** | 2 | 974 | 44 | 3 | 2 |
| EP3 RIGHT | 1 momentary | **3** | 3 | 829 | 50 | 3 | 2 |

Accepted interim state per the ruling: EP4 and EP5 `manual` + `ON`; EP1/EP2 `short_press`;
EP6/RIGHT canonical and untouched. `P001` **stays as executed**.

Config string is still the deployed swapped one, unchanged:

```text
iedhxgyi;TS0726-3-BS;LC4;SB1u;RC0;IC2;SB7u;RD7;IC3;SB4u;RD2;IB5;M;
```

## Bind table — 28 of 32, four free

```text
EP1 (6)  genMultistateInput>coord  genOnOff>coord  genLevelCtrl>coord
         genLevelCtrl>LivingRoomLinearDimmer/11  genOnOff>LivingRoomLinearDimmer/11
         genOnOff>LivingRoomMainDimmer/4            <- self-bind to its own relay endpoint
EP2 (6)  genLevelCtrl>G25  genOnOff>G25  genOnOff>LivingRoomMainDimmer/5   <- self-bind
         genMultistateInput>coord  genOnOff>coord  genLevelCtrl>coord
EP3 (6)  genOnOff>G3  genMultistateInput>DEAD  genLevelCtrl>DEAD
         genMultistateInput>coord  genOnOff>coord  genLevelCtrl>coord
EP4 (4)  genOnOff>DEAD  genLevelCtrl>DEAD  genOnOff>coord  genLevelCtrl>coord
EP5 (4)  genOnOff>DEAD  genLevelCtrl>DEAD  genOnOff>coord  genLevelCtrl>coord
EP6 (2)  genOnOff>DEAD  genOnOff>coord
```

`DEAD` in the table above is a **label carried over from the store's own resolution, not a
proven fact**.
It marks the 7 entries naming `0x00124b002d12b1fd`, described as the removed SLZB-06p7. That
spelling is the octet-reversal of `0xfdb1122d004b1200`, which the same capture calls the
*current* coordinator and which holds 14 of these 28 entries — so the claim that all 7 "can
never be delivered" is **not supported by the artifact printed above it** and is gated by
precondition 5. Treat none of them as removable. The device reached 32/32 once already during
this investigation, which is the only established capacity fact here.

History of the count: `27` at `2026-08-30T20:44Z` → `21` at `21:09Z` → `28` at `2026-08-31T07:13Z`
→ `28` now. `configure()` re-adds the coordinator binds on every restart and re-interview, so
removing them is not durable — that has to be fixed at the converter source first.

## Groups

```text
GROUP 8   Lights All                   10 members, includes MainDimmer/6
GROUP 23  LR LinearDimmerButtLeft       LivingRoomLinearDimmer/11 , MainDimmer/4
GROUP 24  LR KitchenBulbsDimmerButtMid  3x LivingRoomBulbTable , MainDimmer/5
GROUP 30  LR KitchenBulbsAndLinear      3x bulb , LinearDimmer/11 , MainDimmer/4 , MainDimmer/5
GROUP 110 LR Circle                     LivingRoomCircleLightDimmer/11 , MainDimmer/6
GROUP 3   empty, but EP3 still binds genOnOff to it
```

## Converter contract

```text
/config/zigbee2mqtt/external_converters/switch_custom.js
sha256 ef79acfd2141837b539189bfadda07799b53267bd746e1209335d38b91c66bfe
967427 bytes, 19036 lines, mtime 2026-08-22 17:34 +0200

TS0726-3-BS declared twice, no manufacturerName / filters on either:
  line 14512 -> EC-GL86ZPCS31
  line 14917 -> EC-SL-FK86ZPCS31
physical_mode          : 0 occurrences   -> new canary attribute unreachable today
switch_custom_firmware : 0 occurrences   -> yet Z2M published it on 2026-08-30 and stopped
                                           after the 06:17Z restart with no config edit
```

Both feed preconditions 1 and 2.

## Evidence standard (binding)

ZCL readback proves **configuration only**. Downstream reachability does not prove the
absence of a power interruption. A claim of electrically zero transient requires physical
electrical measurement. A ZCL attribute must never be phrased as proof of contact voltage —
`led_blink()` ends in the OFF phase without writing `indicator_state` back, so the GPIO can
be low while every software surface reports energised.

## Open / follow-up (not blocking the canary)

- Duplicate `commandToggle` on EP2 — no longer priority 1 for the power-safety incident
  (SAME-mode coupling is established and `manual` blocks it), but it must be resolved before
  the final smart-light bindings are declared DONE. Discriminator is TSN comparison plus a
  paged ZDO `bindingTable()` read via a read-only in-process helper.
- `EP1 -> genOnOff>EP4` and `EP2 -> genOnOff>EP5` self-binds: loopback into the device's own
  relay endpoint is **not demonstrated**, so these are hygiene, not a claimed fix.
- RIGHT and empty `GROUP 3` — record only, do not change in passing.
- `transmit_power` tracked-vs-live drift — belongs to the HA stream, explicitly out of scope.
