# Empirical development policy

Status: **MANDATORY**

BL0937 behavior and board-specific calibration will be established primarily by controlled observation on the actual BSEED socket. Offline tests remain mandatory but are only one evidence layer.

## Evidence ladder

Claims progress through:

`UNKNOWN -> HYPOTHESIS -> OFFLINE_VALIDATED -> DEVICE_OBSERVED -> REPEATED -> ACCEPTED`

- `UNKNOWN`: no defensible claim.
- `HYPOTHESIS`: expected behavior stated before the run.
- `OFFLINE_VALIDATED`: software invariants pass simulator/unit/static checks.
- `DEVICE_OBSERVED`: expected signature seen once on the exact target.
- `REPEATED`: reproduced at the same point or across relevant operating points.
- `ACCEPTED`: Supervisor decides evidence is sufficient for production behavior.

A unit test cannot establish a board pinout, BL0937 scaling, low-load threshold, calibration coefficient or real physical behavior.

## Pre-register every experiment

Before a run, define:

- experiment ID;
- candidate ID/hash;
- target device ID;
- evidence state before run;
- exact hypothesis;
- stimulus;
- baseline/control;
- observables;
- expected signature;
- duration/sample count;
- PASS criteria;
- FAIL criteria;
- INCONCLUSIVE criteria;
- abort conditions;
- permitted load envelope;
- mutation/flash requirement;
- rollback reference.

Do not rewrite the hypothesis after seeing the result.

## Prefer differential A/B observation

Where practical compare the same physical device/reference setup under:

- known-good vs candidate;
- PM disabled vs enabled;
- no load vs known load;
- SEL=0 vs SEL=1;
- repeated same-load measurements;
- before vs after reboot;
- before vs after OTA rollback round trip.

## Raw-first instrumentation

Discovery logs retain raw quantities as well as derived values:

- monotonic timestamp and uptime;
- reset/boot count;
- relay state;
- PM enabled/safe-mode state;
- CF absolute count/delta/period/frequency;
- CF1 absolute count/delta/period/frequency;
- SEL state;
- sample interval;
- timeout/overflow flags;
- Zigbee health/report state where available;
- external reference voltage/current/active power/PF;
- load description.

Derived voltage/current/power must never replace raw pulse evidence during calibration.

## Staged stimuli

All energized observation uses a fully reassembled socket and ordinary plug-in loads.

Sequence:

1. no load;
2. small stable resistive load;
3. medium stable resistive load only after small-load behavior is sane;
4. higher load only after explicit Supervisor approval;
5. non-unity-PF load only after resistive behavior is understood.

Never exceed the lowest rating in the socket/circuit/reference-meter/accessory/load path. This project does not authorize improvised mains wiring.

## Repetition for calibration

At minimum:

- multiple load points;
- repeated samples at each included point;
- post-reboot repeat;
- post-OTA repeat before release;
- one non-resistive load for behavior validation.

## INCONCLUSIVE is a valid result

Return `INCONCLUSIVE` rather than force PASS/FAIL when the load is unstable, reference resolution is inadequate, too few pulses occur, reporting drops samples, SEL transition timing contaminates samples, mapping is ambiguous or environmental state changed.

The Supervisor then improves instrumentation or experiment design instead of changing the facts.

## One variable at a time

Do not combine new GPIO mapping + calibration + persistence, OTA/recovery changes + PM behavior, multiple unknown timing changes, or persistence layout + reporting changes in one empirical leap.

## Release evidence

Production acceptance requires repeated evidence for physical assumptions, understood calibration residuals over the intended range, stable no-load/low-load behavior, reboot/OTA repeatability, correct energy persistence, no regression in relay/button/LED/Zigbee/OTA, and a still-proven rollback path.
