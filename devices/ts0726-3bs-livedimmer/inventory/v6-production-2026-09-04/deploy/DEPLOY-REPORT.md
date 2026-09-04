# PRODUCTION DEPLOYMENT & SETTINGS ATTEMPT — 2026-09-04 10:01–10:27Z (phase 2 of this WU)

Operator released the gate after route recovery ("fresh read should be available now
proceed"), confirmed the mid-outage drift was their own manual pokes, and scoped
this phase to: deploy converter + apply frozen profile incl. `0xff05=0` +
RIGHT mains -> Follow logical state, **skip blind EP3 unbinds**.

## Sequence executed

| # | Action | Result |
|---|---|---|
| 1 | Gate-C decisive snapshot (`gate-c/gate-c-snapshot.json`, 08:52Z) | **HEALTHY** — swBuildId fresh `1.1.6-bseedv6`, config canonical, standard 2/2/2 per-EP, 22/22 property reads answered |
| 2 | Safety-restore RIGHT mains drift (`gate-c/restore-right-mains.json`) | `Follow logical state` -> `Always on`, stable across re-reads; logical state OFF |
| 3 | Backup live transition -> `backup-production-20260904/` | sha256 `a2a40497` (== transition) preserved (two copies) |
| 4 | Install `converter_lib/bseed_ts0726_v56_hardened.js` (`a2a40497`) + `external_converters/bseed_ts0726_v6_production.js` (`82a1197e`) | hashes verified in-container; pre-restart require-test loaded exactly 1 definition with both fingerprints |
| 5 | Move `bseed_ts0726_v5.js` out of auto-load + **ONE restart 10:01:32Z** | frontend 200; production converter loaded; v5 not loaded; target = EC-GL86ZPCS31 production; HA discovery shows 4-option `binded_mode` incl. "Never (disabled)" |
| 6 | Apply frozen profile (`deploy/apply-profile-steps.json`) | **16/17 steps read back OK** (LEFT & MIDDLE complete incl. correcting LEFT action Toggle->Match, *raw-verified* via final reads; RIGHT LED/update/channel set) — step 17 FAILED (below). Caveat: applier freshness detection can accept retained publishes; RIGHT `action_mode` step saw cached "Toggle" and skipped its SET — final RAW shows live 0xff06=3 (Match), profile wants 2 (Toggle). No corrective write issued: it is inert while bound-control is NOT disabled and finalize is withheld; further poking deferred to Supervisor |
| 7 | `switch_right_binded_mode = Never (disabled)` (root topic, endpoint-scoped topic, repeated) | **DEVICE DOES NOT RETAIN `0xff05=0`** — raw EP3 read `65285=3` at +0/+10/+40 s across all attempts, **no ZCL write error logged**; production converter's optimistic state publish confirms ITS write path executed `0xff05=0` |
| 8 | STOP before bind removal / RIGHT mains flip | per §6 ordering + operator scope (no blind unbinds anyway) |
| 9 | Final raw verification (`gate-c/final-raw-verify.json`, 10:27Z) | standard **2/2/2** · custom 0xff06 **3/3/3** · 0xff05 **3/3/3** · identity/config canonical · EP4/5/6 raw `65283` generic reads TIMED OUT (mains truth = device's own typed readers in its 10:2x publishes: `65283:1` x3 — NOT claimed from the timeout) |

## Blocking finding (new, firmware-side)

**V6 firmware `1.1.6-bseedv6` does not persist `genOnOffSwitchCfg/0xff05 = 0`**
(`switch_cluster.c` registers the attr WRITABLE with no clamp in
`switch_cluster_on_write_attr`, yet EP3 retains 3 after ACKed writes; Z2M logged no
write error). The ZCL-level write status needs `debug` capture or a stub-HAL test
to localize — both outside this phase's authorization (raw-write and debug-config
forbidden). Consequently:

- brief §6 "Require: EP3 0xff05 = 0" CANNOT be satisfied by policy write
- RIGHT pure-relay premise (brief §2) therefore unmet
- bind removal NOT attempted (also unobservable — no binding-table read exists
  on Z2M 2.14; Step 6.1's preserve precondition fails regardless)
- RIGHT mains NOT flipped to Follow logical state (irreversible energize step
  predicated on pure-relay finalization; LEFT/MIDDLE untouched at Always on)

## As-left device state (authoritative raw reads, 10:27Z)

```text
definition   = bseed_ts0726_v6_production.js (PRODUCTION wrapper, deployed, healthy)
standard     = 2/2/2 (0x0010 EP1/2/3)
custom       = 3/3/3 (0xff06; RIGHT action ended at Match-local-state, profile wanted Toggle(2) — inert discrepancy, NOT thrashed further)
binded       = 3/3/3 (0xff05; RIGHT remains "Short press", profile wants 0=Never — BLOCKED by firmware finding)
mains policy = LEFT Always on / MIDDLE Always on / RIGHT Always on (energized-safe; final flip withheld)
indicators   = Binding status / Binding status / Physical output
channels     = Left / Middle / Right
topology     = UNTOUCHED (zero bind/group ops; on-device table unobservable post-rejoin)
logical      = OFF/OFF/OFF
```

## Rollback (armed, not needed for service health)

Service health did NOT regress, so the §5 restore clause is not triggered.
Optional rollback: `cp backup-production-20260904/bseed_ts0726_v5.pre-production-transition.js
config/zigbee2mqtt/external_converters/bseed_ts0726_v5.js`, remove
`bseed_ts0726_v6_production.js` from external_converters, one restart.

## Follow-up recheck (12:03:29Z, `fresh-ff05-recheck-120329Z.json`) — blocker CONFIRMED + cache-lie found

Fresh raw ZCL re-reads, no writes: **EP3 `0xff05 = 3`** (left/middle also 3;
EP3 standard `switchActions = 2` intact). Meanwhile Z2M `state.json` cache
advertises `switch_right_binded_mode = "Never (disabled)"` (both base and
`_switch_right` keys) — the production converter's convertSet returns the
optimistic `{state}` and Z2M persists it although the device never retained the
value. **Safety consequence:** any HA/MQTT consumer currently sees RIGHT
bound-control as DISABLED when the device still acts on it (Short press). Until
the firmware accepts `0xff05=0`, the exposed property must not be treated as
device truth; a raw `read` (65285) is the only reliable check. No further blind
SETs attempted (each would re-pollute the cache with the same false value).
