# BL0937 calibration method

## Reference equipment

Use an external plug-in reference power meter capable of reporting, at minimum:

- voltage;
- current;
- active power;
- cumulative energy;
- preferably power factor.

Record manufacturer/model and stated accuracy/resolution before relying on it.

## Safety

Calibration is `ASSEMBLED_MAINS` only. The BSEED socket must be fully reassembled. No probe touches the PCB.

## Raw relationships

Initial empirical relationships are treated as:

```text
active_power_W = CF_frequency_Hz * Kp
current_A      = CF1_current_frequency_Hz * Ki
voltage_V      = CF1_voltage_frequency_Hz * Kv
```

The exact implementation may use fixed-point equivalents.

## Calibration points

Preferred stable resistive points:

- low: 40–100 W;
- medium: 400–600 W;
- high: 800–1000 W.

Optional very-low-load point: 5–15 W for timeout/quantisation characterization, not necessarily coefficient fitting.

At each point:

1. allow the load/reference reading to stabilise;
2. record reference V/A/W/PF;
3. capture at least 60–120 s of raw diagnostic data;
4. calculate coefficient for each sample window;
5. compare spread and outliers;
6. retain raw sanitized log plus summary CSV.

## Acceptance logic

Do not average obviously inconsistent points. Investigate first.

Possible causes of spread:

- wrong SEL interpretation;
- insufficient counting interval at low frequency;
- counter loss/reset window;
- incorrect GPIO/pull configuration;
- unstable load;
- reference meter resolution;
- saturation/overflow;
- switching transient included in sample.

## Energy coefficient

Energy should preferably derive from continuously counted CF pulses rather than numerical integration of reported watts. Validate with a long run of at least 0.5 kWh where practical.

## Production precision

Keep internal math higher resolution than the Zigbee presentation units. Use explicit multiplier/divisor attributes rather than silently truncating.