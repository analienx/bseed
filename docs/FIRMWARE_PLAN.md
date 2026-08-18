# Firmware implementation plan

## Upstream basis

Target upstream is pinned in `upstream.lock.yaml`.

Upstream PR #314 introduces two hardware GPIO counters, enough in principle for BL0937 `CF` and `CF1`. Its own API documentation warns that `hal_gpio_counter_read_and_reset()` stops the counter and may lose pulses during the read/reset window. Therefore cumulative energy should use free-running counts/deltas or another no-loss strategy rather than repeated destructive resets.

## Architecture

### 1. HAL pulse acquisition

Supervisor will review/rebase the useful Telink counter code from PR #314 against pinned upstream.

Requirements:

- two independent counters for CF and CF1;
- monotonic/free-running read where practical;
- correct wrap handling;
- no lost CF pulses during normal sampling;
- emulator/stub support for unit tests;
- existing GPIO behavior unchanged.

If low-load instantaneous accuracy is poor with count deltas, add edge-period/timestamp support or adaptive measurement windows. Do not invent a hardware timer design before testing the existing counter capabilities.

### 2. Generic meter abstraction

Conceptual reading structure:

```c
typedef struct {
    uint32_t voltage_mv;
    uint32_t current_ma;
    int32_t  active_power_mw;
    uint64_t energy_mwh;
    bool voltage_valid;
    bool current_valid;
    bool power_valid;
} power_meter_reading_t;
```

Higher layers must not depend on BL0937-specific GPIO details.

### 3. BL0937 driver

Responsibilities:

- configure CF/CF1 counters;
- control SEL output;
- alternate CF1 current/voltage measurement;
- discard/ignore transition samples after SEL changes;
- compute frequency/count deltas over known elapsed time;
- detect no-pulse timeout;
- reject impossible values;
- expose raw diagnostics during development;
- apply calibrated coefficients only after calibration data exists.

### 4. Diagnostic-only build

First device firmware exposes raw:

```text
CF count / delta / sample interval / frequency
CF1 SEL=0 count / delta / interval / frequency
CF1 SEL=1 count / delta / interval / frequency
SEL state
last pulse age / timeout state
counter wrap diagnostics
validity flags
```

No production-calibrated claims yet.

### 5. Conversion/calibration

Maintain independent coefficients for:

- active power from CF;
- current from CF1 current mode;
- voltage from CF1 voltage mode;
- energy per CF pulse or equivalent integrated scaling.

Use empirical calibration across multiple resistive loads. `docs/CALIBRATION.md` defines the method.

### 6. Zigbee

Preferred standard server clusters:

**Electrical Measurement**
- RMS voltage;
- RMS current;
- active power;
- multiplier/divisor attributes.

**Smart Energy Metering**
- cumulative imported energy;
- unit/multiplier/divisor/formatting metadata.

Keep reporting rate-limited. Internal sampling may be faster than Zigbee reporting.

### 7. Persistence

Requirements:

- 64-bit energy accumulator;
- restore after reboot;
- survive OTA;
- bounded flash write frequency;
- rotating checkpoint records with sequence and integrity check;
- no flash write per pulse;
- explicit handling of counter wrap and restart.

### 8. Regression

Every release candidate must re-test:

- relay on/off;
- physical button;
- LEDs;
- join/rejoin;
- OTA check/update;
- reboot;
- no-load behavior;
- calibrated load behavior;
- cumulative energy persistence.