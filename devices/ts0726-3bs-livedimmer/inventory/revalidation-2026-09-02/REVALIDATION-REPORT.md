# Revalidation report — supervisor comment 5500044572 (2026-09-02)

Executor revalidation of the three pinned branches + evidence-ledger V4.
**Validation evidence only. No code patched, no converter deployed, no OTA,
no HA live deploy, no bind/group/indicator write, no reset/re-pair.**

| track | branch @ commit | result |
|---|---|---|
| V1 converter | `tuya-zigbee-switch` `supervisor/target-overlay-v4-release` @ `60f162b5` | **1 finding (FAIL-1)** — see V1-OVERLAY.md |
| V2 firmware | `tuya-zigbee-switch` `supervisor/ts0726-redesign-v4` @ `f1c0631a` | **1 finding (FAIL-2)** — see V2-FIRMWARE.md |
| V3 HA | `home-assistant-stack` `supervisor/ts0726-post-migration-ha-v1` @ `8efc5696` | **PASS (8/8)** — see V3-HA.md |
| V4 evidence ledger | `bseed` `executor/ts0726-redesign-inputs-2026-09-01` | **done in 1fbc53d + this commit** — see below |

## Failures requiring supervisor patch

**FAIL-1 (V1, tooling):** `probe_bseed_ts0726_action_contract.js`
`require.resolve/require(barePath)` treats the prescribed bare argument
`zigbee2mqtt/converters/bseed_ts0726_v4.js` as a node_modules lookup →
`MODULE_NOT_FOUND` on every clean checkout (Linux and Windows reproduced).
Probe logic is correct when given an absolute path (bundle-builder path is
absolute and its embedded action-contract check PASSed for all six payloads).
Fix: resolve relative to checkout root and/or pass `./`-prefixed path from the
test and docs.

**FAIL-2 (V2, firmware invariant surface):**
`test_forward_complete_preserves_user_indicator_mode` — completed-state
(canonical + FORWARD_COMPLETE) boot preserves the user SAME indicator mode but
leaves the 0xff02 indicator state at the seeded value 0, while the test
requires `INDICATOR_ON` (1). Whether the firmware must drive 0xff02 ON for a
SAME-mode record on a DETACHED_ON relay, or the fixture expectation needs
adjusting, is a supervisor decision. All 45 other focused migration tests and
the remaining 236 full-suite tests pass.

## Passed evidence highlights

- V1 overlay: focused 8/9, full 217/1, audit PASS, `node --check` PASS,
  bundle `BUILT_NOT_DEPLOYED` with exact ef79 historical + iedhxgyi/TS0726-3-BS/
  1.1.4-bseedv4/priority-100 fingerprint, overlay-match PASS, installed-ZHC spy
  PASS inside the live Z2M container (ZHC 26.90.0; bind/configureReporting/
  write/command 0; read 36; deviceSave 0) — staged to /tmp, removed, no restart.
- V2 firmware: build PASS from `f1c0631a` with exact required identity
  (forward 1.1.4-bseedv4 / 285356035, recovery 1.1.4-bseedv4r / 285356036,
  4417 / 45577). BUILD ONLY. Artifacts + sha256 in firmware-build-manifest.json.
- V3 HA: script exists, never automatic, operator-gated, requires all three
  physical modes always_on, writes only the three indicator selects to same,
  no physical-mode change, no relay_right write; whole HA tree YAML parses.
- V4: runtime/* evidence committed at `1fbc53d`; all 14 manifest entries
  verified hash+size against committed files; CRLF checkout fact reproduced and
  recorded (see redesign-inputs manifest observations).

## Environment notes

- Runs used fresh Linux (WSL Ubuntu) checkouts of the pinned commits
  (core.autocrlf=false → LF) with stubs and Telink images built from source in
  that checkout. Toolchain `tc32 4.5.1`, `telink_tools` SDK present locally.
- Executor did not modify any pinned branch code. Tooling copy for V3 kept at
  `tools/validate_ts0726_ha_finalizer.py`.
