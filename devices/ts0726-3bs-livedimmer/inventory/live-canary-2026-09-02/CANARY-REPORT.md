# LIVE CANARY — LivingRoomMainDimmer forward OTA to 1.1.4-bseedv4 (2026-09-02)

Executor return for supervisor `5508488955` (Sections A–F). Target: `0xa4c13843a9d40f85` / `LivingRoomMainDimmer`. All operations via bridge request/API only; no manual attribute writes, no re-pair, no interview, no device_config/physical_mode writes.

## Verdict

```text
CANARY_PASS (software evidence) — PHYSICAL_CONTINUITY = PENDING_OPERATOR
```

## A. Pre-OTA state (baseline)

- Device: `1.1.2-8542fc05`, dateCode `20260612`, installed_version `285356032`.
- Relays L/M/R all `OFF`; power-on behavior `previous` ×3; indicators L/M = `manual+ON`, R = `same+ON`.
- Converters on disk hash-verified: overlay `bseed_ts0726_v4.js` = `d5b276dd…`, base `switch_custom.js` = `e178e68a…` (matches supervisor pins).
- Binding targets: `0xa4c1388b709b209c` (LivingRoomLinearDimmer), `0xfdb1122d004b1200` (Coordinator).
- Pre-OTA browser baseline (Section A of UX gate, commit `5384a46`): old endpoint-scoped definition rendered, both viewports.

## B. CHECK gate (read-only)

| Check | Result |
|---|---|
| Forward CHECK tx `canary-check-fwd-01` | `status=ok`, `update_available=true`, source `http://127.0.0.1:8899/forward.ota` |
| Recovery CHECK tx `canary-check-rec-01` | `status=ok`, `update_available=true`, source `http://127.0.0.1:8899/recovery.ota` |

Temp server: node http server bound to `127.0.0.1:8899` **inside** the Z2M container; images copied in with sha256 verified pre/post (`forward.ota db2328b1…`, `recovery.ota bac0b9ba…` = pinned builds @ `66aa885c`).

## C. Forward OTA — tx `canary-update-fwd-01`

- UPDATE request → progress monitored over MQTT; `forward.ota` served fully (183826 B, server log).
- Completed ~12:07Z; `installed_version = 285356035`, update `state=idle`.
- Post-OTA device identity: `softwareBuildID 1.1.4-bseedv4`, `dateCode 20260902`.
- Definition **auto-rematched** to the v4 overlay ("BSEED Echo Click / Scale 3-gang — Romasku v4 canary") without any restart. The permitted post-OTA deterministic rematch restart was **not needed**.

## D. Post-OTA migration invariants (state captured 14:26 local / from MQTT)

| Invariant | Observed | Verdict |
|---|---|---|
| Relays after migration | L/M/R all `OFF` (pre: all `OFF`) | PASS |
| Power-on behavior | `previous` ×3 unchanged | PASS |
| Indicator LEFT | `manual` + `ON` | PASS (safety MANUAL+ON preserved) |
| Indicator MIDDLE | `manual` + `ON` | PASS (safety MANUAL+ON preserved) |
| Indicator RIGHT | `same` + `ON` (untouched; no finalization write) | PASS |
| `*_physical_mode` slots | all `null` (removed by migration as designed) | PASS |
| `device_config_switch_left` | rewritten by firmware migration only (`RC2;IC0…RC3;ID7`); no manual write | PASS |
| multi_press_reset_count | 10 (preserved) | PASS |
| Indicators NOT finalized to SAME | no write performed | PASS |

Fleet delta (pre vs post `bridge/devices`, 104 devices): **exactly 3 fields, all on the target** — `definition`, `software_build_id`, `date_code`. Bindings/configured-reportings/endpoints/groups: **0 deltas** fleet-wide; groups 21/21 identical; bound targets unchanged.

## E. Physical continuity

Software telemetry shows no relay/main state change, but per supervisor: **PHYSICAL_CONTINUITY = PENDING_OPERATOR** — no operator was present to visually confirm the downstream smart lights did not blink during the device reboot window. Availability of the bound smart-light path (`LivingRoomLinearDimmer`) remained `online` throughout (monitor log).

## F. REAL post-OTA WindFront visual gate — PASS

Same prescribed navigation (Devices → search → device → Exposes), WindFront, final URL `…/#/device/0/0xa4c13843a9d40f85/exposes`, desktop 1440×1200 + mobile 412×915, vs baseline `5384a46`.

Textual assertions against `document.body.innerText` (9171 chars):

- `must_contain_missing: []` — all six mandated labels present: Logical relay state, Logical state after power-up, Physical relay behavior, Advanced hardware configuration (read-only), Indicator LED behavior, Assigned local relay.
- Generic `State (Endpoint: relay_…)` primary label occurrences: **0**.
- Ordering: Logical relay state (119) < Physical relay behavior (237) < Button type (2876) < Indicator LED behavior (6779) < Advanced hardware configuration (8535) → **order_ok: true**.
- Description text verified, incl. read-only canary warning on the hardware pin map ("writes are disabled here") and v4 indicator semantics on all three indicator selects.
- Browser console: no errors/warnings (single WebSocket-open log line).

Files: `ux/post-ota-browser-access-desktop.png`, `ux/post-ota-browser-access-mobile.png`, `ux/post-ota-browser-metadata.json`, `ux/post-ota-page-visible-text*.txt`, `ux/post-ota-browser-console.log`; baseline pre-OTA captures included alongside.

## Live state left behind

- Z2M running, overlay live, target on `1.1.4-bseedv4` with v4 definition — no HA-side finalization, no indicator write.
- Recovery OTA staging **left in place pending supervisor ruling**: container `/tmp/ota-canary/` (server on `127.0.0.1:8899`, inert) + host `/root/ota-canary/` (scripts, snapshots, logs). One command tears both down on request.
- Temp TCP relay for browser access torn down (port 18099 verified free).

## Evidence

- `raw/canary-evidence.tgz` — monitor logs (full MQTT transcript of the OTA), request/response JSON, server log, pre/post snapshots (`devices.json`, `groups.json`, projections, availability, converter hashes).
- `raw/state-post-dimmer.json` — full post-OTA device state.
