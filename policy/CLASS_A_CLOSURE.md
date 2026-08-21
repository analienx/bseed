# Class A closure policy

Status: **MANDATORY FOR GENERAL EXPERIMENTAL OTA; ONE NARROW FIRST-CONFIRMATION EXCEPTION EXISTS**

Class A facts are facts whose wrong value could cause unsafe GPIO drive, wrong-target firmware, loss of OTA/recovery, or hardware damage. They are not allowed to remain unbounded guesses during firmware experimentation.

A Class A item may be in one of these states:

- `SOURCE_CONFIRMED` — proven from pinned upstream/downstream/official documentation;
- `PHOTO_CONFIRMED` — visible in existing photographs;
- `DEVICE_FUNCTIONALLY_CONFIRMED` — demonstrated on the exact assembled canary through bounded black-box behavior;
- `DEVICE_PHYSICALLY_CONFIRMED` — traced/verified directly on the exact unpowered canary;
- `RECOVERY_PROVEN` — exercised successfully on the exact canary;
- `BLOCKING_UNKNOWN` — the relevant mutation is prohibited.

The normal firmware-development gate opens only when the dangerous hardware identity/mapping is confirmed on the exact canary (functionally or physically as defined below) and all recovery items are `RECOVERY_PROVEN`.

## A. Already source-confirmed invariants

These do not need to be rediscovered experimentally; the exact canary must match the identity before flashing:

| ID | Fact | State |
|---|---|---|
| A-S01 | Target board profile is `WALL_OUTLET_BSEED_TS011F_PM` | SOURCE_CONFIRMED |
| A-S02 | Custom Zigbee identity is `b28wrpvx` / `TS011F-BS-PM` | SOURCE_CONFIRMED |
| A-S03 | Target MCU/module family is ZTU / Telink TLSR8258 | SOURCE_CONFIRMED |
| A-S04 | Device role is router | SOURCE_CONFIRMED |
| A-S05 | Frozen base config is `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` | SOURCE_CONFIRMED |
| A-S06 | Existing frozen GPIOs: relay `D2`, button `B5`, status LED `C3`, indicator `B4` | SOURCE_CONFIRMED |
| A-S07 | OTA manufacturer/image type is `4417 / 43556` | SOURCE_CONFIRMED |
| A-S08 | Telink OTA slot limit is `0x40000` in the pinned scheme | SOURCE_CONFIRMED |
| A-S09 | Telink early boot/OTA relocation and recovery-critical source surfaces are frozen | SOURCE_CONFIRMED + MACHINE_ENFORCED |
| A-S10 | `_TZ3000_b28wrpvx` PM mapping is hardware-verified downstream: `CF=PA1`, `CF1=PC2`, `SEL=PB1` | SOURCE_CONFIRMED |

## B. Exact-canary hardware confirmation

The old policy required every signal path/resistance to be re-traced before any test. That is unnecessarily duplicative now that the exact downstream implementation records a hardware-verified mapping and the project already has BL0937/ZTU PCB evidence.

Two closure methods are therefore valid.

### B1 — physical confirmation

Unpowered continuity/resistance/annotated PCB tracing may still be used. No energized open-PCB probing is allowed.

### B2 — automated functional confirmation (preferred)

The exact assembled canary may close the three PM mapping facts through `scripts/automated_canary_validation.py` + `scripts/functional_confirmation_gate.py` when all of the following are true:

1. exact runtime identity/config/role matches the frozen BSEED profile;
2. the candidate is built from the pinned adopted metering implementation and exact reviewed overlay;
3. Recovery Class A is already fully `RECOVERY_PROVEN` on the same canary;
4. the first confirmation OTA passed `scripts/confirmation_preflash_gate.py` and received an explicit `APPROVED / OTA-CANARY` for the exact artifact/hash/device;
5. the load is disconnected during OTA;
6. after normal boot/Zigbee/OTA health checks, a known resistive test load of at most 150 W is connected with the enclosure closed;
7. at least three automated OFF/ON cycles pass all current/power/voltage/energy/repeatability/safety checks;
8. the final relay state is confirmed OFF;
9. no device-config write, calibration write, factory reset or additional OTA is performed by the validation harness.

