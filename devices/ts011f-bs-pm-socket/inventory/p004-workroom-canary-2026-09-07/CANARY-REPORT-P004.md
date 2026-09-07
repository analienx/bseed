# P004 CANARY REPORT — WorkroomSocketCabinet (custom-only final canary)

Authorization: issue #11 comment `5561628487` (APPROVED / OTA-CANARY — P004 FINAL CUSTOM-ONLY CANARY).
Execution: 2026-09-06 20:25Z – 2026-09-07 07:00Z, direct target-only initiation per operator override (proven mechanism from prior custom-OTA canaries). Read-only for all other devices. `STOCK_TUYA_DEVICES_MUTATED = false`.

## Outcome: `V8_POSTCHECK_FAILED` → recovery attempted → **OTA ROLLBACK BLOCKED** (device ABORT)

## Phase 1 — preflight: PASS
Target exact: `WorkroomSocketCabinet` / `0xa4c138c5f07ee732` / b28wrpvx / TS011F-BS-PM / Router / EP [1,2] / build `1.2.5-8b8cc492` / 302329856 / config `b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;` / relay OFF / 0 W / online. Artifact re-verified in-container (`c3ccb484…fe7c`, 195394 B, 4417/43556/302329858). Frozen PR head `ded91a1fb1cdeb320d0858c8f4bcabab32bf5564` untouched.

## Phase 2 — OTA transfer: COMPLETED (with deviations)
- 20:25:34Z schedule armed; power cycle performed 20:35 (operator, independent breaker). First observation attempt aborted by executor tooling (rejoin detection waited for MQTT publish — an unloaded socket emits none); device verified online throughout. Second attempt launched 20:57.
- Operator overrode the passive schedule+power-cycle protocol: **direct `ota_update/update`** (the mechanism proven on prior custom canaries) was used instead. Terminal evidence (authoritative Z2M file log): device-originated queries/INFO `Updating` at 2026-09-06 23:17:29, 06:10:00, 06:18:18; **`was OTA updated from '302329856' to '302329858'` at 2026-09-07 06:27:39Z**. Several Z2M restarts overnight interrupted early transfers; the final transfer completed.
- NOTE: raw per-block progress evidence from the completing run was lost with the 04:15:52Z host restart (container /tmp wipe); the terminal event above is from the persistent file log.

## Phase 3 — postflash acceptance: **FAIL**
- PASS: fileVersion 302329858 / `0x12053002`; build `1.2.5-bseedv8u1`; same IEEE; b28wrpvx / TS011F-BS-PM; Router; config byte-identical; no reset/re-pair; relay OFF; stable availability; voltage 242.72 plausible; energy 0.04 nondecreasing; no reboot loop; no target-correlated error burst.
- **FAIL — metering dead**: `power`/`current` report 0 under a connected drawing load (active speaker) across two probe windows (raw/functional-canary.json, raw/load-probe.json). `overload_alarm_switch` **NOT_EXPOSED** on this unit (absent from payload; not a regression). UI shows **no power measurements**.
- **FAIL — converter/exposes breakage**: Z2M log floods `No converter available for '47' on 'WorkroomSocketCabinet': ("w")` … per-character JSON-string parse errors (raw/converter-errors.txt) — exposes/definition handling broken under V8 on this device.

## Phase 4 — functional 3-cycle canary: PARTIAL
Relay ON/OFF 3× correct; voltage stable; no spurious protection trip; energy nondecreasing; final relay OFF. **Metering response under load absent (see above)** — material failure per requirement "repeatable current/power response under load".

## Recovery / revert attempts (operator-directed revert to known-good 1.2.5-8b8cc492)
- Recovery artifact `bseed-b28wrpvx-protection-canary-forced.zigbee` (SHA256 `02fe4b9f…d7`, 201986 B, outer 0xFFFFFFFF) — hash verified, direct update sent 06:48:41Z: image offered, blocks began, **device aborted at 0.5% (`reason: ABORT`)**.
- Retry 06:51:48Z: no device query.
- Z2M native downgrade request: **no response** in 120 s.
- Conclusion: **the V8 OTA client refuses any downgrade (Telink client-side version check) — V8 has NO working OTA rollback path on this hardware.** Device remains on V8, relay OFF, usable except broken metering/exposes. Reverting further requires a supervisor decision (wired SWS is `SWS_PATH_NOT_PROVEN_ON_THIS_CANARY`; a rebuilt old-image with bumped inner version + valid CRC is not authorized tooling).

## Phase 5 — V8 self-reinstall liveness: NOT RUN (superseded by Phase 3 failure)

## Evidence
`raw/` (preflight, postcheck, functional-canary, load-probe, recovery results, converter-errors, ota-terminal-lines, hashes), `tools/` (pm004 runner + direct + recovery + selfreinstall wrapper proof). Frozen source untouched; PR #5 unmodified; no stock device touched; no device_config/calibration writes; no reset/re-pair.

## Lessons for next time (per operator)
Direct-initiation smoke test + postflash exposes/metering verification against a test harness should gate any release; a downgrade path must be proven BEFORE shipping any custom image (Telink rejects downgrades — recovery must not rely on OTA).
