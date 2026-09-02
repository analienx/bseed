# V1 — Converter overlay revalidation evidence (2026-09-02)

Executor revalidation per supervisor comment 5500044572. Branch
`analienx/tuya-zigbee-switch` `supervisor/target-overlay-v4-release`
@ `60f162b54348806e9bd12ccf674bb5a8b2e4d400` ("Execute legacy action decoder
in clean overlay tests").

Runs were executed on a **fresh Linux (WSL Ubuntu) checkout** of the pinned
commit (git 2.53, core.autocrlf=false -> LF working tree; stub binaries built
from that checkout) and, where noted, on the Windows worktree copy.

## Results

| check | result |
|---|---|
| `pytest tests/test_bseed_ts0726_v4_overlay.py -q` (clean Linux checkout) | **8/9 PASS** — 1 failure (see FAIL-1) |
| `pytest -q` (clean Linux checkout, stubs freshly built) | **217 passed, 1 failed** (same single failure FAIL-1) |
| `audit_bseed_ts0726_v4_overlay.py zigbee2mqtt/converters/bseed_ts0726_v4.js` | **PASS** — softwareBuildID `1.1.4-bseedv4`, targetModelCount 1, physicalModeCalls left/middle/right x1, rawHardwareConfigReadOnly true, zeroConfigureMutationSurface true |
| `node --check zigbee2mqtt/converters/bseed_ts0726_v4.js` | **PASS** (exit 0) |
| `node helper_scripts/probe_bseed_ts0726_action_contract.js zigbee2mqtt/converters/bseed_ts0726_v4.js` (prescribed bare-relative invocation) | **FAIL** — see FAIL-1 |
| `build_bseed_ts0726_deployment_bundle.py <ef79acfd.js> <out>` (Linux) | **PASS** — manifest `BUILT_NOT_DEPLOYED`; see `v1-bundle-manifest.json` |
| `probe_bseed_ts0726_overlay_match.js` on the bundle | **PASS** — see `v1-overlay-match-probe.json` |
| Installed-ZHC spy (live Z2M container, staged to `/tmp` only) | **PASS** — see `v1-installed-zhc-spy-overlay.json` |

## FAIL-1 — prescribed bare-relative probe invocation (deterministic, platform-independent)

The exact command from supervisor section 2:

```bash
node helper_scripts/probe_bseed_ts0726_action_contract.js zigbee2mqtt/converters/bseed_ts0726_v4.js
```

fails identically on **both** Windows node v24.18.0 and Linux node:

```
node:internal/modules/cjs/loader:1386
  throw err;
  ^

Error: Cannot find module 'zigbee2mqtt/converters/bseed_ts0726_v4.js'
Require stack:
- <checkout>/helper_scripts/probe_bseed_ts0726_action_contract.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1517:15)
    ...
    at loadDefinitions (<checkout>/helper_scripts/probe_bseed_ts0726_action_contract.js:53:34)
  code: 'MODULE_NOT_FOUND'
```

Root cause (read from the source): `loadDefinitions(path)` at
`helper_scripts/probe_bseed_ts0726_action_contract.js:52-54` calls
`require.resolve(path)` / `require(path)` with the bare argument. A specifier
without a `./`, `../` or absolute prefix is treated by Node CommonJS as a
`node_modules` package lookup, never as a path relative to the checkout, so the
clean-checkout invocation can never resolve the file. This is independent of
OS and CRLF state (reproduced on clean LF Linux checkout).

**The probe logic itself is correct and passes** when the converter path is
absolute — the bundle builder passes an absolute path and its
`checks.action_contract` recorded `status PASS` for all six required payloads
(`switch_0_press`, `switch_1_long_press`, `switch_2_toggle`,
`switch_0_brightness_move_up`, `switch_1_brightness_move_down`,
`switch_2_brightness_stop`) plus the 32-value generic action expose and 0
configure callbacks. The only defect is the bare-path invocation contract (and
the release test that uses `str(OVERLAY)` = bare path, which is why
`test_legacy_action_behavior_probe_when_node_is_available` fails).

Fix scope (for Supervisor, not applied by executor): resolve the argument
relative to the checkout root (e.g. prefix `./` or `path.resolve(process.cwd(),
argv[2])`) in `probe_bseed_ts0726_action_contract.js` and/or pass `./`-prefixed
/ absolute path from `tests/test_bseed_ts0726_v4_overlay.py` and section-2 docs.

## Installed-ZHC spy summary (live, read-only, no deployment)

Staged `bseed_ts0726_v4.js` (canonical LF, sha256
`d5b276dd967541e261e51606fdbf1e5412d55b7b660b8559d930e000eda04fa2`, 15678 B) +
`probe_bseed_ts0726_installed_zhc.js` into the running Z2M add-on container
(`app_45df7312_zigbee2mqtt`) at `/tmp/bseed-v4-probe/`, executed, then removed.
No live converter change, no restart, `/config` untouched.

```
status PASS            mutationCount 0    bind 0
configureReporting 0   write 0            command 0
readCount 36           deviceSaveCount 0
installedZhc version 26.90.0
  (/app/node_modules/.pnpm/zigbee-herdsman-converters@26.90.0/...)
fingerprint iedhxgyi / TS0726-3-BS / softwareBuildID 1.1.4-bseedv4 / priority 100
zigbeeModel [] (no bare matcher)
device_config access 5 (GET+REPORT only), label "Advanced hardware configuration (read-only)"
```

## Required bundle manifest (as produced, Linux build)

```
status = BUILT_NOT_DEPLOYED
historical.sha256 = ef79acfd2141837b539189bfadda07799b53267bd746e1209335d38b91c66bfe
historical.source_normalization = none
overlay fingerprint = iedhxgyi / TS0726-3-BS / 1.1.4-bseedv4 / priority 100
```

Note: the Windows-worktree copy of the overlay inflates to CRLF (16090 B,
sha256 1d860881…) while the canonical LF build is 15678 B
(d5b276dd…). Both are the same git content; the bundle tooling writes only the
working-tree-bytes-canonicalized file per supervisor section 3 and the
matcher probe normalizes when needed (here `none`).
