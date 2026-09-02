# V2 FORMAT CLOSURE — supervisor 5505442301 (2026-09-02)

Self-remediation of the cosmetic uncrustify finding on
`src/device_config/device_migration.c`, explicitly authorized by supervisor
comment 5505442301 on `analienx/bseed` issue #8. Prior evidence
`revalidation-2026-09-02-r2` @ `fe7e59a` preserved unchanged.

```text
V2 FORMAT PASS @ 66aa885c4aa13bf4e27d013080170323cb3db52a
validator PASS
focused PASS
full PASS
forbidden-surface PASS
forward hash old == new
recovery hash old == new
evidence commit @ (see ledger post)
```

## Formatting change

- Repo cfg: `uncrustify.cfg`, uncrustify 0.78.1_f (same tool/version used for
  the failing r2 format audit).
- File touched: `src/device_config/device_migration.c` ONLY.
- Change (see `format-commit.txt`): one alignment space in
  `#define DEVICE_MIGRATION_SWAPPED_RELAY_COUNT` and deletion of two blank
  lines. Whitespace only.
- Proof: stripping ALL whitespace from the pre- and post-format files yields
  byte-identical token streams (13953 non-whitespace bytes, `cmp` clean).
- Commit: `66aa885c4aa13bf4e27d013080170323cb3db52a` on
  `supervisor/ts0726-redesign-v4` (pushed; parent `4281c646`).

## Reruns @ 66aa885c (fresh Linux checkout, committed validator first)

- `validate_bseed_ts0726_v4.py`: **PASS** (stub + stub_end_device builds,
  focused + full pytest, all exit 0) — `fmt-validator.log`.
- focused migration/revert + cross-image: **46/46 PASS**.
- full suite: **282/282 PASS**.
- forbidden-surface audit: PASS — migration terms confined to `app.c` entry +
  `device_migration.{c,h}`.
- `uncrustify --check` (device_migration.c/.h, app.c): **PASS** — format gate
  now clean (`fmt-format.log`).
- forward + recovery builds: **PASS** @ 66aa885c (`build-manifest.json`).

## Byte-identical binary comparison (old @ 4281c646 vs new @ 66aa885c)

| artifact | old sha256 (r2) | new sha256 (r2-format) | result |
|---|---|---|---|
| forward.bin | 4a2e444e…f68ba | 4a2e444e…f68ba | **identical** |
| forward.ota | db2328b1…060aa8 | db2328b1…060aa8 | **identical** |
| recovery.bin | 6ebd25f4…7ebf8 | 6ebd25f4…7ebf8 | **identical** |
| recovery.ota | bac0b9ba…231a2 | bac0b9ba…231a2 | **identical** |

Whitespace-only formatting produced byte-identical firmware images, as
required. No stop condition triggered.

## Note

`66aa885c` supersedes `4281c646` as the live-canary firmware SHA candidate.
Software gate is CLOSED; next authorized supervisor step is the reversible
live converter-staging / Z2M-restart / rendered-device-page inspection. OTA
remains blocked until that live UX/matcher check is reviewed.
