# V1 UX REPORT — BSEED TS0726 v4 overlay (e933e352) — 2026-09-02

**Result: PASS**

Method: converter candidate processed by the ACTUAL installed
zigbee-herdsman-converters **26.90.0** inside the running Z2M add-on container
(`app_45df7312_zigbee2mqtt`, Z2M 2.13.0). Candidate staged only under
`/tmp/bseed-v4-probe-r2/` (never `/config/zigbee2mqtt/external_converters/`),
no deployment, no restart, removed after capture. Evidence:
`v1/installed-zhc-probe.json` (status PASS) and `v1/exposes-full.json`
(complete ordered capture, 49 exposes, produced by the evidence-only
`exposes_full_wrapper.js`).

Candidate: `zigbee2mqtt/converters/bseed_ts0726_v4.js` @ `e933e352`, canonical
LF, sha256 `d5b276dd967541e261e51606fdbf1e5412d55b7b660b8559d930e000eda04fa2`,
15678 bytes. Target definition: `EC-GL86ZPCS31` (exactly one), fingerprint
`iedhxgyi / TS0726-3-BS / 1.1.4-bseedv4 / priority 100`, `zigbeeModel []`.

## Per-item gate

| UX gate item | result | evidence |
|---|---|---|
| Six named endpoints | **PASS** | `relay_left`, `relay_middle`, `relay_right`, `switch_left`, `switch_middle`, `switch_right` (all expose records carry an endpoint; 6 distinct) |
| Left/Middle/Right logical relay states | **PASS** | 3 switch controls at endpoints relay_left/middle/right with feature `state` label **"Logical relay state"**, property `state_relay_left/middle/right`, description "does not necessarily switch mains power" |
| Three physical-behavior selects | **PASS** | `relay_{left,middle,right}_physical_mode`, label **"Physical relay behavior"**, category `config`, per-endpoint |
| values follow_state/always_on/always_off | **PASS** | each physical select values `["follow_state","always_on","always_off"]` |
| Smart-bulb recommendation and immediate-mains warning | **PASS** | physical-mode description: "recommended for smart bulbs/dimmers" and "Changing this setting can immediately switch mains power" |
| power_on_behavior clearly logical | **PASS** | label **"Logical state after power-up"**; description: "Controls the logical Zigbee relay state after power-up. Physical relay behavior is independent and can keep the electrical output Always on or Always off." values off/on/toggle/previous |
| Readable button labels | **PASS** | "Button type", "Button command behavior", "Local relay trigger", "Assigned local relay", "Bound-device trigger", "Long-press threshold", "Hold dimming speed", "Last button action", "Network indicator", "Factory-reset press count" |
| relay_1/2/3 explained as Left/Middle/Right | **PASS** | "Assigned local relay" description: "relay_1 = Left, relay_2 = Middle, relay_3 = Right" (all three channels) |
| Indicators panel-LED-only on canonical v4 | **PASS** | "Indicator LED behavior" description: "On v4 canonical firmware this controls only the panel LED, never the mains relay."; "Indicator LED state" description: "Manual panel-LED state; used only when Indicator LED behavior is manual." |
| device_config diagnostic + STATE_GET/read-only + advanced/last | **PASS** | `device_config_switch_left`: label "Advanced hardware configuration (read-only)", category `diagnostic`, access `5` (STATE_GET\|STATE_REPORT), **last** expose in the capture (order 48 of 49) |
| Historical aggregate and per-button actions present | **PASS** | aggregate `action` with full 32-value switch_0/1/2 set (incl. press/long_press/toggle/brightness_*) AND per-endpoint `action_switch_left/middle/right` |
| No duplicate/cryptic replacement controls | **PASS** | no duplicate property names across all 49 exposes; no label matching custom/unknown/mystery/TODO |

## Installed-ZHC probe highlights (status PASS)

bindCount 0 · configureReportingCount 0 · writeCount 0 · commandCount 0 ·
deviceSaveCount 0 · readCount 36 · mutationCount 0 · installedZhc 26.90.0
(`/app/node_modules/.pnpm/zigbee-herdsman-converters@26.90.0/...`).

## Note

Rendered browser-level Z2M device-page inspection is a later protected step
(the supervisor's "REAL rendered Z2M device-page UX inspection BEFORE firmware
OTA"), not part of this archive.
