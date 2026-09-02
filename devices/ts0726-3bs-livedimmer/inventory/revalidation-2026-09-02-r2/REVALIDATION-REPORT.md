# R2 REVALIDATION REPORT — supervisor comment 5505067709 (2026-09-02)

Self-remediating validation per supervisor 5505067709. Prior failed-run record
`revalidation-2026-09-02` @ `d1db9f2` preserved unchanged; this is a NEW
immutable directory. **Validation evidence only. No live converter deployment,
no Z2M restart, no OTA, no HA live deploy, no attribute writes, no bind/group
mutation, no reset/re-pair.**

## Result

```text
V1 PASS @ e933e3528332bf0a20e58b1cef023b024704257b
V1 UX PASS
V2 PASS @ 4281c6465bbcea31801088b36317e186b97f8ee5
V3 PASS/carry-forward @ 8efc5696debdf80b394bd65ff947118f33ac3215
evidence commit @ (see ledger post)
self-remediated fixes: none needed (supervisor fixes e933e352/4281c646
  validated green; no executor code/tooling defect encountered)
semantic blockers: none
```

## V1 — converter + UX gate (`e933e352`)

Fresh Linux/WSL checkout (LF, core.autocrlf=false), stubs built in-checkout.

- `node --check`: PASS.
- focused overlay pytest: **9/9 PASS** (the previously failing
  action-probe test now passes).
- full pytest (stubs built): **218/218 PASS**.
- `audit_bseed_ts0726_v4_overlay.py`: PASS (softwareBuildID 1.1.4-bseedv4,
  targetModelCount 1, physicalMode calls x3, rawHardwareConfigReadOnly,
  zeroConfigureMutationSurface).
- action probe with the documented **relative** path
  (`zigbee2mqtt/converters/bseed_ts0726_v4.js`): **PASS** — status PASS, all
  six payloads present, 32-value aggregate action, 0 configure callbacks.
- overlay-match probe vs canonical ef79 file: PASS (rawSha256/canonical
  `ef79acfd…`, normalization none, exact fingerprint, legacy/recovery →
  historical fallback).
- bundle: status `BUILT_NOT_DEPLOYED`, historical sha256
  `ef79acfd2141837b539189bfadda07799b53267bd746e1209335d38b91c66bfe`,
  source_normalization none, fingerprint
  iedhxgyi/TS0726-3-BS/1.1.4-bseedv4/priority 100 (v1/bundle-manifest.json in
  WSL archive; hash below).
- Installed-ZHC probe (live Z2M container, ZHC 26.90.0, candidate staged only
  in /tmp, removed after, no restart): **PASS** — bind/configureReporting/
  write/command 0, deviceSave 0, readCount 36, exact softwareBuildID
  1.1.4-bseedv4.
- **UX gate: PASS** — v1/UX-REPORT.md; complete ordered capture
  v1/exposes-full.json (49 exposes via installed ZHC): six named endpoints,
  logical relay states, three physical-behavior selects with
  follow_state/always_on/always_off, smart-bulb + immediate-mains language,
  logical power-on behavior, readable button labels, relay_1/2/3 = Left/
  Middle/Right, panel-LED-only indicators, device_config diagnostic/read-only/
  last, aggregate + per-button actions, no duplicates.

## V2 — firmware gate (`4281c646`)

Fresh Linux/WSL checkout (LF), committed validator first (builds
stub_device + stub_end_device before pytest):

- validator: **PASS** @ 4281c646 (make stub/build, stub/build_end_device,
  focused migration/revert, full suite — all exit 0).
- focused migration/revert + cross-image: **46/46 PASS** (corrected SAME test
  now asserts indicator_state == logical OnOff and passes).
- full suite: **282/282 PASS**.
- forbidden-surface audit: PASS — migration terms confined to
  `src/app.c` (compile-gated entry point call) and
  `src/device_config/device_migration.{c,h}`; no leaks into generic clusters.
- static/format audit: `uncrustify 0.78.1 -c uncrustify.cfg --check`
  passes for `device_migration.h` and `app.c`; **cosmetic finding** on
  `device_migration.c` (+2 bytes: #define alignment spacing line 43, and two
  blank lines at ~202/221). NOT self-fixed: recovery-critical firmware surface
  pinned by supervisor; whitespace-only; recorded for supervisor.
- builds (BUILD ONLY): forward + recovery **PASS** with exact identities:
  forward `1.1.4-bseedv4` / fileVersion 285356035; recovery `1.1.4-bseedv4r` /
  fileVersion 285356036; manufacturerCode 4417; imageType 45577; canonical
  config exact; migrationFromConfig exact. Artifact sha256/size in
  v2/forward-artifact.json and v2/recovery-artifact.json (deterministic —
  identical hashes to the r1 build, consistent with test-only change).

## V3 — HA carry-forward (`8efc5696`)

- Remote branch verified unchanged at `8efc5696debdf80b394bd65ff947118f33ac3215`.
- Lightweight validator re-run: **8/8 PASS** (v3/validator.log). Prior raw
  evidence (d1db9f2 V3-HA.md) referenced; full Docker HA config validation not
  repeated (no environment/tooling change, prior evidence complete).

## Files

- manifest.json (pins, UTC times, commands/exit summary, artifact hashes).
- v1/ logs + installed-zhc-probe.json + exposes-full.json + UX-REPORT.md +
  bundle-manifest.json.
- v2/ validator.log + focused/full-tests.log + format-audit.log +
  forbidden-surface.log + build-manifest.json + forward/recovery-artifact.json.
- v3/ validator.log.
- commands.txt, environment.json.
