# Project status

Last supervisor bootstrap: **2026-08-18**.

## Goal

Add reliable BL0937-based power monitoring to BSEED `_TZ3000_b28wrpvx` / `TS011F-BS-PM` while preserving normal socket behavior and OTA recovery.

Target user-visible measurements:

- RMS voltage;
- RMS current;
- active power;
- cumulative imported energy;
- standard Zigbee reporting usable by Zigbee2MQTT/Home Assistant.

## Source-confirmed upstream state

Pinned upstream main at bootstrap:

```text
romasku/tuya-zigbee-switch
bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702
```

Upstream PR #314 at bootstrap:

```text
state: open
merged: false
head: 47611b7d9d4b782556392416769fdb24226a8302
base when opened/current PR metadata: 8234061fd095d4e37639c4d67146d3392a242151
```

The PR describes itself as the first PR in a PM series. It adds a GPIO pulse-counter API, currently unused by the application; Telink is implemented and Silabs is a no-op. It is therefore a useful foundation, not a complete PM implementation.

## Hardware evidence

From user-supplied PCB photographs:

- Belling `BL0937` metering IC identified;
- current shunt marked `R001`;
- Tuya ZTU/Telink module identified;
- architecture is pulse based, not BL0942/UART based.

BL0937 required interface:

| Signal | BL0937 pin | Role | State |
|---|---:|---|---|
| CF | 6 | active-power / energy pulse output | GPIO mapping UNKNOWN |
| CF1 | 7 | current/voltage pulse output | GPIO mapping UNKNOWN |
| SEL | 8 | selects CF1 quantity | GPIO mapping UNKNOWN |

## Blocking inputs

Before the Supervisor can safely build the first diagnostic firmware:

- [ ] one exact physical test socket selected;
- [ ] exact PCB revision recorded;
- [ ] CF physical ZTU pin + Telink GPIO + path resistance;
- [ ] CF1 physical ZTU pin + Telink GPIO + path resistance;
- [ ] SEL physical ZTU pin + Telink GPIO + path resistance;
- [ ] annotated map photograph;
- [ ] raw Zigbee2MQTT metadata captured/sanitized;
- [ ] custom-to-custom OTA proven or wired SWS recovery proven;
- [ ] current working firmware backup strongly recommended.

## Phase state

`PHASE 0 — HARDWARE FACT COLLECTION` = **ACTIVE**

Do not start calibrated PM implementation yet.

## Next supervisor action after inputs arrive

1. review mapping evidence;
2. promote mapping to `DEVICE_CONFIRMED` only if internally consistent;
3. review/rebase PR #314 against pinned upstream;
4. implement a diagnostic build exposing raw CF/CF1 counts/frequencies and SEL state;
5. issue an assembled-device test task.