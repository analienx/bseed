# Artifact provenance — swapped-pin migration images

Source: `analienx/tuya-zigbee-switch` commit **`1a50801e`**
(`experiment/detached-physical-relay-canary`, includes PR #1 + migration
transaction). Durable copy: **draft release
`bseed-ts0726-canary-1a50801e`** on that repository (private/draft until the
Supervisor publishes it after gate close). Second protected local copy: the
OTA executor workspace, `build/artifacts/`.

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
| BIN sha256 | `a60927fb912f7b7612448c7639e119afd5c883f6e672037b6bf5d35b892f88c7` |
| OTA sha256 | `204d1537383d720fe3ce08c563cff585d51ca50d82099a5636a963e33817220a` |

Contains the forward migration (verified by symbol strings); recovery-proof of
absence is on the recovery image below.

## Recovery (migration-revert image)

| field | value |
|---|---|
| fileVersion | 285356034 (strictly greater than the canary) |
| internal VERSION_STR | `1.1.3-8542fc05-rev` |
| manufacturerCode | 4417 |
| imageType | 45577 |
| BIN sha256 | `6c6ff5877d4e24c344774c6bd2296b4ba4d37682311580acca0e7dd28e34773d` |
| OTA sha256 | `7fd5ae330957d4b79018deb2b360e1e97d0064c545d0ccb0478dce21188484be` |

Contains the revert transaction (`swapped-pin state restored`) and **zero**
forward-migration strings — proven by symbol search on the built ELF.

## Rollback chain (per Supervisor ruling 5489418096)

```text
canary 285356033 -> recovery 285356034 -> recovery transaction restores
swapped + MANUAL/ON
```

Exact return to LKG firmware `285356032` is stage 2 and requires the
target-only forced downgrade path; the recovery firmware is the accepted
post-rollback firmware unless the Supervisor rules otherwise. Rollback is not
proven until the recovery OTA is demonstrated target-only deliverable.

## Firmware-side gate status

- `85af1bfc` criticals 4-7 and `1a50801e` criticals 8/9 + completed-state
  invariant implemented; 33-test migration matrix and the full stub suite
  (247 tests) pass at the source commit.
- Precondition 3/4 closure remains with the Supervisor; precondition 5 stays
  `BLOCKED_PENDING_EUI64`.
