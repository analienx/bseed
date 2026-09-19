# Automated canary validation

Status: **FIRST-CANARY FUNCTIONAL CONFIRMATION WORKFLOW**

This workflow converts the source-known `_TZ3000_b28wrpvx` mapping into evidence from the exact assembled canary without energized open-PCB probing.

Source-known mapping under test:

```text
BL0937 CF  -> PA1
BL0937 CF1 -> PC2
BL0937 SEL -> PB1
```

The harness is `scripts/automated_canary_validation.py`; Windows entrypoint is `scripts/run-canary-validation.ps1` and the editable template is `templates/canary-validation.json`.

## What is and is not automated

After one-time physical setup, the runtime test is fully automated:

- MQTT/Zigbee2MQTT health check;
- optional interview/reconfigure after firmware adds metering clusters;
- relay-safe OFF baseline;
- OTA-client health check before functional testing;
- three or more bounded OFF/ON load cycles;
- continuous V/A/W/Wh/LQI evidence collection;
- hard runtime/current/power/time/staleness limits;
- automatic abort on bridge loss, stale device stream, relay-command failure or implausible electrical values;
- best-effort relay OFF on every normal/error exit;
- optional independent MQTT hard-kill output when normal relay control cannot be confirmed;
- repeatability, power-step, current-step, voltage-stability, P/(V*I) and energy-monotonicity analysis;
- second OTA-client health check after the functional cycles;
- machine-readable `summary.json` + chronological `events.jsonl`;
- `functional_confirmation_gate.py` converts only a clean PASS into `DEVICE_FUNCTIONALLY_CONFIRMED`.

The computer cannot physically inspect a cable/load/enclosure. Therefore exactly one setup fact is manual: a human confirms the canary is closed and a known low-power resistive load has been connected for the functional run. Set `load.operator_setup_ack=true` only after that is true.

## Test load

First confirmation deliberately does **not** need a kettle/heater/high load.

Use one stable, known resistive load, preferably about 40–100 W. Hard project maximum for this confirmation is 150 W.

Good examples:

- incandescent/halogen lamp;
- purpose-built low-power resistive load rated for mains.

Do not use for first confirmation:

- kettle;
- space heater;
- motor;
- compressor;
- unknown appliance;
- high-inrush or strongly nonlinear load.

A 40–100 W step is already large enough to distinguish no-load from load current/power while keeping the consequence of an unexpected relay-on event modest.

## Safety modes

### `SAFE_SINGLE_LAYER_LOW_POWER`

Default. The BSEED relay is the safety actuator. The harness always commands/validates OFF before and after each phase and on failure. The test load must remain <=150 W.

### `SAFE_DUAL_LAYER`

Preferred when available. Configure `hard_kill` to an **independent** MQTT-controlled upstream power cut (ideally not dependent on the Zigbee coordinator under test). If the canary cannot be confirmed OFF, the harness publishes the configured safe payload.

The hard-kill path is optional; its absence does not make the bounded low-power run invalid, but the result records which safety mode was actually used.

## First confirmation OTA is a special gate

The normal Class-A hardware gate used to require exact-canary mapping before any OTA, which is circular when the purpose of the first canary is to confirm a hardware-verified source mapping by behavior.

The narrow exception is `scripts/confirmation_preflash_gate.py` and `templates/confirmation-preflash.json`.

It does **not** waive recovery requirements. Before the first confirmation OTA it still requires:

- exact runtime identity/config/role;
- exact source mapping PA1/PC2/PB1;
- adopted metering candidate gate PASS;
- Recovery Class A PASS for the same canary;
- LKG self-reinstall PASS;
- SWS readback/full-flash backup proof;
- enclosure closed;
- relay OFF;
- **load disconnected during OTA**;
- automations disabled;
- automatic/bulk OTA disabled;
- stable power/link;
- device-config writes/factory reset prohibited.

A PASS means only `ELIGIBLE_FOR_APPROVED_OTA_CONFIRMATION`. It is not fleet approval and it is not itself permission to flash; the control issue still needs the explicit supervisor OTA approval for the exact candidate/hash/device.

After the new firmware boots and normal relay/Zigbee/OTA health is checked, connect the approved low-power test load and run the automated functional test.

## Functional logic

Each cycle records stable OFF and ON windows.

The mapping is functionally accepted only when repeated observations show all of the following:

1. OFF current/power are low.
2. ON current/power rise substantially and repeatedly.
3. Voltage remains in a plausible mains range in both states and changes only modestly with load.
4. P/(V*I) is plausible for the declared resistive load.
5. Energy never decreases and, when enough resolution/time is available, increases across the test.
6. Repeated ON power is reasonably consistent.
7. Zigbee2MQTT/device stream remains live.
8. Relay OFF can be confirmed at completion.
9. OTA-client health works both before and after the functional run.

Given the pinned hardware-verified source map, this independent behavior establishes:

- PA1 is behaving as the active-power CF path;
- PC2 is behaving as the multiplexed CF1 measurement path;
- PB1 is successfully selecting the voltage/current behavior rather than producing a swapped/implausible result.

If any criterion fails, the run is `FAIL` or `BLOCKED`, not “close enough”. The harness does not recalibrate, rewrite `device_config`, factory reset, flash another image, or improvise a recovery action.

## One-command Windows use

Copy the template to a local-only file, for example:

```powershell
Copy-Item .\templates\canary-validation.json .\.local\canary-validation.json
```

Edit only the site-specific values:

- MQTT host/port;
- canary `friendly_name`;
- declared load watts;
- `operator_setup_ack` after physical setup;
- optional independent hard-kill topic/payload.

MQTT credentials are environment variables, never committed:

```powershell
$env:BSEED_MQTT_USER = '...'
$env:BSEED_MQTT_PASSWORD = '...'
```

Run:

```powershell
.\scripts\run-canary-validation.ps1 -Config .\.local\canary-validation.json
```

The wrapper creates `.local/validation-venv` and pins `paho-mqtt==2.1.0`.

Results are written under:

```text
.local/canary-validation/<UTC-run-id>/
  events.jsonl
  summary.json
```

Then gate the result:

```powershell
python .\scripts\functional_confirmation_gate.py `
  .\.local\canary-validation\<run-id>\summary.json `
  --json-out .\.local\canary-validation\<run-id>\functional-gate.json
```

Only `status=PASS` / `next_gate=DEVICE_FUNCTIONALLY_CONFIRMED` may be used to close the mapping-confirmation portion of Class A.

## Abort behavior

The harness immediately transitions to safe-off when it observes:

- power above the configured hard test maximum;
- current above the configured hard test maximum;
- relay command/ack timeout;
- Zigbee2MQTT bridge offline;
- stale device state stream;
- total test runtime limit;
- failed cycle-level plausibility.

It attempts relay OFF three times. If that cannot be confirmed and a hard-kill path is configured, it publishes the independent safe payload. It then stops and records the failure. It never continues to the next experiment after a surprise.

## Non-goals

This workflow is for mapping/first-function confirmation, not final accuracy certification. Calibration, low-load characterization, non-unity-PF behavior and long-duration energy/persistence tests are later Class-B validation stages and can reuse the same orchestration framework with different thresholds/durations.
