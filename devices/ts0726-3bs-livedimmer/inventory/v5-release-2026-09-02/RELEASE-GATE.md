# TS0726-3-BS v5 release gate — 2026-09-02

## Disposition

**SOFTWARE V5 GATE: CLOSED / PASS**

This evidence freezes the source and artifact inputs for the next **live canary only**.
It does **not** state that v5 is already deployed or that the product release is complete.

Current live device remains safely on `1.1.4-bseedv4`.

## Frozen release pins

| Surface | Repository | Branch | Commit |
|---|---|---|---|
| Firmware | `analienx/tuya-zigbee-switch` | `supervisor/ts0726-redesign-v5` | `69a4775c4cb4c87f2e948a8aa5b6f099df703ba5` |
| Z2M overlay | `analienx/tuya-zigbee-switch` | `supervisor/target-overlay-v5` | `eaba4ceca83df265ddedde5a6ea60e72ff3522d3` |
| HA v2 | `analienx/home-assistant-stack` | `supervisor/ts0726-post-migration-ha-v2` | `68972efd4b1feb2eb16c3e98c7174c0c36efa65f` |

Overlay path:

`zigbee2mqtt/converters/bseed_ts0726_v5.js`

Git blob:

`ff53b04ac1f24f935f31f2c4ce9ff5f4aece1b0f`

## Exact firmware identities

### Forward

- softwareBuildID: `1.1.5-bseedv5`
- fileVersion: `285356037`
- manufacturerCode: `4417`
- imageType: `45577`
- `forward.bin` SHA256: `97a08214e67d0f052cf463cad109ddf9ebd20921e8db548df788438380ca7281`
- `forward.bin` SHA512: `e33283c8c0025f88f727c4432ce717942caa9ad0e0fa5f5cb916b6ca144bef4981ce24578ab1fa0620853ceec61c2bff6c43760d9c6bf25c646c6f9a36993382`
- `forward.ota` SHA256: `033fe2317fee25c9177c2121b17807fa37bee6ab4ceb8178564ab5e8f3e5f1ae`
- `forward.ota` SHA512: `05d8bef0c1b0a813d3e8d422bcaba2430c64fa9a2e7cc53fe46c80628ec58387ec14be13716a26c57473ab999cc8a03ba569c52d69cd132a4ab4e2b8796a57b9`

### Recovery

- softwareBuildID: `1.1.5-bseedv5r`
- fileVersion: `285356038`
- manufacturerCode: `4417`
- imageType: `45577`
- `recovery.bin` SHA256: `e1e4cdbb7d13b2b5de75487979948e5a9de04eda1df52a8da8b5c7835115883f`
- `recovery.bin` SHA512: `fba590ccc1c305a395e84b13bc9b0f71c075fb6ec628d6ab8d25e0e31d2416effe67970ad48a9449c56c2dc0c9fcdbdb02490bc2bca2f45c75fec44552dcafc2`
- `recovery.ota` SHA256: `001e60bc6ae249f2548f9ed76c9988846984b95e770319781febd7af403d81f6`
- `recovery.ota` SHA512: `66b453ca90d645948d381675cc0b98503461d410d2a97d3b0c4cd54c4b82f8ef6019b10ba9a2440eda86a3ae1588fbf514f24c34f58187a3441be0a82847ef34`

## Reproducible real-Telink build proof

Final source commit `69a4775c...` was built in GitHub Actions:

- run: `33684200082`
- job: `100427622558`
- result: **PASS**
- artifact ID: `9867510244`
- artifact: `bseed-ts0726-v5-final-69a4775c`
- artifact archive digest: `sha256:2b004d404a9c8397d99e2d581ae398356b7d3794302a0b435200e55ca4f4d1c4`

The final build is byte-identical to the previous successful Telink build from product-code commit `395465b1...`. The later commit only added the explicit live-v4→v5 regression test.

## Firmware acceptance

Full simulator test job on final tree: **PASS**.

Important new coverage includes:

- physical relay state remains independent of logical state;
- physical modes survive as permanent-power policy;
- binding-intent state is independent, persisted and initialized deterministically;
- intent advances only after an accepted command with a matching binding;
- no binding / send failure does not fake a target-state change;
- Toggle, explicit On/Off, smart sync/opposite and Move/Stop semantics;
- external binding-intent reconciliation emits no direct-binding command;
- LED source values preserve existing ABI 0/1/2 and append:
  - `3 = Physical output`
  - `4 = Binding status`;
