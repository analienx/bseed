# Upstream sources and integration policy

## Firmware upstream

Repository: <https://github.com/romasku/tuya-zigbee-switch>

Bootstrap pin: `bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702`.

Use `scripts/setup-upstream.ps1` to obtain the pinned checkout under `.work/`.

## Power-monitoring precursor PR

PR #314: <https://github.com/romasku/tuya-zigbee-switch/pull/314>

Bootstrap observation on 2026-08-18:

- open;
- not merged;
- head `47611b7d9d4b782556392416769fdb24226a8302`;
- described by its author as the first in a series for PM;
- currently adds GPIO pulse-counter APIs;
- application does not use them yet;
- Telink implemented; Silabs no-op.

Policy: inspect/rebase; do not blindly merge.

## Component source

Belling BL0937 datasheet:

<https://www.belling.com.cn/media/file_object/bel_product/BL0937/datasheet/BL0937_V1.02_en.pdf>

Tuya ZTU module documentation:

<https://developer.tuya.com/en/docs/iot/ztu-module-datasheet?id=Ka45nl4ywgabp>

## Updating pins

Any change to `upstream.lock.yaml` requires a Supervisor decision recording:

- old ref;
- new ref;
- relevant upstream changes;
- whether PR #314 or later PM work changed;
- rebuild/test implications.