# Electrical and device safety

## Core rule

> **Open PCB = no mains. Mains = enclosure fully closed.**

This project deals with a mains-powered smart socket. The low-voltage-looking logic area must not be assumed galvanically isolated from mains.

## Safety classes

### S0 — SOFTWARE_READONLY

Examples: repository inspection, logs, hashes, Zigbee metadata, static firmware analysis.

Executor may batch these when the issue allows it.

### S1 — UNPOWERED_PCB

Examples: photographs, continuity/resistance mapping, visual component identification.

Requirements:

1. human physically unplugs the socket from the wall;
2. disconnect every load and programmer;
3. no external supply connected to the PCB;
4. human explicitly confirms the device is unpowered before touching probes;
5. resistance/continuity only unless a later issue defines another unpowered measurement.

The Executor provides exact endpoints to measure and records results. It does not improvise alternative probe points.

### S2 — ASSEMBLED_MAINS

Examples: calibration with a lamp/heater using a plug-in reference meter.

Requirements:

1. enclosure fully reassembled and mechanically closed;
2. no PCB/test pads accessible;
3. external reference meter between wall and BSEED socket;
4. load known and within the Supervisor-approved wattage;
5. load, cable, plug and reference meter undamaged;
6. one adult present and able to disconnect power immediately;
7. stop immediately for unusual heat, odor, sound, smoke, discoloration, relay chatter, reboot loops or anomalous current.

S2 always requires an explicit PROPOSAL/APPROVED cycle.

### S3 — ENERGIZED_OPEN_PCB

**FORBIDDEN.**

Do not:

- energize the opened socket;
- probe it while connected to mains;
- connect a scope/logic analyser/USB programmer/laptop to an exposed mains-powered board;
- defeat fuses/protection/relay/isolation gaps;
- perform live waveform capture.

If an implementation appears to require S3, redesign the diagnostic firmware instead.

## Initial load limits

For first calibration phases, default to stable loads approximately:

- 5–15 W only if a suitable stable load exists;
- 40–100 W;
- 400–600 W;
- 800–1000 W.

Do **not** use >1000 W until the device label/rating, reference meter rating and test setup are documented and the Supervisor separately approves the higher test.

Prefer a stable resistive heater/lamp over a kettle whose thermostat and heating cycle may complicate calibration.

## Stop conditions

Any of the following => disconnect power if safe, post `BLOCKED`, do not retry:

- unexpected current or power;
- device or reference meter becomes hot beyond normal expectation;
- smell, smoke or discoloration;
- relay chatter;
- socket repeatedly resets;
- breaker/RCD trips;
- firmware loses recovery path;
- human is uncertain whether the board is unpowered;
- requested action conflicts with this file.