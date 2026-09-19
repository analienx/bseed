# Draft upstream message — Romasku / PR #314

Status: prepared for Supervisor review; do not post automatically.

We completed a two-device validation of the `_TZ3000_b28wrpvx` BSEED PM socket family using the existing Romasku/Telink architecture and the downstream BL0937 pulse-meter implementation.

- Two independent assembled devices identify as `b28wrpvx / TS011F-BS-PM` routers and preserve the existing BSEED runtime configuration.
- Unit 1 completed the custom-to-custom canary, recovery/OTA health checks, Shelly-referenced V/I/P calibration, PF/reactive-power reconciliation, no-load zero validation, and repeated autonomous power-overload relay trips.
- Unit 2 completed a direct factory-Tuya to custom migration using the Romasku-style `from_tuya` OTA envelope. The migration wrapper uses manufacturer `4417`, the stock image type `54179`, and outer version `0xffffffff`; its Telink payload is byte-identical to the validated custom payload.
- Both devices report zero current and zero active power with the relay off. Unit 2 independently demonstrated native PM exposes and a device-specific calibration readback, without copying Unit 1 calibration values.
- Both devices have independent protection evidence. Unit 2 measured approximately 2.0 kW kettle load, tripped autonomously on a temporary 1000 W threshold with a `power` alarm, and restored its original settings exactly.
- The proven hardware mapping is BL0937 CF=`PA1`, CF1=`PC2`, SEL=`PB1` on TLSR8258.
- Calibration remains per-device runtime state; generic firmware does not embed Unit 1's calibration constants or the no-load Shelly voltage offset.

For stock migration, the build must emit normal, forced, and `from_tuya` wrappers from the same Telink binary. The CI checks the identities `4417/43556` (normal and forced), `4417/54179` (from_tuya), forced versions where applicable, CRC/config validity, and byte-identical inner Telink payloads.

Dedicated second-unit power-cycle persistence, a second simultaneous Shelly calibration window, and separate human button/LED observation were deliberately left as non-blocking follow-ups under the minimum-repetition decision. No private identifiers, credentials, or local network details are included here.
