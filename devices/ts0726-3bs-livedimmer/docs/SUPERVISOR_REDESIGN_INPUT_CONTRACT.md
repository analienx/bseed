# Supervisor redesign input contract — TS0726 / BSEED canary

Purpose: freeze authoritative live inputs so the Supervisor can own all redesign/code/test work.

## Responsibility split

Executor = evidence collector only.
Allowed: read-only inspection, extracting exact historical files, copying/sanitizing evidence into BSEED, computing hashes, documenting provenance.
Not allowed in this phase: converter edits, firmware edits, HA edits, generator changes, deploy/restart, attribute writes, bind/group mutation, OTA, or fixes.

Supervisor owns: converter architecture, target-only overlay, PM compatibility, legacy action decision/implementation, firmware/migration redesign, HA reconciliation, device-page UX, tests, deployment scripts, and final regression review.

## Evidence branch/location

Create evidence-only branch:
`executor/ts0726-redesign-inputs-2026-09-01`

Place artifacts under:
`devices/ts0726-3bs-livedimmer/inventory/redesign-inputs-2026-09-01/`

Add manifest.json. For every artifact record source host/path/topic/command, UTC capture time, original SHA256 where applicable, committed SHA256, exact-original vs reconstruction, sanitization, and notes.
Never commit credentials, MQTT passwords, Zigbee network keys, API tokens, cookies, or full HA backups.

## P0 — exact historical external converter bytes

Highest priority: recover exact pre-Gate-F converter bytes with SHA256:
`ef79acfd2141837b539189bfadda07799b53267bd746e1209335d38b91c66bfe`

Commit byte-for-byte as:
`historical_external_converters/switch_custom.ef79acfd.js`

Search read-only in /config/zigbee2mqtt/bseed_probe/, external_converters backup/temp files, backup extractions, host snapshots, or executor-created pre-F copies. If needed extract only relevant Z2M external converter files from the nearest pre-F HA backup; do not commit the full backup.

Also commit `historical_external_converters/index.json` for the entire recoverable pre-F converter set: filename, SHA256, size, source path/backup, exact/reconstructed flag.

This is required so Supervisor can recover PM/metering/protection logic, generic action behavior, historical matcher semantics, and local customizations absent from Romasku upstream.

## P0 — exact current runtime/external-converter layout

Commit:
- runtime/z2m-runtime-info.json
- runtime/external-converters-current.json
- runtime/z2m-startup-external-converter-lines.txt

Need exact Zigbee2MQTT app version, add-on/container version, zigbee-herdsman-converters version, zigbee-herdsman version, Node version, frontend version if separately available, current external converter filenames/hashes/sizes, actual load order/startup lines, and relevant sanitized external-converter config.
Do not infer Z2M app version from ZHC version.

## P0 — authoritative direct target-device read

Target: `0xa4c13843a9d40f85` / LivingRoomMainDimmer.
Commit machine-readable request/response as `target-live/direct-zcl-read.json`.
Use direct device reads, not state.json/database cache.

Read only:
- EP1 Basic: manufacturerName, modelId, swBuildId, dateCode, appVersion/stackVersion/zclVersion if available, 0xff00 device_config.
- EP1-EP3 genOnOffSwitchCfg: 0x0010 action mode, 0xff00 button type, 0xff01 local relay trigger, 0xff02 assigned relay index, 0xff03 long-press duration, 0xff04 level move rate, 0xff05 bound-device trigger.
- EP1-EP3 genMultistateInput: presentValue.
- EP4-EP6 genOnOff: standard onOff, startupOnOff/power-on behavior if present, 0xff01 indicator mode, 0xff02 indicator state, 0xff03 physical relay mode.

For 0xff03 on current old firmware preserve exact response/error if unsupported. No writes.

## P0 — authoritative raw binding/group topology

Commit:
- target-live/raw-binding-table.json
- target-live/raw-group-membership.json

Binding table must come from paged ZDO Mgmt_Bind / authoritative device binding-table read, not only bridge/devices. Include all pages, table total, source endpoint, cluster, destination mode, destination EUI/group, destination endpoint, raw and normalized EUI serialization, timestamp.
Group membership must be read-only and record group IDs per endpoint. No mutation.

## P0 — live HA/MQTT compatibility consumers

Commit sanitized extracts only:
- ha/target-entity-registry.json
- ha/target-device-registry.json
- ha/pm-socket-entity-registry.json
- ha/automation-consumer-search.json
- mqtt/target-discovery-retained.json
- mqtt/pm-socket-discovery-retained.json

Filter target: 0xa4c13843a9d40f85 / LivingRoomMainDimmer / corresponding HA device and MQTT identifiers.
Filter PM devices: 0xa4c138ba60b92c5f LivingRoomSocketWifiLeft and 0xa4c138c5f07ee732 WorkroomSocketCabinet.

Registry extracts should preserve entity_id, unique_id, platform, device_id, original_name/name, disabled_by, entity_category, and capabilities/device_class when relevant.

Read-only consumer search actual live HA config for LivingRoomMainDimmer, target IEEE, zigbee2mqtt/LivingRoomMainDimmer/action, action entity unique IDs, state_relay_left/middle, relay_left/middle_indicator, both PM device names/IEEEs, and lost PM properties such as power, energy, overload_power_limit.
Search automations, scripts, scenes, packages, blueprints/inputs, relevant .storage entries, and MQTT device-trigger/discovery retained records.
Do not commit unrelated HA config or secrets; commit structured matching path/key/line + sanitized context.

## P0 — actual current UI evidence

Commit under ux/:
1. current target Zigbee2MQTT Exposes page, full scroll coverage;
2. target Bind page;
3. target Groups page;
4. one affected PM outlet Exposes page showing the current reduced/broken surface.

Also commit ux/context.json with viewport, Z2M/frontend version, target friendly name/IEEE, screenshot timestamps. No cookies/tokens.

## P1 — PM firmware/converter provenance

For B28WRPVX devices on `1.2.5-8b8cc492`, commit pm/provenance.json with source repo/branch/commit, artifact hash, converter source path/commit, patch/PR if discoverable, and whether both sockets use identical firmware bytes.
If relevant source files exist only locally and were never committed, copy only those files into pm/untracked-source/ with hashes/provenance. Do not patch them.

## P1 — exact Gate-G served indexes

Commit exact originals if available:
- ota/index_canary.json
- ota/index_recovery.json
- ota/provenance.json

Preserve fileName, fileVersion, fileSize, URL, imageType, manufacturerCode, sha512, index SHA256, served OTA SHA256.
If originals are gone, label reconstruction explicitly and preserve server/request evidence tying original CHECK to source. Do not run OTA UPDATE.

## P1 — current logical light target snapshot

Commit `target-live/logical-targets.json` confirming read-only current intent/topology:
- LEFT -> LR LinearDimmer / group 23;
- MIDDLE -> LR Kitchen table bulbs / group 24;
- RIGHT -> LR Circle light / actual current target/group.

For each record friendly names, IEEE/group IDs, endpoint IDs, genOnOff/genLevelCtrl binding, whether MainDimmer relay endpoints are group members, and any empty/dead group. No repair.

## Do not design

Executor should not propose new converter architecture, firmware API, HA automations, labels, migration algorithms, binding cleanup, PM implementation, or action implementation. Record unexpected facts, but do not fix them.

## Completion condition

Executor returns only:
- evidence branch/commit SHA;
- manifest path;
- unavailable items + why;
- captured facts that contradict existing assumptions.

Once P0 is committed, Supervisor proceeds with redesign and all coding.