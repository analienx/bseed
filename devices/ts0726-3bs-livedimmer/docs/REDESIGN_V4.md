# TS0726-3-BS redesign v4 — authoritative architecture

## Scope

Target:

- IEEE: `0xa4c13843a9d40f85`
- manufacturer/model: `iedhxgyi / TS0726-3-BS`
- board: BSEED Echo Click / Scale 3-gang
- historical firmware: `1.1.2-8542fc05`
- historical swapped config:
  `iedhxgyi;TS0726-3-BS;LC4;SB1u;RC0;IC2;SB7u;RD7;IC3;SB4u;RD2;IB5;M;`
- canonical config:
  `iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;`

This document supersedes the earlier assumption that RIGHT should remain `follow_state`.

## Core invariant

All three downstream loads are smart Zigbee lighting and must remain powered.

Therefore the final electrical policy is:

| Channel | Logical relay state | Physical relay policy | Direct target |
| --- | --- | --- | --- |
| LEFT | changes normally | `always_on` / DETACHED_ON | Linear dimmer |
| MIDDLE | changes normally | `always_on` / DETACHED_ON | Kitchen table bulbs |
| RIGHT | changes normally | `always_on` / DETACHED_ON | Circle dimmer |

Logical state is intentionally independent from mains state.

## Why RIGHT is also Always on

Retained topology proves group 110 contains:

- MainDimmer EP6
- LivingRoomCircleLightDimmer EP11

Earlier live evidence also showed the Circle dimmer becomes unavailable when MainDimmer EP6 is off.

Keeping RIGHT attached/follow-state would therefore preserve the failure mode where a smart Zigbee dimmer loses supply power. RIGHT is now part of the same permanent-power policy as LEFT/MIDDLE.

## Firmware transaction

Two scopes must remain separate:

### Swapped-pin safety scope

LEFT/MIDDLE only.

Before canonicalization their indicator pins C2/C3 are the real mains path, so migration must first establish:

- indicator mode = MANUAL
- indicator state = ON

### Permanent-power scope

LEFT/MIDDLE/RIGHT.

Before canonicalization is committed, persist physical mode DETACHED_ON for relay indexes 0, 1 and 2.

On the old swapped map:
- indexes 0/1 affect panel-LED-side R pins and are harmless pre-seeds;
- index 2 already controls real RIGHT mains and intentionally energizes it.

After canonicalization:
- C2, C3 and D2 are all real relay outputs;
- all three are already protected by DETACHED_ON.

Recovery:
1. on canonical NVM, re-prove all three DETACHED_ON modes;
2. restore LEFT/MIDDLE MANUAL+ON indicator safety;
3. restore swapped config;
4. delete all three physical-mode slots;
5. clear migration marker.

## Converter architecture

Do not replace the fleet converter with a newly generated global Romasku file.

Use:

1. exact historical fleet converter:
   SHA256 `ef79acfd2141837b539189bfadda07799b53267bd746e1209335d38b91c66bfe`
2. one target-only BSEED v4 overlay:
   exact fingerprint `iedhxgyi / TS0726-3-BS / 1.1.4-bseedv4`, priority 100.

The authoritative canary overlay source is:
`zigbee2mqtt/converters/bseed_ts0726_v4.js` on
`supervisor/target-overlay-v4-release`.

The firmware branch must not carry a second converter copy. Generic generator
hardening may continue independently, but the canary deployment bundle copies
this one dedicated audited overlay.

Installed ZHC 26.90.0 searches matching fingerprints before zigbeeModel fallback, so the overlay wins only for the successful forward canary build while old firmware and `1.1.4-bseedv4r` recovery fall back to the historical converter. The historical file preserves:
- B28WRPVX PM metering/protection;
- historical action APIs;
- unrelated custom device contracts.

## Legacy action compatibility

Historical `action` is functional, not stale.

It decodes:
- genMultistateInput presentValue;
- genOnOff commands;
- genLevelCtrl move/stop commands.

Stable combined action prefixes remain:
- `switch_0_*` LEFT
- `switch_1_*` MIDDLE
- `switch_2_*` RIGHT

Per-button action event payloads are also preserved.

The target overlay decodes these frames but has no configure callback that creates bindings.

Live retained topology already has coordinator bindings on EP1-EP3 for:
- genMultistateInput;
- genOnOff;
- genLevelCtrl;

and presentValue reporting is already configured.

## Final button/binding behavior

Button configuration remains:
- Button type: momentary
- Button command behavior: toggle_simple
- Local relay trigger: short_press
- Bound-device trigger: short_press
- Assigned local relay: LEFT=1, MIDDLE=2, RIGHT=3

### LEFT

Keep direct external bindings:
- EP1 genOnOff -> LinearDimmer EP11
- EP1 genLevelCtrl -> LinearDimmer EP11

Remove redundant self-bind:
- EP1 genOnOff -> MainDimmer EP4

Local relay trigger already updates logical EP4 once. The self-bind would toggle it a second time.

### MIDDLE

Keep external group bindings:
- EP2 genOnOff -> group 25
- EP2 genLevelCtrl -> group 25

Remove redundant self-bind:
- EP2 genOnOff -> MainDimmer EP5

Local relay trigger already updates logical EP5 once.

### RIGHT

Keep the same one-local-toggle + one-external-toggle topology as LEFT.

Add direct external bindings:
- EP3 genOnOff -> CircleDimmer EP11
- EP3 genLevelCtrl -> CircleDimmer EP11

Do **not** bind EP3 to group 110.

