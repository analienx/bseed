# Artifact provenance — swapped-pin migration images

Source: `analienx/tuya-zigbee-switch` commit **`04f98be7`**
(`experiment/detached-physical-relay-canary`, includes PR #1 + the migration
transaction through CRITICAL 10/11). Durable copy: **draft release
`bseed-ts0726-canary-1a50801e`** on that repository (private/draft until the
Supervisor publishes it after gate close; release title/notes name the source
commit). Second protected local copy: the OTA executor workspace,
`build/artifacts/`.

**Status: validation-stage artifacts. NOT APPROVED FOR FLASHING until
[analienx/bseed#8](https://github.com/analienx/bseed/issues/8) closes all five
preconditions.**

## Build environment

- Telink Zigbee SDK v3.7.2.0 (`telink-semi/telink_zigbee_sdk`, tag `V3.7.2.0`)
- TC32 GCC toolchain v2.0, sha256
  `33b854be3e3db3dba4b4dacdda2cd4ea1c94dfd4d562864a095956de7991b430`
  (matches the checksum pinned in `src/telink/tools.mk`)
- Command template (canary; recovery identical plus `MIGRATION_REVERT=1` and
  its own versions):

```sh
CONFIG_STR="iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;" \
MIGRATION_FROM_CONFIG="iedhxgyi;TS0726-3-BS;LC4;SB1u;RC0;IC2;SB7u;RD7;IC3;SB4u;RD2;IB5;M;" \
IMAGE_TYPE=45577 MANUFACTURER_ID=4417 \
VERSION_STR="1.1.3-8542fc05" FILE_VERSION=285356033 \
OTA_VERSION=285356033 OTA_MANUFACTURER_ID=4417 OTA_IMAGE_TYPE=45577 \
make -C src/telink ota
```

## Canary (forward migration image)

| field | value |
|---|---|
| fileVersion | 285356033 (installed LKG 285356032 + 1) |
| internal VERSION_STR | `1.1.3-8542fc05` |
| manufacturerCode | 4417 |
| imageType | 45577 |
| BIN sha256 | `9e2a88d54ea2ac8c10ab8d596c17abfbf2c97840acaf2c4edb82d530c0e868ea` |
| OTA sha256 | `827a28e5cb907c701b0f8ab74f21b3902c4b1e47483c2b055dd2642f67d66006` |

Contains the forward migration (verified by symbol strings); recovery-proof of
absence is on the recovery image below.

## Recovery (migration-revert image)

| field | value |
|---|---|
| fileVersion | 285356034 (strictly greater than the canary) |
| internal VERSION_STR | `1.1.3-8542fc05-rev` |
| manufacturerCode | 4417 |
| imageType | 45577 |
| BIN sha256 | `b7150d8829f328d3e32d4d1a7d26da1d304aa51b6aca90c6b029f87eb132bd6e` |
| OTA sha256 | `e98c34c160f622ad8e0902222150f0ce169b0461540fd7f131ed88ab7d11ae41` |

Contains the revert transaction (`swapped-pin state restored`) and **zero**
forward-migration strings — proven by symbol search on the built ELF.

## Rollback chain (per Supervisor rulings 5489418096 / 5489796206)

```text
canary 285356033 -> recovery 285356034 -> recovery transaction restores
swapped + MANUAL/ON
```

Exact return to LKG firmware `285356032` is stage 2 and requires the
target-only forced downgrade path; the recovery firmware is the accepted
post-rollback firmware unless the Supervisor rules otherwise. Rollback is not
proven until the recovery OTA is demonstrated target-only deliverable.

## Firmware-side gate status

- Through `04f98be7`: criticals 4-7 (85af1bfc), criticals 8/9 +
  completed-state invariant (1a50801e) and criticals 10/11 (04f98be7)
  implemented. 38-test migration matrix and the full stub suite (252 tests)
  pass at the source commit.
- Known classified boot transient (5489796206): canonical boot drives
  C2/C3 LOW until `DETACHED_ON` applies after cluster startup
  (`boot_power_continuity` acceptance item; characterize for the canary,
  fix before generic/upstream readiness).
- Precondition 3/4 closure remains with the Supervisor; precondition 5 stays
  `BLOCKED_PENDING_EUI64`.

