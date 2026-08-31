# LivingRoomMainDimmer — observed device context

Hand-curated engineering context for `LivingRoomMainDimmer`
(IEEE `0xa4c13843a9d40f85`, `TS0726-3-BS`, manufacturer name `iedhxgyi`,
romasku firmware `1.1.2-8542fc05`, dateCode `20260612`).

This lives under `inventory/manual/` rather than `inventory/generated/` because it is
not exporter output — it was read directly out of the Zigbee2MQTT runtime store while
investigating [analienx/home-assistant-stack#39](https://github.com/analienx/home-assistant-stack/issues/39).
The declarative design and its safety invariants live in
[`docs/LR_MAINDIMMER_SWAPPED_PINS.md`](../../../docs/LR_MAINDIMMER_SWAPPED_PINS.md).

## Files

`attrs-and-binds.json` — point-in-time sanitized capture of:

- firmware/identity fields Z2M holds for the device;
- the live `device_config` pin string;
- the raw ZCL attribute values Z2M last **read from the device**, per endpoint, with an
  attribute-id legend (these are manufacturer-specific ids, so the legend is not optional);
- the stored bind table per endpoint, with dead/unreachable destinations labelled;
- Z2M's cached state, which additionally contains **successful writes that were never
  read back** — the two sources deliberately disagree and both are reported;
- the Zigbee groups whose membership includes this device, with full member lists.

## Sanitisation

Excluded by construction and checked by a guard before writing: Zigbee network key,
MQTT credentials, coordinator backup, raw `.storage`, recorder/history data, the full
network device roster, and `linkquality`/`lastSeen` churn. Only IEEE addresses actually
referenced by this device's own binds or groups are named.

## Refresh

Re-read from the live host read-only and regenerate; there is no exporter for this
because the data (raw manufacturer attribute ids, stored bind destinations) is not
available through Home Assistant's APIs. Verify against
`docs/LR_MAINDIMMER_SWAPPED_PINS.md` invariant 7 before treating any cached
`indicator_state = ON` as proof that a lighting feed is powered.
