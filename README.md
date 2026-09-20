# BSEED power-monitoring firmware project

Supervisor/executor workspace for implementing reliable BL0937 power monitoring for the BSEED Zigbee socket identified as `_TZ3000_b28wrpvx` / `TS011F-BS-PM`, based on `romasku/tuya-zigbee-switch`.

The repository uses the Supervisor ↔ Executor operating model from `analienx/config:skills/supervisor-executor/SKILL.md`.

The full project structure, safety rules, executor procedures, firmware architecture, test schemas and control-channel workflow are introduced through the bootstrap supervisor PR.

## Canonical Home Assistant diagnostics and Zigbee device identification

For any live Home Assistant access, Zigbee2MQTT NWK/address mapping or route-error investigation, load the **single canonical** [Home Assistant read-only skill](https://github.com/analienx/config/blob/main/skills/home-assistant-readonly/SKILL.md) from `analienx/config` (main). It provides the existing SSH alias, a host-key-verified Paramiko fallback for Windows OpenSSH exit-255 failures, and the reusable `ha_readonly.py` live inventory helper. Keep implementation and credentials in the canonical location; do not copy the helper or SSH settings here. This does not authorize Zigbee firmware flashing, HA mutations or bypass of this repository's own safety/deployment rules.
