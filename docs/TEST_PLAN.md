# Test plan

## Phase A — hardware mapping

Safety class: `UNPOWERED_PCB`.

Goal: determine CF/CF1/SEL exact ZTU/Telink GPIOs and PCB revision. No firmware change and no energized open-board work.

Acceptance:

- exact mappings, not guesses;
- measured resistance for each path;
- annotated photo;
- all evidence from one device/revision.

## Phase B — software/toolchain baseline

Safety class: `SOFTWARE_READONLY`.

Collect:

- Windows/PowerShell/git/gh/python versions;
- repository ref;
- Zigbee2MQTT version and sanitized device metadata;
- current firmware IDs/OTA metadata;
- recovery capability;
- current firmware dump hash if available.

## Phase C — diagnostic firmware

State change: firmware flash/OTA; requires approval.

Acceptance before powering a test load:

- firmware builds from pinned sources;
- existing relay/button/LED functionality preserved;
- device joins/rejoins;
- OTA remains functional or wired recovery verified;
- diagnostics do not report impossible counter states.

## Phase D — assembled-device raw pulse tests

Safety class: `ASSEMBLED_MAINS`; explicit approval required.

For each point record reference meter values plus raw firmware counters/frequencies.

Initial points:

1. relay OFF, no load;
2. relay ON, no connected load;
3. 40–100 W stable resistive load;
4. 400–600 W stable resistive load;
5. 800–1000 W stable resistive load;
6. optional 5–15 W stable load for low-end behavior.

Do not exceed 1000 W unless separately approved.

## Phase E — calibration

Calculate voltage/current/power coefficients from at least three stable resistive points. Compare coefficient spread. Large non-linearity must be investigated before values are exposed as production measurements.

## Phase F — non-unity PF behavior

Use one stable non-resistive load only after basic calibration. Compare active power and power factor from reference meter. Do not derive power factor at near-zero current.

## Phase G — energy

Prefer at least 0.5 kWh accumulated on a stable load.

Record reference/firmware start and end energy, elapsed time and interruptions.

Repeat persistence cases:

- normal reboot;
- mains interruption;
- OTA update;
- simulated/raw counter wrap if test harness supports it.

## Phase H — final E2E

PASS requires:

- correct voltage/current/power scaling;
- cumulative energy monotonic and within agreed error;
- values visible in Zigbee2MQTT/Home Assistant;
- reporting stable without network spam;
- reboot/OTA persistence;
- relay/button/LED/pairing regression clean;
- recovery path documented and proven.