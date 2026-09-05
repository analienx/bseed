# Topology accounting correction — `attr0` semantics (Supervisor audit #2)

Commit: this file accompanies the raw evidence in
`accept/raw-reportings-preRejoin-24677.txt` and the source-code excerpts below.

## Correction of my earlier statements

In status `5546622116` I wrote that the pre-rejoin baseline had "20 bindings +
**10** reportings" and that I omitted "**two** `attr0` records". Both numbers were
wrong. Correct accounting, straight from the herdsman raw store:

- Pre-rejoin baseline = **20 bindings + 9 configured-reporting records**.
- The 9 = 3 × `genMultistateInput/0x0055 presentValue` (EP1/2/3)
        + 3 × `genOnOff/0x0000 onOff` (EP4/5/6)
        + 3 × `genOnOff/0xFF02` **(vendor)** (EP4/5/6).
- Each relay endpoint carried **two** reportings: standard `onOff` and vendor `0xFF02`.

## What `attr0` actually is — PROVEN distinct from `onOff`, NOT a duplicate

The bridge/`configured_reportings` view labels one of the two relay records
`attr0` and the other `onOff`. I previously assumed `attr0` was a byte-duplicate of
`onOff` (attribute `0x0000`). **That assumption was wrong.** Two independent proofs:

1. **Raw store values** (`database.db.backup`, device `nwkAddr 24677`, the *original*
   pre-rejoin record set):
   ```
   EP4 cluster=6 attrId=65282 (0xFF02) min=0 max=65000 chg=1   <-- labelled "attr0"
   EP4 cluster=6 attrId=0     (0x0000) min=0 max=65000 chg=1   <-- labelled "onOff"
   ```
   The two records have **different `attrId`** (`0xFF02` vs `0x0000`). They are different
   attributes.

2. **Label-minting code** (`zigbee-herdsman` 10.9.1,
   `dist/controller/model/endpoint.js:83-95`):
   ```js
   const attribute = Zcl.Utils.getClusterAttribute(cluster, entry.attrId, entry.manufacturerCode)
       ?? { ID: entry.attrId, name: `attr${index}`, type: UNKNOWN, ... };
   ```
   `0xFF02` is **not in genOnOff's attribute table** → `getClusterAttribute` returns
   `null` → the fallback synthesizes `name = attr${arrayIndex}`. On each relay EP the
   `0xFF02` record sits at index 0, so it renders as `attr0`.
   **`attr0` therefore denotes vendor attribute `0xFF02` (indicator LED-mode), NOT `0x0000`/`onOff`.**

`0xFF02` is this device's `relay_*_indicator_mode` (indicator LED mode) — consistent
with the documented custom-cluster map. So the third reporting per relay endpoint is an
LED-mode-change report, a **unique, non-redundant** semantic.

## Consequence for the restore claim — I retract "exact/byte-equivalent"

My operator-authorized restore (`restore-bindings.js`) re-added **6 of 9** reporting
records: all 3 switch `presentValue` and all 3 relay `onOff`. It did **not** (and via the
supported API **cannot**) re-add the 3 relay `0xFF02` vendor LED-mode reportings.

- **The BINDING table (20 entries) is a full, verified restore** (readback = 6/6/3/2/2/1,
  see `bindings-post-restore-readback.json`).
- **The REPORTING table is a functional-priority restore (6/9), NOT byte-equivalent.**
  I will stop calling the overall topology restore "exact."
- Reason it cannot be done via the standard path: Z2M `bridge/request/device/configure_reporting`
  calls herdsman `configureReporting`, which for a **string/number** attribute does a
  cluster lookup (`getClusterAttribute(genOnOff, 65282)` → null) and throws
  `Invalid attribute` (`endpoint.js:580`). A vendor `0xFF02` report is only establishable
  through the base Tuya/`EC-GL86ZPCS31` definition's own `configure()` (which sends it with
  an explicit dataType/object attribute), or a re-interview. It is **not** reachable through
  the generic bridge API I used.

## Is the missing 0xFF02 reporting functionally harmful? — No, and I recommend leaving it

`0xFF02` here is a **reporting config**, not a control or state path:
- LED-mode is **written** via SET and its value is **tracked in the runtime store**
  (`relay_*_indicator_mode`) — none of that depends on the report.
- The device is not expected to spontaneously change its own LED mode, so the absence of a
  change-report means only that *external* LED-mode edits won't push a live report to the
  coordinator. No control behavior, no `action`, and no relay-state flow is affected —
  all of which were verified working post-restore.

**Recommendation:** do NOT chase a byte-exact 0xFF02 report through a raw/manufacturer
`configReport` (would require bypassing the supported bridge API and hand-crafting a
vendor attribute — added risk, zero functional benefit for this device's use). If exact
parity is nonetheless desired, the clean route is a base-definition `configure()` /
re-interview, which is a device mutation I will only perform on explicit go.

## Net for closure
- Bindings: 20/20 restored + verified. ✔
- Reporting: 6/9 restored (full control/state/`action` path); 3 vendor LED-mode reports
  not restored and not required. Accurate status, no device change recommended.
- My earlier "exact/byte-equivalent restore" wording is retracted; "20 + 10" is corrected to "20 + 9".
