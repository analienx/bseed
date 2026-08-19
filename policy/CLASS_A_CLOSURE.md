# Class A closure policy

Status: **MANDATORY BEFORE ANY EXPERIMENTAL OTA**

Class A facts are facts whose wrong value could cause unsafe GPIO drive, wrong-target firmware, loss of OTA/recovery, or hardware damage. Class A facts are not allowed to remain hypotheses during firmware experimentation.

A Class A item may be in one of these states:

- `SOURCE_CONFIRMED` — proven from pinned upstream/official documentation, but not yet verified on the exact canary;
- `PHOTO_CONFIRMED` — visible in existing photographs, but not yet tied to the exact selected canary/revision;
- `DEVICE_CONFIRMED` — verified on the exact selected physical canary;
- `RECOVERY_PROVEN` — exercised successfully on the exact canary;
- `BLOCKING_UNKNOWN` — firmware experimentation is prohibited.

The firmware-development gate opens only when every required hardware item is `DEVICE_CONFIRMED` and every recovery item is `RECOVERY_PROVEN`.

## A. Already source-confirmed invariants

These do not need to be rediscovered experimentally, but the exact canary must still match them before flashing:

| ID | Fact | Current state |
|---|---|---|
| A-S01 | Target board profile is `WALL_OUTLET_BSEED_TS011F_PM` | SOURCE_CONFIRMED |
| A-S02 | Custom Zigbee identity is `b28wrpvx` / `TS011F-BS-PM` | SOURCE_CONFIRMED |
| A-S03 | Target MCU/module family is ZTU / Telink TLSR8258 | SOURCE_CONFIRMED |
| A-S04 | Device role is router | SOURCE_CONFIRMED |
| A-S05 | Frozen base config is `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` | SOURCE_CONFIRMED |
| A-S06 | Existing frozen GPIOs: relay `D2`, button `B5`, status LED `C3`, indicator `B4` | SOURCE_CONFIRMED |
| A-S07 | OTA manufacturer/image type is `4417 / 43556` | SOURCE_CONFIRMED |
| A-S08 | Telink OTA slot limit is `0x40000` in the pinned upstream scheme | SOURCE_CONFIRMED |
| A-S09 | Telink early boot/OTA relocation and recovery-critical source surfaces are frozen | SOURCE_CONFIRMED + MACHINE_ENFORCED |

## B. Hardware Class A — must close in issue #3

These are currently not fully known on the exact canary and are blocking until verified.

| ID | Required fact | Required evidence | Current state |
|---|---|---|---|
| A-H01 | One exact physical canary and PCB revision | labeled device ID, PCB front/rear markings, all photos from same socket | BLOCKING_UNKNOWN |
| A-H02 | Exact current runtime identity/config/role on that canary | sanitized Zigbee2MQTT export showing manufacturer/model/build/config/router state | BLOCKING_UNKNOWN |
| A-H03 | BL0937 identity and pin-1 orientation on that canary | macro photo with pin 1 marked | PHOTO_CONFIRMED globally; DEVICE confirmation pending |
| A-H04 | BL0937 VDD pin 1 reaches ZTU/local 3.3-V logic rail | unpowered continuity/resistance trace | BLOCKING_UNKNOWN |
| A-H05 | BL0937 GND pin 5 reaches ZTU/local logic ground | unpowered continuity/resistance trace | BLOCKING_UNKNOWN |
| A-H06 | CF pin 6 complete path | exact ZTU physical pin, exact TLSR8258 GPIO, path resistance, intermediate topology | BLOCKING_UNKNOWN |
| A-H07 | CF1 pin 7 complete path | exact ZTU physical pin, exact TLSR8258 GPIO, path resistance, intermediate topology | BLOCKING_UNKNOWN |
| A-H08 | SEL pin 8 complete path | exact ZTU physical pin, exact TLSR8258 GPIO, path resistance, intermediate topology | BLOCKING_UNKNOWN |
| A-H09 | CF/CF1 input topology is understood | direct/resistor-only vs active/inverting circuitry documented | BLOCKING_UNKNOWN |
| A-H10 | SEL output topology is understood | direct/passive vs transistor/inverter/level-shifter path documented | BLOCKING_UNKNOWN |
| A-H11 | No PM GPIO collision with frozen socket GPIOs | explicit comparison against `D2/B5/C3/B4` | BLOCKING_UNKNOWN until A-H06..08 close |
| A-H12 | No PM GPIO collision with recovery/power pins | explicit comparison against ZTU SWS/RST/3V3/GND | BLOCKING_UNKNOWN until A-H06..08 close |
| A-H13 | Exact physical SWS/RST/3V3/GND points on same canary are identified | annotated unpowered photo/trace | BLOCKING_UNKNOWN |
| A-H14 | One annotated board map ties all above together | one or more annotated high-resolution images with BL0937/ZTU orientation and signal routes | BLOCKING_UNKNOWN |

### Hardware closure rule

Issue #3 cannot report PASS unless A-H01 through A-H14 are all `DEVICE_CONFIRMED`.

If a signal passes through an active component, that is not a failure; it must simply be documented exactly so the firmware can model the real board safely.

No energized open-PCB measurement is required or allowed to close these items.

## C. Recovery Class A — must close in issue #5

These are dangerous to assume and must be empirically proven while the canary is still known-good.

| ID | Required fact | Required evidence | Current state |
|---|---|---|---|
| A-R01 | Exact known-good FORCE/reinstall OTA artifact exists locally | parsed artifact + SHA-256 + exact target identity | BLOCKING_UNKNOWN |
| A-R02 | Exact LKG FORCE artifact is accepted by this canary | known-good -> same known-good reinstall drill | BLOCKING_UNKNOWN |
| A-R03 | OTA remains live after LKG self-reinstall | post-reinstall OTA check + normal device baseline | BLOCKING_UNKNOWN |
| A-R04 | SWS readback works on this exact canary | unpowered programmer readback evidence | BLOCKING_UNKNOWN |
| A-R05 | Full flash can be backed up reproducibly | full intended flash read + SHA-256 + second stable read/hash | BLOCKING_UNKNOWN |
| A-R06 | Recovery wiring points are correct in practice | successful unpowered 3V3/GND/SWS(/RST) communication | BLOCKING_UNKNOWN |
| A-R07 | Final reassembled known-good state remains healthy | rejoin + relay/button/LED + OTA after backup/readback procedure | BLOCKING_UNKNOWN |

### Recovery closure rule

No experimental firmware may be flashed until A-R01 through A-R07 are `RECOVERY_PROVEN`.

## D. Things intentionally NOT Class A

These are safe to discover with the sandboxed diagnostic firmware once Class A is closed:

- CF/CF1 rising vs falling edge preference;
- pulse frequency/period at different loads;
- timer/counter sampling windows;
- low-load timeout/filtering;
- SEL logical interpretation/measurement cadence after the physical SEL path is known;
- voltage/current/power calibration coefficients;
- zero thresholds;
- reporting intervals;
- raw-to-engineering-unit conversion behavior;
- cumulative-energy calibration;
- noncritical diagnostic formatting.

These are Class B runtime/empirical variables and should be volatile during discovery rather than requiring repeated firmware rebuilds.

## E. Closure invariant

Before P2 `PIPELINE_NOOP` or any later experimental candidate, the Supervisor must be able to state:

```text
CLASS_A_HARDWARE = PASS
CLASS_A_RECOVERY = PASS
CLASS_A_UNKNOWN_COUNT = 0
```

Anything else means **DO NOT FLASH**.