A PASS functionally confirms the source mapping on the exact canary:

```text
CF  = PA1
CF1 = PC2
SEL = PB1
```

Why this is sufficient: repeated load steps independently exercise active-power behavior, load-dependent current behavior and load-independent mains-voltage behavior. With the pinned hardware-verified source map, a clean repeated result confirms the exact canary behaves according to that mapping. If voltage/current are swapped, power does not track load, measurements are implausible, the device becomes stale/unreachable, or behavior is not repeatable, the gate fails.

Functional confirmation does **not** claim a detailed schematic/resistor topology. That topology is useful documentation but is no longer required to safely implement the already hardware-proven driver.

## C. First-confirmation OTA exception

There is one intentional exception to “hardware Class A must be closed before OTA”: the OTA whose sole purpose is to close the mapping by automated black-box testing.

It is allowed only through:

```text
scripts/confirmation_preflash_gate.py
```

This is narrower than the normal preflash gate. It requires Recovery Class A PASS first and only accepts:

- exact `b28wrpvx / TS011F-BS-PM` router/TLSR8258 identity;
- frozen runtime config;
- exact source mapping PA1/PC2/PB1;
- adopted metering candidate gate PASS;
- LKG self-reinstall PASS;
- post-reinstall OTA liveness PASS;
- relay/button/LED/network/OTA baseline healthy;
- enclosure closed;
- relay OFF and load disconnected during OTA;
- automations/automatic/bulk OTA disabled;
- stable mains/link;
- device-config writes and factory reset prohibited;
- post-OTA test plan limited to a <=150 W resistive load and >=3 automated cycles.

A PASS means only `ELIGIBLE_FOR_APPROVED_OTA_CONFIRMATION`. It does not authorize fleet rollout or later experiments.

## D. Recovery Class A — issue #5

These remain dangerous to assume and must be empirically proven while the canary is still known-good:

| ID | Required fact | Required evidence |
|---|---|---|
| A-R01 | Exact known-good FORCE/reinstall OTA artifact exists locally | parsed artifact + SHA-256 + exact target identity |
| A-R02 | Exact LKG FORCE artifact is accepted by this canary | known-good -> same-known-good reinstall drill |
| A-R03 | OTA remains live after LKG self-reinstall | post-reinstall OTA check + normal device baseline |

### Recovery closure rule

No first-confirmation OTA or later experimental firmware may be flashed until A-R01 through A-R03 are `RECOVERY_PROVEN`. SWS is emergency-only if OTA recovery is actually unavailable.

## E. Things intentionally NOT Class A

These remain Class-B runtime variables:

- exact calibration coefficients after starting defaults;
- low-load filtering/thresholds;
- reporting intervals;
- final energy accuracy;
- non-unity-PF behavior;
- persistence endurance tuning;
- optional overload/PWM behavior;
- noncritical diagnostic formatting.

## F. Closure invariant

Before **general** PM experiments after the first functional confirmation, the Supervisor must be able to state:

```text
CLASS_A_HARDWARE = PASS (FUNCTIONAL or PHYSICAL)
CLASS_A_RECOVERY = PASS
CLASS_A_UNKNOWN_COUNT = 0
```

Before the single first-confirmation OTA, the allowed state is instead:

```text
SOURCE_MAPPING = CONFIRMED
CLASS_A_RECOVERY = PASS
CONFIRMATION_PREFLASH_GATE = PASS
HARDWARE_MAPPING = PENDING_FUNCTIONAL_CONFIRMATION
```

Anything outside these two explicitly defined states means **DO NOT FLASH**.
