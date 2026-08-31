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
  attribute-id legend (these are manufacturer-specific ids, so the legend is not optional).
  The legend is **per cluster**: `genBasic` `65280/65281/65282` are a separate id space and
  the same decimals mean something else under `genOnOff` and `genOnOffSwitchCfg`. Only
  `genBasic 65280` (`device_config`) has a recorded meaning; `65281` and `65282` carry values
  whose meaning was never captured and are left explicitly unspecified rather than guessed;
- the stored bind table per endpoint, with destinations labelled as the store resolved them.
  **The `UNKNOWN-OR-DEAD` label is not proof of death** — see the caveat below;
- Z2M's cached state, which additionally contains **successful writes that were never
  read back** — the two sources deliberately disagree and both are reported;
- the Zigbee groups whose membership includes this device, with full member lists. Note this
  key lists groups **this device belongs to**, so groups the device *binds to* without being
  a member (e.g. 25) are legitimately absent from it; absence is not evidence a group is empty.

## Caveat — the two coordinator spellings are one address reversed

`referenced_ieee_resolution` resolves `0x00124b002d12b1fd` as the removed SLZB-06p7 and
`0xfdb1122d004b1200` as the current ember coordinator. Reversing the first by octet produces
the second, and only the first carries the Silicon Labs OUI — so these may be **one** IEEE in
two byte orders, not two nodes. Consistent with that ambiguity, every one of the 21 bind
entries to either spelling carries the same `UNKNOWN-OR-DEAD` label inside
`binds_stored_by_z2m`, including the 14 whose IEEE the resolution table calls current.

This capture is therefore **not sufficient evidence to remove any binding on this device**.
`stale_bind_capacity` is `blocked_pending_eui64` in `.supervisor/project.yaml` until a live
read identifies the coordinator's on-air IEEE. Do not "fix" the addresses in this file: it is
a record of what the store held at `2026-08-31T18:13:00Z`, byte for byte.

## Identity

Cite this file by its git **blob** sha256:
`741cdea19fbfb6ae041476752f057a8f35dc577ce65e943143a0606a05efaae5` (`git show HEAD:<path>` piped
to a hasher). Hashing a checked-out copy gives a different digest — the clone has
`core.autocrlf=true` and no `.gitattributes`, so checkout rewrites LF to CRLF.
`source_workspace_capture_sha256` inside the JSON is unrelated: it points at the ephemeral
unsanitised working capture, which is deliberately not committed and cannot be retrieved.

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
