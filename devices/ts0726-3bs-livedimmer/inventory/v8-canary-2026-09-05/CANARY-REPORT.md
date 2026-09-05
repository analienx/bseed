# LIVE CANARY — LivingRoomMainDimmer forward OTA to 1.1.8-bseedv8 (2026-09-05)

Executor return for supervisor ruling `5552730292` (issue #10). Target:
`LivingRoomMainDimmer` / IEEE `0xa4c13843a9d40f85`, only. All operations via the
proven per-request index + device-scoped MQTT bridge requests. No re-interview,
no rejoin, no configure, no device writes, no global OTA config/index change,
no converter or firmware edits.

## Verdict

```text
CANARY_PASS (device-level software evidence, all mandatory section-5 conditions met)
FINDING (pre-rollout blocker, Z2M-side, NOT a firmware defect): post-OTA definition
  rematch fell back to the generic Romasku converter because converter_lib has no
  1.1.8-bseedv8 fingerprint. Rollback route staged, proven, and NOT executed.
PHYSICAL_CONTINUITY = PENDING_OPERATOR
```

## 1. Rollback staged BEFORE touching the device (ruling section 1)

- Artifact: exact accepted V7 production OTA (source `0f54303a…`, fileVersion
  `285356041`), from the banked handoff `C:\Users\jakub\.qwen\tmp\v7-release\forward.ota`.
- `forward.ota` 185,890 B — SHA256 `942ff109bc91dd411a0d6ebd18c00e1402f83e274e844499297a817a7a0033a0`,
  SHA512 `23dc48aafeda7b07864ccaca1a962891b048c49fbe5593a9a82990294fb3e078132beeb8dc5cfd839a7986722d04a560a6e8c3604537c74367ad06c0e07ee9b6`.
  (`forward.bin` SHA256 `8f7ffbda…c27d`, SHA512 `9d928c3f…df19`.)
- Parsed header (banked RC-BUILD layout mfr@10/imgType@12/fileVer@14):
  identifier `0x0BEEF11E`, headerVersion 256, manufacturerCode `4417`,
  imageType `45577`, fileVersion `285356041`, headerString "Telink OTA Image",
  totalImageSize 185890 == file size. PASS.
- Staged in Z2M container `/tmp/v8ota-root/` (v7-recovery.ota + index-recovery.json
  + local-only HTTP server on `127.0.0.1:8899`); in-container SHA256 re-verified,
  serving proven (byte count + hash).
- Exact target-only rollback command (STAGED, NOT EXECUTED):
  `publish zigbee2mqtt/bridge/request/device/ota_update/update/downgrade`
  payload `{"id":"0xa4c13843a9d40f85","url":"http://127.0.0.1:8899/index-recovery.json"}`
  (Z2M 2.14.0 native per-request downgrade; no global `ota:` config change; scoped
  by explicit device id — no wildcard/group eligibility).
- Route validation (read-only CHECK): pre-OTA
  `check/downgrade` → `status ok, downgrade=true, source=…/v7-recovery.ota,
  update_available=false` (correct: device was still ON 285356041). Post-OTA
  re-check → `status ok, downgrade=true, update_available=true` — the exact V7
  image is fully eligible for target-only downgrade. `raw/ota-check-rollback-downgrade.json`.

## 2. V8 frozen bytes re-verified immediately before OTA (ruling section 2)

- `forward.ota` 187,858 B SHA256 `4a74fa80edd9eb495c398ab0a9d574594d17172d5a032c2f2f50d599ac897230` (host, container, and serving copy identical); `forward.bin` SHA256 `1524f87a…598f`.
- Header reparse: mfr `4417`, imageType `45577`, fileVersion `285356042`, totalImageSize 187858 == file size. PASS. No rebuild performed.

## 3. Pre-OTA baseline (read-only, machine-readable: `raw/pre/`)

- firmware: `swBuildId 1.1.7-bseedv7`, dateCode 20260904, `update.installed_version 285356041`.
- `device_config` = canonical `iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;`.
- Raw 0xff00/0xff05/0xff06 EP1/2/3 = `1,3,3 / 1,3,3 / 1,0,2` (accepted profile).
- Physical modes L/M = Always on, R = Follow logical state; indicator modes
  L/M = Binding status, R = Physical output; relays L/M OFF, R ON (recorded as-is).
- Bindings: **18**; EP4/EP5 `genLevelCtrl -> coordinator` **absent** (`level-binds-check.json`).
- Groups 21; fleet 103 devices. Availability `online`. currentLevel poll errors (today): **0**.

## 4. OTA delivery (ruling section 4)

- Request (16:14:42Z): `bridge/request/device/ota_update/update` payload
  `{"id":"LivingRoomMainDimmer","url":"http://127.0.0.1:8899/index-forward.json"}`
  — explicit single-device id; local-only index; no global index/publish.
- Completed 16:37:42Z (~23 min): `status ok`, from `1.1.7-bseedv7 / 285356041`
  → to `1.1.8-bseedv8 / 285356042`, dateCode 20260905. Full transcript:
  `raw/ota-update-fwd.json`, `raw/ota-update-run.log`; log window `raw/log-window/`.
- Expected OTA reboot/announce only; no leave/rejoin/factory-reset observed.


## 5. Post-OTA acceptance (ruling section 5) — ALL PASS

| Check | Result |
|---|---|
| swBuildId / fileVersion | `1.1.8-bseedv8` / `285356042` PASS |
| device_config (fresh raw genBasic 0xff00 EP1 read) | byte-identical canonical — no fallback/replacement PASS |
| binding count / set | 18 pre and post; endpoint diff = **0** (bindings, configured_reportings, scenes, clusters) PASS |
| EP4/EP5 level binds | absent (`raw/post/level-binds-check.json`) PASS |
| groups | 21 pre/post, 0 diffs PASS |
| reporting | unchanged (0 configured_reporting diffs) PASS |
| physical modes (raw 0xff03 EP4/5/6) | `1/1/0` = Always on / Always on / Follow logical state — RIGHT untouched PASS |
| indicator modes/states | Binding status / Binding status / Physical output; L/M OFF, R ON — unchanged PASS |
| 0xff00/0xff05/0xff06 post raw reads | `1,3,3 / 1,3,3 / 1,0,2` — identical PASS |
| multi_press_reset_count | 40 preserved PASS |
| Z2M device | online, responsive PASS |
| currentLevel poll noise | **0** occurrences in entire bounded post-OTA window PASS |
| NVM schema churn | none (nvmMigrationsVersion=1 on both sides; no transition) PASS |
| fleet delta | exactly 1 field on the target only (`software_build_id`) PASS |

## FINDING — post-OTA converter/definition rematch (Z2M-side; supervisor ruling required)

After OTA, Z2M's definition rematch selected the **generic Romasku converter**
("BSEED Echo Click / Scale 3-gang — Romasku custom firmware", endpoint-suffixed
exposes) instead of the accepted **v6_production overlay** ("BSEED 3-gang
smart-light controller — protected mains control…"). Root cause: live
`converter_lib/bseed_ts0726_v567_hardened.js` fingerprints cover
`1.1.5/1.1.6/1.1.7-bseedv*` only — there is **no `1.1.8-bseedv8` fingerprint**,
so the overlay cannot match. Consequences observed (all Z2M-presentation layer;
device-level state/actions unaffected):

- recurring `fromZigbee` exceptions on the target (8×): generic converter
  `Expected one of: 1, 3, 2, got: '0'` (BSEED binded-mode value 0 unrepresentable);
- suffixed `relay_right_physical_mode_relay_right` mispublished as `Always off`;
- production-only exposes absent (`device_config_unlock`, unsuffixed
  `device_config`, `*_binding_intent`, unsuffixed indicator modes), which may
  affect HA automations referencing the unsuffixed indicator entities.

Not executed (no authorization): adding the V8 fingerprint line to the live
converter overlay (the established "narrow compatibility overlay" mechanism) and
the permitted deterministic rematch restart. Executor assessment: this is a
rollout-preparation gap (the V8 swBuildId was frozen and known), not a V8
firmware defect; no section-6 device-level rollback trigger fired. If the
supervisor classifies the recurring Z2M exception pattern as a section-6 trigger,
the proven target-only downgrade route is staged and one command executes it.


## Boundary audit (ruling section 7)

```text
other devices offered V8          = NO (no other-device OTA activity in window)
global OTA config/index changed   = NO (ota: section byte-unchanged; no index key)
bindings deliberately mutated     = NO
groups deliberately mutated       = NO
device_config deliberately written = NO (raw readback identical)
re-interview/configure/rejoin     = NO (none invoked)
HA-v2 deployed in this run        = NO
PM/#11 touched                    = NO
firmware source edited            = NO
Z2M restart during canary         = NO (RestartCount=0; 19:31 boundary was size rotation)
```

## Left in place

- Z2M container `/tmp/v8ota-root/` (v7-recovery.ota + index + server on
  127.0.0.1:8899, inert) — staged rollback route, pending supervisor ruling.
- Host `/tmp/v8-rollback/` (both artifacts + indexes + scripts).

## Evidence

`raw/` — pre/post machine batteries, pre-post-diff.json, OTA runner transcripts,
log windows (bounded from pre-OTA byte offset 2511691), mode/raw verification
JSONs, and the full evidence tarball. Staging scripts: repo `.qwen/tmp/v8canary/`.

## Compatibility note

No change to V7 ABI (0xff00/0xff05/0xff06 values identical pre/post), accepted
imageType 45577 preserved, converter fingerprints in the repo untouched, runtime
configuration (canonical device_config, physical/indicator modes, bindings,
groups, reporting) byte/semantically unchanged. The only device-level delta is
`software_build_id` / `fileVersion` / `dateCode`.

