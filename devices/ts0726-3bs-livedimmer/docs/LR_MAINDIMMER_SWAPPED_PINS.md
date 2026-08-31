# LivingRoomMainDimmer — intentional swapped R/I pin design (do not auto-normalize)

Device: `LivingRoomMainDimmer`, IEEE `0xa4c13843a9d40f85`, model `TS0726-3-BS`,
manufacturer name `iedhxgyi`, romasku firmware `1.1.2-8542fc05` (dateCode `20260612`),
external converter `switch_custom.js`, Zigbee2MQTT `2.13.0` on a SONOFF Dongle Max MG24
(Ember adapter).

Current control ledger:
[analienx/bseed#8](https://github.com/analienx/bseed/issues/8). Migrated from
[analienx/home-assistant-stack#39](https://github.com/analienx/home-assistant-stack/issues/39),
which is closed with a MOVED TO pointer; its history and the comment permalinks cited below
remain readable.

## What this file is for

This device runs a **deliberate, non-canonical GPIO pin swap**. It looks like a
misconfiguration next to the upstream hardware definition and has already been
"fixed" back to upstream by mistake once. Anyone comparing this device to
`analienx/tuya-zigbee-switch` `device_db.yaml` will see a mismatch. It is intentional.

## Config strings

Deployed (swapped):

```text
iedhxgyi;TS0726-3-BS;LC4;SB1u;RC0;IC2;SB7u;RD7;IC3;SB4u;RD2;IB5;M;
```

Upstream canonical for `_TZ3002_iedhxgyi` / `TS0726` (as of `bf1059e`,
`device_db.yaml:4604`):

```text
iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;
```

## What is swapped, and what each GPIO physically is

Two channels, LEFT and MIDDLE. RIGHT is not swapped.

| Channel | Upstream `R` (relay) | Upstream `I` (indicator) | Deployed `R` | Deployed `I` |
|---|---|---|---|---|
| LEFT   | `RC2` | `IC0` | `RC0` = **panel LED** | `IC2` = **mains relay GPIO** |
| MIDDLE | `RC3` | `ID7` | `RD7` = **panel LED** | `IC3` = **mains relay GPIO** |
| RIGHT  | `RD2` | `IB5` | `RD2` (canonical) | `IB5` (canonical) |

So on LEFT/MIDDLE the roles are inverted relative to upstream: the slot Zigbee2MQTT
calls a *relay* drives the harmless panel LED, and the slot Zigbee2MQTT calls an
*indicator* drives the real mains relay GPIO.

## Why the swap exists

The three buttons are meant to be **smart-light controllers**, not mains switches:

- LEFT button → `light.livingroomlineardimmer`
- MIDDLE button → `light.lr_kitchen_table_bulbs`
- RIGHT button → `light.livingroomcirclelightdimmer`

The smart LED loads behind them must keep mains power continuously — a smart bulb
that is de-energised cannot be reached by voice, HA, or its own button. Swapping the
pins makes the button's *local relay action* land on the panel LED instead of the
mains contact, so a press produces local visual feedback without dropping power.
The mains GPIO then sits in the indicator slot, where it can be pinned ON.

Right channel is left canonical on purpose and must not be generalised to the
swapped scheme without its own evidence.

## Hard invariants

1. **LEFT/MIDDLE must never be `detached`.**
   With the swap, `detached` makes the firmware's press-indication path pulse the
   *indicator* GPIO for 50 ms — and on these two channels the indicator GPIO is the
   mains relay. That is a mains interruption on every press. Source, installed commit:

   ```c
   // src/zigbee/switch_cluster.c @ 8542fc05
   static void switch_cluster_flash_indicator(zigbee_switch_cluster *cluster) {
       if (cluster->indicator_led == NULL) return;
       if (cluster->relay_mode != ZCL_ONOFF_CONFIGURATION_RELAY_MODE_DETACHED &&
           switch_cluster_has_valid_relay(cluster)) return;
       if (cluster->indicator_led->blink_times_left == 0)
           led_blink(cluster->indicator_led, 50, 50, 1);   // <-- pulses C2 / C3
   }
   ```
   Keep `switch_*_relay_mode = short_press` (raw `0xff01 = 3`).

2. **LEFT/MIDDLE `indicator_mode` must stay `manual`.**
   `EP4`/`EP5` are members of Zigbee groups (`23`, `24`, `30`) that also contain the
   real lights. In `same`/`opposite` mode, every inbound group On/Off command
   re-syncs the indicator GPIO — i.e. a bulb state change would switch mains for the
   whole living-room feed. Source, installed commit:

   ```c
   // src/zigbee/relay_cluster.c @ 8542fc05
   void sync_indicator_led(zigbee_relay_cluster *cluster) {
       if (cluster->indicator_led == NULL) return;
       if (cluster->indicator_led_mode != ZCL_ONOFF_INDICATOR_MODE_MANUAL) {
           if (cluster->indicator_led_mode == ZCL_ONOFF_INDICATOR_MODE_SAME)
               cluster->indicator_state = cluster->relay->on;
           else
               cluster->indicator_state = !cluster->relay->on;
       }
       cluster->indicator_state ? led_on(cluster->indicator_led)
                                : led_off(cluster->indicator_led);
   }
   ```
   `relay_cluster_on/off/toggle()` call this unconditionally after touching the
   contact; `relay_cluster_on_write_attr()` calls it unless the mode is `manual`.

3. **`indicator_state` for `relay_left` and `relay_middle` is the mains keep-alive.**
   It must read `ON`. `OFF` holds the corresponding mains GPIO low and de-energises
   that lighting circuit.

4. **These GPIOs are active-high — there is no hidden inversion behind the swap.**
   ```c
   // src/device_config/config_parser.c @ 8542fc05
   } else if (entry[0] == 'I') {  leds[leds_cnt].on_high = entry[3] != 'i'; }  // 'IC2' -> 1
   ...
   } else if (entry[0] == 'R') {  relays[relays_cnt].on_high = 1; }            // hardcoded
   ```
   `ON` ⇒ GPIO high ⇒ relay energised.

5. **Exactly one actuation source per relay endpoint.** In the installed firmware a
   momentary release runs *both* the local relay action and the bound action:
   ```c
   // src/zigbee/switch_cluster.c @ 8542fc05, switch_cluster_on_button_release(), 394-400
   if (cluster->multistate_state != MULTISTATE_LONG_PRESS) {
       if (cluster->relay_mode == ZCL_ONOFF_CONFIGURATION_RELAY_MODE_SHORT)
           switch_cluster_relay_action_on(cluster);      // toggles EP4 / EP5 locally
       if (cluster->binded_mode == ZCL_ONOFF_CONFIGURATION_BINDED_MODE_SHORT)
           switch_cluster_binding_action_on(cluster);    // sends Toggle to binds
   }
   ```
   Both are enabled here (`relay_mode = short_press`, `binded_mode = short_press`,
   `switchActions = 2` = `TOGGLE_SIMPLE`). So every short release leaves the switch
   endpoint with **two emissions**: one local `relay_cluster_toggle()` on `EP4`/`EP5`,
   and one outbound bound `Toggle`.

   **Proven:** the local action alone is already sufficient to produce the electrical
   failure — under invariant 2 (`indicator_mode = same`) that single local toggle drives
   `C2`/`C3` directly. No loopback, self-bind or duplicate frame is needed.

   **NOT demonstrated:** that the outbound command is re-absorbed by this device's *own*
   relay endpoint — same-device multicast loopback from group 23 into `EP4`, or delivery
   of the `EP2 -> EP5` self-unicast back into `EP5`. No incoming `EP4`/`EP5` command frame
   has been captured closing that loop. Treat the second transition as **structural
   hygiene, not part of the established mechanism**, and do not let a repair depend on it.

   **All four actions below are bind-table writes and are DEFERRED.** Precondition 5
   (`stale_bind_capacity`) is `blocked_pending_eui64`: the "dead" and "current" coordinator
   spellings in this campaign are octet-reversals of one another, so no destination in this
   device's bind table is proven stale, and removing a live reporting bind would break
   reporting silently. None of them has been performed. Do not perform any of them until the
   coordinator's on-air IEEE is identified — see `.supervisor/project.yaml`.

   The hygiene actions, once unblocked, are:

   - do not bind `EP1` to a group that contains `EP4`;
   - do not keep an `EP2 -> EP5` self-binding without a demonstrated need;
   - remove `genLevelCtrl` binds/reporting from relay endpoints `EP4`/`EP5`/`EP6` — they
     have no useful `currentLevel` and only generate poll failures and consume APS slots;
   - **keep** `genOnOff` + `genLevelCtrl` on the switch endpoints `EP1`/`EP2`/`EP3`.

   `detached` is **not** an available workaround here, because invariant 1 makes the
   DETACHED press-flash pulse the mains GPIO. Mirror inbound light state through the HA
   automation instead.

6. **`indicator_mode` and `indicator_state` default into the dangerous direction when
   the relay's NVM record is absent.**
   ```c
   // src/device_config/config_parser.c @ 8542fc05, line 56
   zigbee_relay_cluster relay_clusters[4];   // file-scope -> zero-initialised;
                                             // the parser never sets these fields
   // src/zigbee/relay_cluster.c @ 8542fc05, relay_cluster_load_attrs_from_nv()
   if (st != HAL_NVM_SUCCESS) return;        // leaves them at 0
   ```
   With `ZCL_ONOFF_INDICATOR_MODE_SAME = 0` and `indicator_state = 0`:

   ```text
   indicator_mode  -> same   (invariant 2 becomes live: group traffic drives mains)
   indicator_state -> OFF    (invariant 3 broken: C2/C3 released, both feeds dead)
   ```

   So after a factory reset, a re-commission, **or any firmware change that alters the
   relay NVM record size or item id**, this device comes back with both living-room
   feeds de-energised and the mains GPIO coupled to every toggle — with no error
   anywhere in Z2M or HA. Always re-read `genOnOff [0xff01, 0xff02]` from the device
   after a firmware change and re-assert `manual` + `ON` if they moved.

   **Scope note:** this is a *latent* hazard of the design, not an explanation for the
   #39 incident. The `indicator_mode = same` observed on 2026-08-30 was **changed
   manually by the operator during troubleshooting and then reverted**
   ([#39 comment 5471465425](https://github.com/analienx/home-assistant-stack/issues/39#issuecomment-5471465425)).
   Do not attribute it to Ember migration, re-interview, NVM loss, OTA or spontaneous
   reversion. Reopen this branch only if a fresh **device read** shows the value moved
   away from `MANUAL` without any operator write.

7. **`indicator_state` is not proof of the physical relay state.** After any press
   blink the GPIO is left LOW while the attribute keeps reading `ON`, so Z2M and HA
   will both show a mains feed as energised when it is not. `led_blink()` ends in the
   OFF phase and never writes the cluster's `indicator_state` back:
   ```c
   // src/base_components/led.c @ 8542fc05
   void led_blink(led_t *led, uint16_t on_time_ms, uint16_t off_time_ms, uint16_t times) {
       ...
       hal_gpio_write(led->pin, led->on_high);   // start ON
       led->blink_times_left = times;
       hal_tasks_schedule(&led->blink_task, on_time_ms);
   }
   static void led_blink_handler(void *arg) {
       if (led->blink_times_left == 0) return;   // 2nd call: pin already LOW, returns here
       if (led->on) { led->on = 0; hal_gpio_write(led->pin, !led->on_high);
                      led->blink_times_left--; ... }
   }
   ```
   Only a subsequent `led_on()`/`led_off()` — i.e. the next `sync_indicator_led()`
   triggered by some relay change — reconciles the GPIO with the attribute. Until then
   the reported value is wrong. **Never accept `relay_*_indicator_relay_* == ON` as
   evidence that a living-room feed is powered.** Trust only a device read of
   `0xff02` *and* an observation that no blink has since occurred, or simply confirm
   the downstream light is reachable.

   There is no firmware knob to disable the blink: `ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_ACTIONS`
   is declared but never consulted in any actuation path, so no `switchActions` value
   suppresses it. The only protection is invariant 1 (never `detached`, always a valid
   relay index).

## Expected mapping

```text
LEFT   switch EP1 -> group 23 (LR LinearDimmerButtLeft)      -> LivingRoomLinearDimmer/11
MIDDLE switch EP2 -> group 25 (LR KitchenBulbsDimmerButtMid) -> 3x LivingRoomBulbTable
RIGHT  switch EP3 -> group 3 + LivingRoomCircleLightDimmer/11

button press -> local relay action -> "relay" EP4/EP5 = panel LED C0/D7 changes
             -> bound Zigbee action -> real smart light / group changes
real mains relay C2/C3 -> indicator slot, mode MANUAL, state ON, never touched by a press
panel LED -> driven by the local relay action only (one actuation source, invariant 5)
inbound light state -> mirrored onto the panel LED by the HA "Swapped Output Sync" automations
```

`EP4`/`EP5` should not be members of a group that `EP1`/`EP2` bind to, and `EP2` should
not carry a direct `genOnOff -> EP5` self-binding, while `relay_mode` is non-detached —
see invariant 5. As of `2026-08-30T21:09:34Z` the live bind table had both (`EP1 -> group
23` where group 23 contains `MainDimmer/4`, and an `EP2 -> MainDimmer/5` self-bind).
Whether those commands actually loop back into the device's own relay endpoints is
**not yet demonstrated**, so this is redundancy removal and clean state ownership, not a
claimed fix for the brownout. The established cause is invariant 2: with
`indicator_mode = same`, the *local* action alone drives the mains GPIO.

## Last verified live state

**Authoritative device reads**, taken by issuing ZCL `Read Attributes` through
Zigbee2MQTT and capturing the raw `readResponse` frames — not HA or Z2M cache.
Five independent reads agree, at `06:44Z`, `06:51Z`, `06:58Z`, `07:00Z` and `07:04Z`
on `2026-08-31` (UTC; Z2M log lines print host-local UTC+2, so `08:44` in the log is
`06:44Z`).

| Raw attribute | EP4 (LEFT) | EP5 (MIDDLE) | EP6 (RIGHT) |
|---|---|---|---|
| `0x0000` onOff (panel LED GPIO C0/D7/B5) | `0` | `0`→`1`→`0` during test | `0` |
| `0xff01` indicator mode | **`2` = MANUAL** | **`2` = MANUAL** | `0` = same |
| `0xff02` indicator state (**mains GPIO**) | **`1` = ON** ✅ | `1` = ON | `0` |

Switch endpoints (`genOnOffSwitchCfg 0xff01`) read **`3` = `short_press`** on EP1, EP2
and EP3 — never `detached`, as invariant 1 requires.

`EP4 0xff02` was `0` (OFF) on `2026-08-31T06:43Z` and was **written to `1` at
`06:57:55Z`**, then re-read as `1` three times and actively reported by the device as an
`attributeReport {"65282":1}`. That was the `P001` action from
[#39 comment 5471205004](https://github.com/analienx/home-assistant-stack/issues/39#issuecomment-5471205004),
executed under the Supervisor's "Execute now" instruction in
[comment 5471363277](https://github.com/analienx/home-assistant-stack/issues/39#issuecomment-5471363277).

**Invariant 2 verified by test, not just by reading code.** Four `OnOff/Toggle` commands
were sent unicast to `EP4` and `EP5` — byte-for-byte the same firmware call the button's
local relay action makes (`relay_cluster_toggle()` → `relay_on/off()` +
`sync_indicator_led()`). Across all four cycles `0xff02` stayed `1` on both endpoints,
`0xff01` stayed `2`, no `attributeReport` for `0xff02` was emitted, and no downstream
light changed state or availability. So under `MANUAL`, a local relay transition cannot
reach the mains GPIO. This does **not** replace a physical press test, which still has to
exercise the button input path and the bound action.

### Cache is not evidence — two independent demonstrations

1. Z2M's `database.db` held `65281 = 0` (`same`) from a `2026-08-30T20:27:45Z` read for
   hours after `manual` had been written, so a naive read of the store reports the
   superseded value.
2. After the `06:57:55Z` write succeeded and the device answered `{"65282":1}`, Z2M's
   on-disk `state.json` **still showed `relay_left_indicator_relay_left = OFF`** at
   `07:00:19Z` while the HA entity already read `on`. It only agreed after a later
   publish cycle.

Verify with a device read, and prefer the HA entity or a fresh `readResponse` over
`state.json` when they disagree.

## Known transport constraint — do not retry the config write

Writing `device_config` (`genBasic` `0xff00`, type 68) fails on this coordinator with
`MESSAGE_TOO_LONG` **before** reaching the device, even though the string is 66 bytes
and well under romasku's 256-byte limit. Do not treat that as a parser rejection and
do not keep retrying. Any future move to the canonical pinout must first solve the
config-write transport (firmware-side migration/default, or another target-scoped
method) — never by shortening manufacturer/model strings or otherwise changing device
identity to fit the packet.

## Deployed Z2M converter (the `TS0726-3-BS` software contract)

The converter that defines every attribute name used above is **not tracked in Git on any
branch** — it exists only on the host:

```text
/config/zigbee2mqtt/external_converters/switch_custom.js
sha256  ef79acfd2141837b539189bfadda07799b53267bd746e1209335d38b91c66bfe
size    967427 bytes, 19036 lines
mtime   2026-08-22 17:34:31 +0200
```

It is a generated file (header: regenerate from `device_db.yaml` +
`switch_custom.js.jinja` via `make tools/update_converters`), so it is deliberately **not**
vendored here. Four properties of it matter for this device and are easy to get wrong:

**1. `TS0726-3-BS` is declared twice, with different models, and neither has a
disambiguating filter.**

```text
line 14512  zigbeeModel: ["TS0726-3-BS"]  ->  model: "EC-GL86ZPCS31"
line 14917  zigbeeModel: ["TS0726-3-BS"]  ->  model: "EC-SL-FK86ZPCS31"
```

Both blocks declare the same endpoint map and the same `romasku.*` extends, and neither
carries `manufacturerName` nor `filters` — so from the file alone it is not determinable
which definition Z2M binds to our `_TZ3000_iedhxgyi` device. Treat "which converter block
is live" as an open question requiring `zigbee2mqtt/bridge/devices` at runtime, not as
something settled by reading this file.

**2. `physical_mode` does not exist in the deployed converter.** Verified: 0 occurrences,
and no `configureReporting` for `0xff03`. So the canary firmware's new
`relay_*_physical_mode` attribute is **not reachable from Z2M or Home Assistant** until a
regenerated converter is generated, committed and deployed. Flashing firmware alone leaves
the feature unusable — this is a prerequisite, not a nicety.

**3. The effective definition is not fully explained by this file.** Z2M published
`switch_custom_firmware: "1.1.2-8542fc05"` for this device on 2026-08-30, but that string
occurs **0 times** in `switch_custom.js`. After the Z2M restart at `2026-08-31T06:17Z` the
key is gone from `state.json` altogether. Something outside this file (Z2M's bundled
definitions, or the second `TS0726-3-BS` block) contributed that expose, and the set
changed across a restart without any config edit. Unexplained, and worth resolving before
relying on expose names at all.

**4. The coordinator action binds are re-created automatically, so removing them is not a
durable change.** The device definition's `configure()` runs on every restart and
re-interview:

```js
// switch_left / switch_middle / switch_right
await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
await reporting.bind(endpoint1, coordinatorEndpoint, ["genOnOff", "genLevelCtrl"]);
```

Two consequences that bear directly on the button diagnosis:

- `EP1`/`EP2`/`EP3` regaining `genOnOff -> coordinator` after cleanup is **expected
  behaviour**, not an edit by someone else;
- the `action` topic **is** observable again, so the duplicate-`Toggle` measurement is not
  blocked by a missing bind — it is blocked only by `advanced.log_level` being `info`.

Related: `actionEvent` is fed by **two independent sources on purpose** —
`genMultistateInput` reports (what the button did) *and* the commands the switch sent to
its bindings (what the bound devices were told). So `switch_1_press`, `switch_1_release`
and `switch_1_toggle` in one press cycle are different sources, not evidence of three
button events. The per-frame mapping itself is strictly 1:1
(`convert: (model, msg) => lookupAction(onOffPrefixes, msg, onOffCommands[msg.type])`), so
three `switch_1_toggle` **are** three received `commandToggle` frames — but they are
distinct from the press/release reports and must not be added to them when counting.

## How to re-verify (read-only)

Zigbee2MQTT's cached view of the device (keyed by IEEE in the add-on's `state.json`):

```text
/config/zigbee2mqtt/state.json   ->  key "0xa4c13843a9d40f85"
```

Read it over SSH with a script file rather than an inline `python3 -c` — nested quotes
get mangled through cmd → ssh → zsh.

Home Assistant exposes every attribute involved as a first-class entity, which is the
easiest reliable surface:

```text
select.livingroommaindimmer_switch_left_relay_mode_switch_left
select.livingroommaindimmer_switch_middle_relay_mode_switch_middle
select.livingroommaindimmer_relay_left_indicator_mode_relay_left
select.livingroommaindimmer_relay_middle_indicator_mode_relay_middle
switch.livingroommaindimmer_relay_left_indicator_relay_left
switch.livingroommaindimmer_relay_middle_indicator_relay_middle
switch.livingroommaindimmer_relay_left
switch.livingroommaindimmer_relay_middle
text.livingroommaindimmer_device_config_switch_left
```

Check the entity's `last_updated`: shortly after a Core restart they all carry the
restore timestamp, so a value that has not been re-read from the device will still
look correct while being stale. Re-read the device before trusting a rollback baseline.

## Rollback

Rollback of the *pin swap itself* means rewriting `device_config` to the canonical
string — currently blocked by `MESSAGE_TOO_LONG` above, and it must not be attempted
until an equivalent permanent-power + LED-feedback path exists and has been validated.

Rollback of the *attribute* state written in this design, one attribute at a time with
read-back after each:

```text
switch.livingroommaindimmer_relay_left_indicator_relay_left    -> previous value (currently off)
switch.livingroommaindimmer_relay_middle_indicator_relay_middle -> previous value (currently on)
select.livingroommaindimmer_switch_left_relay_mode_switch_left  -> previous value (currently short_press)
select.livingroommaindimmer_switch_middle_relay_mode_switch_middle -> previous value (currently short_press)
```

Do not use `binds/clear` on this device: it issues the optional ZDO *Clear All
Bindings* request, which this Telink device answers `NOT_SUPPORTED`, and it is
global rather than per-entry.

## Canary firmware: what it does and does not fix

`analienx/tuya-zigbee-switch` PR #1 (`experiment/detached-physical-relay-canary`) adds a
per-relay `relay_*_physical_mode` (`attached` / `detached_on` / `detached_off`) that
decouples a relay cluster's *virtual* OnOff state from whether it drives its *physical*
contact. It is the right final direction, but on **this** device as currently pinned it
does not deliver the property it would be flashed for:

- `physical_mode` reaches only the pin from the `R` token. On LEFT/MIDDLE the `R` token
  is the **panel LED**. The mains GPIO comes from the `I` token and is driven by the
  indicator path (`sync_indicator_led()`, `switch_cluster_flash_indicator()`), which the
  branch does not touch. So `detached_on` on `EP4`/`EP5` pins the **LED**, not the mains.
- The NVM-persisted `device_config` **overrides the build-time default**
  (`src/device_config/config_nv.c`: it falls back to `DEFAULT_CONFIG` only when
  `hal_nvm_read` fails). An OTA, or any flash that does not erase the NV region, therefore
  keeps the swapped map silently while every UI surface still reads the new firmware.
- There is no mechanism in the branch to change `device_config` without the single large
  `genBasic 0xff00` write that this Ember coordinator rejects with `MESSAGE_TOO_LONG`.

Consequence: the canonical migration needs either an explicit `Erase All Flash` re-flash
(which also loses the stored network and requires rejoin) or a firmware-side migration —
and the safety property must keep being enforced by invariants 1–7 until then. See
[#39](https://github.com/analienx/home-assistant-stack/issues/39) for the validation
evidence and the two firmware defects the canary still carries.

## Warning

**Do not "normalize" this device to the upstream `device_db.yaml` config string**
without first reproducing, and physically validating, all four of:

1. the real mains relay is permanently ON,
2. the physical button controls the smart Zigbee light/group,
3. the panel LED still gives local feedback,
4. a normal press can never drop power to the smart light.

Until an equivalent is proven, the swapped pin model is the accepted compatibility
design for this installation.
