# `TS0726-3-BS` LivingRoomMainDimmer — BSEED device subproject

Isolated subproject of [`analienx/bseed`](https://github.com/analienx/bseed). It shares the
vendor name with the root project's `_TZ3000_b28wrpvx` / `TS011F-BS-PM` BL0937
power-monitoring socket campaign but **is not part of it**: different silicon, different
`image_type` (`45577` vs `43556`), different OTA identity, different recovery surface,
different control ledger. The root `.supervisor/project.yaml` is deliberately not widened.

Control ledger: **<https://github.com/analienx/bseed/issues/8>**
(migrated from `analienx/home-assistant-stack#39`; that issue's full history is linked from
the migration index and remains readable).

Operating model: `analienx/config:skills/supervisor-executor/SKILL.md`.

## Layout

```text
.supervisor/project.yaml   machine-readable invariants, device identity, five flash
                           preconditions, forbidden actions, authorized autonomy
README.md                  this file
STATUS.md                  live device state, bind-table usage, open items
docs/
  LR_MAINDIMMER_SWAPPED_PINS.md
                           the intentional relay/indicator pin swap and seven binding
                           safety invariants, each cited to installed-firmware source
inventory/manual/
  livingroommaindimmer-swapped-pins/
    README.md              provenance and sanitisation of the capture
    attrs-and-binds.json   sanitized point-in-time device capture
```

## What lives where

| Concern | Owner |
|---|---|
| Requirements, safety rules, evidence, artifacts, campaign state | this subproject |
| Firmware source (`physical_mode`, migration, revert image) | [`analienx/tuya-zigbee-switch` PR #1](https://github.com/analienx/tuya-zigbee-switch/pull/1) — **never vendored here** |
| HA declarative behaviour (automations, dashboard, scenes) | `analienx/home-assistant-stack` |
| Mesh-wide stale-coordinator bind migration | `home-assistant-stack#41` |
| Ember routing / network-state incident | `home-assistant-stack#43` |

## Read this before touching the device

`docs/LR_MAINDIMMER_SWAPPED_PINS.md`. In short:

- LEFT and MIDDLE are **deliberately** wired with the relay and indicator pins swapped
  relative to upstream. It looks like a misconfiguration next to `device_db.yaml`. It is not.
- Under that swap the pin Z2M calls an *indicator* **is** the mains relay GPIO.
- Therefore `relay_mode = detached` and `indicator_mode != manual` can each drop mains on a
  button press or on inbound group traffic. Both are prohibited.
- An attribute reading `ON` is not proof the contact is energised.

## Gate

Five preconditions in the manifest — converter determinism, converter regenerated and
deployed with `relay_*_physical_mode` proven reachable, firmware-side one-shot config
migration, a purpose-built revert recovery image, and bind-table capacity recovery — **must all
be green before any flash**. Firmware campaign fast path is disabled for this subproject until
then.
