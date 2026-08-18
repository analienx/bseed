# BSEED power-monitoring firmware project

Supervisor/executor workspace for implementing reliable BL0937 power monitoring for the BSEED Zigbee socket identified as `_TZ3000_b28wrpvx` / `TS011F-BS-PM`, based on `romasku/tuya-zigbee-switch`.

The repository uses the Supervisor ↔ Executor operating model from `analienx/config:skills/supervisor-executor/SKILL.md`.

The full project structure, safety rules, executor procedures, firmware architecture, test schemas and control-channel workflow are introduced through the bootstrap supervisor PR.
