# Validation gates A–D — executor validation report (2026-09-01)

Validated the four supervisor branches per ruling `5498072424`. The Supervisor owns
all code; this report contains only run evidence. Tooling frozen at
`analienx/bseed:supervisor/full-regression-review-v1` (`0bfb799`).

## Gate A — converter (`supervisor/target-overlay-regression-v1`)

- Overlay tests: 8/8 PASS (generator + overlay + audit unit tests).
- `audit_bseed_ts0726_converter.py` on regenerated output: PASS
  (target fingerprint `iedhxgyi/TS0726-3-BS` ×1, sibling `r2fgo9ks` ×1,
  bare TS0726 matchers 0, zero-direct-binds contract PASS).

## Gate B — firmware (`supervisor/ts0726-redesign-v4` @ `61ba99c0`)

- Migration/transaction tests: 44/44 PASS.
- Full stub suite: 290/290 PASS, 0 failed.
- Forbidden surface audit: no BSEED/migration constants leak into generic paths;
  three-relay `always_on` pre-seed present in the forward transaction.

## Gate C — HA (`supervisor/ts0726-post-migration-ha-v1`, `analienx/home-assistant-stack`)

- Diff vs `origin/main` confined to the intended automations; old 2-automation
  sync replaced by 3-channel reconciliation; Circle dimmer no longer power-cycled.

## Gate D — fleet regression audit (`audit_live_converter_regression.py` @ `0bfb799`)

Run against the frozen `inventory/pre-ota-v3-2026-09-01/` snapshots
(105 devices, before/after F). **Status: FAIL (fails closed, as designed) —
18 findings, all mapping 1:1 onto the REDESIGN_V4 scope:**

| finding class | count | v4 disposition |
|---|---|---|
| non-target API drift | 9 devices | validates the historical+overlay architecture (composite changed fleet devices' API) |
| target `action` removed | 1 | v4 open item: compatibility proof/restore required |
| target UX findings | 8 | v4 UX corrections (labels/descriptions/expose ordering) |

Clean surfaces: device count 105→105, groups equal, definition rematch only the
target (EC-SL-FK86ZPCS31 → EC-GL86ZPCS31, allowed), zero device-state drift,
target enum `all` removal recognized as intentional.

The 9 drifted fleet devices: BedroomDimmer, BedroomSocketBalcony,
BedroomSocketCabinetRight, HallMainSwitchAvatto, LivingRoomSocketWifiLeft,
WRSocketEntrance, WorkRoomMainSwitchDimmer, WorkRoomSwitchLedMain,
WorkroomSocketCabinet (removed `action`, added `relay_physical_mode`,
enum `all` removed — composite-converter side effects, not live-state changes).

Evidence: `inventory/validation-gates-2026-09-01/gate-d-fleet-audit.json`
(full audit JSON) and the pinned tool copy.

## Live surface

No mutation during validation: read-only test runs and snapshot comparisons only.
