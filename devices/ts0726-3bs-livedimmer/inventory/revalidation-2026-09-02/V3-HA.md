# V3 — HA revalidation evidence (2026-09-02)

Executor revalidation per supervisor comment 5500044572. Branch
`analienx/home-assistant-stack` `supervisor/ts0726-post-migration-ha-v1`
@ `8efc5696debdf80b394bd65ff947118f33ac3215` ("Stage operator-gated MainDimmer
indicator finalization").

Validation method: full-tree YAML syntax parse of `home-assistant/` at the
pinned commit (custom HA tags `!include`, `!include_dir_*`, `!input`,
`!secret`, `!env_var` tolerated as placeholders) plus structural proof of the
finalizer script. Reuses the same approach as the prior gate report
(`validation-gates-2026-09-01/GATES-A-D-REPORT.md`, Gate C) but against the
advanced commit. Executor code: `validate_ts0726_ha_finalizer.py` (see tooling
note in report).

## Result: PASS

| # | required fact | result |
|---|---|---|
| 1 | `script.main_dimmer_finalize_v4_indicators` exists | PASS |
| 2 | never called automatically (no reference in any yaml/non-yaml outside scripts.yaml; no automation/blueprint/package reference) | PASS |
| 3 | requires `operator_continuity_confirmed` (required field + condition in sequence) | PASS |
| 4 | requires all 3 physical modes = `always_on` (`select.livingroommaindimmer_relay_{left,middle,right}_physical_mode` state checks in sequence) | PASS |
| 5 | changes only indicator-mode selects to `same` (single `select.select_option` action on the three `..._indicator_mode_...` selects with `option: same`) | PASS |
| 6 | does not change physical mode (no action targets any physical_mode entity) | PASS |
| 7 | does not write `switch.livingroommaindimmer_relay_right` (no switch.* action; script object contains no such entity) | PASS |
| 8 | YAML syntax valid across all `home-assistant/**/*.yaml` at the pinned commit | PASS |

Also verified structurally: `mode: single`, description documents the operator
continuity gate, a 30 s `wait_template` confirms all three indicator selects
reach `same` before success.
