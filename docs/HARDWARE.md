# Hardware facts and required mapping

## Target

- Stock manufacturer: `_TZ3000_b28wrpvx`
- Model: `TS011F`
- Project name: `TS011F-BS-PM`
- Zigbee module: Tuya ZTU / TLSR8258-class
- Metering IC: Belling BL0937

## BL0937 digital interface

| Signal | Pin | Direction | Meaning |
|---|---:|---|---|
| VDD | 1 | supply | meter IC supply |
| IP | 2 | analog | current sense input |
| IN | 3 | analog | current sense input |
| VP | 4 | analog | voltage sense input |
| GND | 5 | reference | local reference |
| CF | 6 | output | active-power / energy pulse |
| CF1 | 7 | output | multiplexed current/voltage pulse |
| SEL | 8 | input | selects CF1 current vs voltage |

According to the BL0937 datasheet, `SEL=0` selects RMS current on CF1 and `SEL=1` selects RMS voltage.

## Required technician result

The first hardware issue must return exactly:

```text
DEVICE_ID:
PCB_FRONT_MARKING:
PCB_REAR_MARKING:
ZTU_MARKING:
ALL_EVIDENCE_FROM_SAME_SOCKET: YES/NO

CF:
  BL0937_PIN: 6
  ZTU_PHYSICAL_PIN:
  TELINK_GPIO:
  RESISTANCE_OHMS:
  INTERMEDIATE_COMPONENTS:
  EVIDENCE_PHOTO:

CF1:
  BL0937_PIN: 7
  ZTU_PHYSICAL_PIN:
  TELINK_GPIO:
  RESISTANCE_OHMS:
  INTERMEDIATE_COMPONENTS:
  EVIDENCE_PHOTO:

SEL:
  BL0937_PIN: 8
  ZTU_PHYSICAL_PIN:
  TELINK_GPIO:
  RESISTANCE_OHMS:
  INTERMEDIATE_COMPONENTS:
  EVIDENCE_PHOTO:
```

No candidate lists. If routing cannot be determined confidently, report UNKNOWN/BLOCKED.

## Recommended component inventory

When easy to identify while unpowered:

- shunt marking/reference;
- voltage-divider high-side resistor chain to VP;
- VP low-side resistor;
- IP/IN resistor/filter network;
- CF/CF1/SEL series resistors;
- ZTU programming pads (`SWS`, `RST`, `3V3`, `GND`).

These are helpful for theoretical sanity checks but final calibration remains empirical.