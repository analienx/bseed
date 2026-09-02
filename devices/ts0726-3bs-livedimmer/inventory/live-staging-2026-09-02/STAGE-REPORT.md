# LIVE STAGING REPORT — bseed_ts0726_v4.js overlay (supervisor order 5506156937)

**Return format:** `STAGE_PASS @ d5b276dd967541e261e51606fdbf1e5412d55b7b660b8559d930e000eda04fa2 · evidence @ <commit> · rollback path armed`

- Z2M 2.13.0 / ZHC 26.90.0 / ZH 10.8.0 / Node v24.18.1 · coordinator EmberZNet 9.1.1 (EZSP 19)
- Target: `LivingRoomMainDimmer` `0xa4c13843a9d40f85` (TS0726-3-BS / iedhxgyi / 1.1.2-8542fc05)

## Stage 1 — Isolated composition proof (in-container, read-only, no restart)
`composition-preflight.json` — **PASS (exit 0)**
- Method: installed ZHC's own external-definition API (`addExternalDefinition` + `findByDevice`), i.e. exactly what Z2M's `externalConverters` extension calls (`/app/dist/extension/externalConverters.js`).
- Baseline externals loaded: stb3l (1) + switch_custom (199) + tuya_with_ota (43); descriptors = all 103 routed/end devices from the live database merged with live bridge `softwareBuildID` values.
- **Fleet delta: 0 / 103 devices** change resolution when the overlay is added on top of the live externals.
- Target cases: `1.1.2-8542fc05` → legacy `switch_custom` definition; `1.1.4-bseedv4` → overlay (`BSEED Echo Click / Scale 3-gang — Romasku v4 canary`); `1.1.4-bseedv4r` → legacy definition. All three match expectations (fingerprint priority-100, exact triple gate).
- Fleet facts: exactly **one** `iedhxgyi` device exists (the target); the other TS0726 (`TS0726-1-BS` / `jn2x20tg`) cannot match the overlay.

## Stage 2 — Live deploy + exactly one controlled restart
- Overlay deployed to `external_converters/bseed_ts0726_v4.js` via `docker cp` from the canonical `e933e352` checkout (LF, 15678 B); SHA-256 verified at scp, host copy, and **in-container before and after restart**: `d5b276dd…`.
- Restart issued 08:43:19Z, exactly once; container `Up (healthy)`.
- Startup log: `Loaded external converter 'bseed_ts0726_v4.js'` + load counts 1/1/199/43 (identical to baseline); **no converter-related errors** (only transient restart noise: MQTT reconnect during bring-up, join-disable on stop).
- Converter hashes after restart: overlay `d5b276dd…`; pre-existing externals byte-identical (`e178e68a…` / `b0aa0de4…` / `60ee3ddd…`).
- **Post-conditions (target-after-semantic-diff.json):**
  - devices 104 → 104, same IEEE set; **0 device semantic deltas** (definition, softwareBuildID, endpoints/bindings/reportings, disabled, supported, power_source, date_code)
  - target: softwareBuildID unchanged `1.1.2-8542fc05`, definition byte-identical, endpoints identical
  - groups 21 → 21 identical; Z2M version unchanged 2.13.0
- Fleet publishes normally post-restart (target included, healthy linkquality).

## Rollback
Armed and tested-by-construction: delete `external_converters/bseed_ts0726_v4.js` + one restart; full pre-stage converter directory preserved in `external_converters-rollback/`; pre/post bridge captures included. Z2M left **running with the overlay loaded** (definition-identical state) awaiting OTA authorization.

## Notes
- `bridge-bindings.json` in this directory is a leftover empty capture from a superseded topic attempt; bindings evidence is authoritative from `bridge/devices` `endpoints[].bindings` (verified identical before/after).
- No OTA was performed — firmware transfer remains gated on the supervisor's separate authorization.