- live v4 canonical NVM → v5 initializes only new binding-intent slots while preserving:
  - canonical device config,
  - migration marker,
  - all three permanent-power policies,
  - LEFT/MIDDLE indicator migration safety;
- chunked device_config transaction rejects incomplete chunks, bad CRC and invalid input;
- BSEED release build enables a second firmware-side board topology guard.

### Repository lint exception

The umbrella workflow is red only because these pre-existing Silicon Labs vendor files are not idempotent under the repository's installed uncrustify:

- `src/silabs/spiflash_extension/spiflash/btl_storage_spiflash.c`
- `src/silabs/spiflash_extension/spiflash/btl_storage_spiflash_configs.h`

All supervisor-changed C/H surfaces are formatter-clean. These vendor files are outside the Telink BSEED v5 change and must **not** be churned to cosmetically green the workflow.

## Z2M overlay acceptance

Frozen overlay commit: `eaba4ceca...`.

Exact installed-package validation:

- ZHC: `26.90.0`
- run: `33683419338`
- result: **PASS**

The probe verifies:

- exact v5 fingerprint only;
- current v4 and recovery identities do not match the v5 overlay;
- processed exposes load successfully;
- no bind/unbind/configureReporting/write/command mutation during configure;
- custom Basic command extension registers locally;
- historical action API remains present;
- v4 + v5 overlay coexistence is deterministic;
- protected long device_config transport works byte-exactly;
- direct full-attribute write is not used.

## Final UX contract

The v5 page uses self-identifying user labels such as:

- Left / Middle / Right — Logical state
- Left / Middle / Right — Mains power
- Left / Middle / Right — Button type
- Left / Middle / Right — Direct-binding command
- Left / Middle / Right — Update local state
- Left / Middle / Right — Control bound light
- Left / Middle / Right — LED shows
- Left / Middle / Right — Bound light (tracked)

Human-readable values replace implementation tokens.

### Advanced editing

Advanced controls are deliberately last.

The raw hardware value remains readable as:

**Advanced — Hardware configuration**

Editing is functionally locked by default.

The user must first press:

**Advanced — Enable editing**

WindFront source confirms that the one-value SET enum used here renders as a real button.

Safety behavior:

1. Unlock is per-device.
2. Unlock lasts 60 seconds.
3. Pressing unlock emits no Zigbee command.
4. Locked save emits no Zigbee command.
5. Validation occurs before transport.
6. One valid save attempt consumes the unlock before the first Zigbee command.
7. A transport failure requires another explicit click.
8. Expired unlock rejects before transport.
9. Zigbee2MQTT restart clears all unlocks.
10. Full configuration uses 24-byte staged Basic-cluster commands plus CRC commit, never the old oversized write.

Converter preflight validates:

- exact manufacturer/model;
- exactly one network LED;
- exactly three switch inputs;
- exactly three relay outputs;
- exactly three channel LEDs;
- required momentary marker;
- pin syntax;
- no duplicate GPIO use;
- known safe advanced Romasku tokens `D<digits>` and `SLP`.

Firmware repeats the board guard before replacing NVM.

A syntactically valid but intentionally changed pin map is still an advanced operation and can require recovery; therefore a real valid write remains operator-gated.

## HA v2 acceptance

Frozen HA commit: `68972efd4b1feb2eb16c3e98c7174c0c36efa65f`.

Validation run `33683734622`: **PASS**.

- dedicated MainDimmer v5 contract tests: PASS;
- real Home Assistant `check_config`: PASS.

The automation is fail-closed unless:

- all three Mains power selectors = `Always on`; and
- all three LED selectors advertise `Binding status`.

It mirrors actual smart-light states into both logical channel state and binding-intent state.

The manual finalizer:

`main_dimmer_finalize_v5_indicators`

requires operator continuity confirmation, seeds actual target state first, and only then selects `Binding status`.

## Live boundaries

At this evidence point:

- v5 overlay is **not** live;
- v5 firmware is **not** flashed;
- HA v2 is **not** live;
- no valid device_config round-trip write is authorized yet;
- no bind/group mutation is part of this release;
- no interview/re-pair/coordinator mutation is part of this release.

The next activity is the controlled live canary protocol documented by the Supervisor on issue #8.