Group 110 already contains both CircleDimmer EP11 and MainDimmer EP6. With the
current `toggle_simple` + local `short_press` configuration, one button release
first toggles logical EP6 locally and then sends a Zigbee Toggle to its bound
destination. If that destination were group 110, EP6 would receive the group
Toggle too and immediately toggle a second time back to its original logical
state. The Circle light would change while MainDimmer's logical state/indicator
would be wrong.

Group 110 membership may remain untouched for compatibility; it is simply not
used as the RIGHT button's bound target.

### Coordinator compatibility bindings

Keep EP1-EP3 coordinator bindings for:
- genMultistateInput
- genOnOff
- genLevelCtrl

They feed the historical action/event API.

### Relay reporting

Keep relay endpoint genOnOff reporting to coordinator.

Do not add genLevelCtrl bindings to relay endpoints.

Raw ZDO table cleanup remains a separate later operation once authoritative paging evidence is available.

## Indicator strategy

Firmware-complete migration state:

- LEFT indicator behavior = MANUAL, state = ON
- MIDDLE indicator behavior = MANUAL, state = ON
- RIGHT indicator behavior = existing valid setting (currently SAME)

The migration image must **not** change LEFT/MIDDLE to SAME. Firmware can prove
NVM/config invariants, but it cannot prove the real downstream smart-light feeds
remained continuously powered through the reboot.

Final desired post-proof state:

- LEFT indicator behavior = SAME
- MIDDLE indicator behavior = SAME
- RIGHT indicator behavior = SAME

The separate LEFT/MIDDLE transition is authorized only after:
1. exact canonical config is read back;
2. all three physical modes read back as Always on;
3. operator confirms physical power continuity.

Recovery always restores LEFT/MIDDLE MANUAL+ON before reintroducing the swapped map.

## Home Assistant reconciliation

The two old automations:
- `1776711056902` Swapped Output Sync ON
- `1776711287935` Swapped Output Sync OFF

are replaced in the staged post-migration branch by one three-channel logical-state synchronizer.

Mapping:
- LinearDimmer -> `state_relay_left`
- Kitchen table bulbs -> `state_relay_middle`
- Circle dimmer -> `state_relay_right`

This makes the logical relay/indicator reflect actual smart-light state when a light changes through HA, voice, another controller, or external automation.

The staged automation is fail-closed: it performs no sync unless all three
`select.livingroommaindimmer_relay_*_physical_mode` entities report
`always_on`. It retriggers when those policy entities become ready, preventing
an accidental pre-migration deployment from turning the legacy attached RIGHT
mains relay off.

Direct button operation does not depend on HA:
- local relay trigger updates logical state immediately;
- direct Zigbee binding controls the light;
- SAME indicator follows logical state locally.

HA later reconciles any divergence.

Circle voice scripts no longer turn MainDimmer relay_right on/off. They address the Circle smart-light entity directly.

## Z2M UX

Target-only UI semantics:

- `State` -> **Logical relay state**
- `Power-on behavior` -> **Logical state after power-up**
- **Physical relay behavior**
  - follow_state
  - always_on
  - always_off
- Assigned local relay description explicitly maps:
  - relay_1 = Left
  - relay_2 = Middle
  - relay_3 = Right

Conceptual expose order:
1. logical relay states
2. physical relay behavior
3. button behavior
4. indicators
5. diagnostics
6. device settings
7. Advanced hardware configuration
8. linkquality

Physical relay behavior is exposed only by the standalone overlay fingerprinted to softwareBuildID `1.1.4-bseedv4`; legacy `1.1.2-8542fc05` and recovery `1.1.4-bseedv4r` continue to use the historical fleet converter and therefore never see unsupported physical-policy controls.

## Current supervisor code branches

Converter / target overlay:
`analienx/tuya-zigbee-switch:supervisor/target-overlay-v4-release`
(authoritative release file: `zigbee2mqtt/converters/bseed_ts0726_v4.js`; clean branch based on upstream `main`, with no global canary-generator modifications)

Firmware migration/build only:
`analienx/tuya-zigbee-switch:supervisor/ts0726-redesign-v4`

Staged HA reconciliation:
`analienx/home-assistant-stack:supervisor/ts0726-post-migration-ha-v1`

Fleet regression tooling / evidence contract:
`analienx/bseed:supervisor/full-regression-review-v1`

## Release sequence

No live mutation is implied by this document.

1. Validate the clean standalone overlay release branch; generic fleet-generator canary experiments are explicitly out of the release path.
2. Build isolated historical+overlay bundle.
3. Validate matcher precedence against installed ZHC.
4. Validate action decoder contract.
5. Validate zero-bind installed-ZHC configure surface.
6. Restore fleet converter compatibility using historical+overlay architecture.
7. Re-run full 105-device regression and verify PM surfaces restored.
8. Capture actual Z2M target UI.
9. Validate supervisor firmware branch and build new forward/recovery artifacts with bumped file versions.
10. Stop at real OTA boundary.
11. With operator present, forward OTA target only.
12. Read exact canonical config and all three Always-on modes.
13. Physically prove LEFT/MIDDLE/RIGHT smart-light feeds remain powered through reboot.
14. Press/button E2E validation.
15. Only after canonical/power proof, transition LEFT/MIDDLE indicator behavior to SAME.
16. Apply staged HA reconciliation.
17. Apply separately authorized binding reconciliation.
18. Full regression.
19. Only after successful canary consider generic upstream PRs.

## Still protected

Until separately authorized:
- actual firmware OTA
- bind deletion/addition
- group mutation
- coordinator mutation
- factory reset/re-pair
- global security reset
