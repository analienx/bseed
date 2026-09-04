# V6 PRODUCTION FINALIZATION — EXECUTOR WORK UNIT (2026-09-04)

Dispatch: `analienx/bseed` issue #8, comment `5532365230` (Supervisor —
"production finalization prepared; current blockers remain; final profile
updated to pure-relay RIGHT"), closing blockers from `5531743986` first.

Target: `LivingRoomMainDimmer` / `0xa4c13843a9d40f85` / `iedhxgyi` `TS0726-3-BS`
Firmware: `1.1.6-bseedv6` / build `285356039` (cache-corroborated; see Gate C).

## Verdict

```text
GATES A-C: B PASS · A NOT-CLOSABLE-AS-SPECIFIED · C FAIL(route-degraded) => STOP
Production deployment NOT authorized (brief gates it on A+B+C all-PASS).
NO converter deployment, NO restart, NO settings writes, NO bind/unbind
mutation, NO RIGHT hard-power activation, NO recover-flash performed.
```

## Gate B — exact live runtime probe (Z2M 2.14.0-1 / ZHC 26.103.0) — PASS

All probes run INSIDE the live container against the ACTUAL installed
`zigbee-herdsman-converters@26.103.0` (`bridge/info` + `package.json` read from
the running system; add-on `ghcr.io/zigbee2mqtt/zigbee2mqtt-aarch64:2.14.0-1`,
ZH 10.9.1). No Zigbee traffic, no restart (offline spy-based + in-memory
composition only). Evidence in `gate-b/`.

| Supervisor requirement | Result | Artifact |
|---|---|---|
| one target definition only (V6 target matches exactly one transition/production definition) | PASS | `composition-scan.json` |
| no broad TS0726 fallback collision | PASS — with BSEED sets loaded the priority-100 fingerprint wins; without BSEED the legacy `switch_custom.js` generic EC-GL86ZPCS31 matcher still answers (recorded as `broadFallback` context) | `composition-scan.json` |
| one custom genBasic registration | PASS (`localCustomClusterRegistrationCount: 1`, ID 0x0000) | `installed-zhc-probe-live.json`, `installed-zhc-probe-prod.json` |
| zero custom genOnOffSwitchCfg registrations | PASS (same files; probe fails closed otherwise) | both probe JSONs |
| V6 binding transport = 0xff06 | PASS | `production-probe.json`, `transition-mock-probe-local.json` |
| fresh swBuildId gate fail-closed | PASS (identity-read-first, NO_RESPONSE->fail-closed, unknown-build->fail-closed) | `production-probe.json`, local mock run log below |
| frontend expose processing = PASS | PASS (29 key exposes processed under installed ZHC; live frontend healthy: HTTP 200 on 8099, container `Up (healthy)`) | `installed-zhc-probe-*.json` + recon |
| fleet no-regression: LIVE->PROD delta | **1 device = target only** (0 outside target); no other fleet device resolves to any BSEED definition under PROD set | `composition-scan.json` |

Supervisor production candidate proven byte-exact before any live use:

```text
repo   = analienx/tuya-zigbee-switch @ production/ts0726-v6
head   = d50fd53db168bc403d89ece2fe3692a8d860d280
wrapper blob 96647931368b2cde72c31d37a4b05fd986d72199  sha256(LF) 82a1197e2ba77501762b50341cf715b2e76dc5bb4de0457980cd30e83c8bd0f1
base   blob ed8ee78f882c936afd9a4008ed4f70559c3a5cf7  sha256(LF) a2a404974dcc3998a05b3862bfe2714aea197e0cf843eb03c191dee07a30fa92
         == byte-identical to the LIVE hardened transition file
         (/config/zigbee2mqtt/external_converters/bseed_ts0726_v5.js)
profile = zigbee2mqtt/production/ts0726-v6-profile.json (LEFT/MIDDLE symmetric, RIGHT pure-relay)
```

Offline contract tests: `pytest -q tests/test_bseed_ts0726_v6_production_profile.py`
=> **5 passed** (Windows host, repo root; transcript `gate-b/local-pytest-run.txt`).
Local mock transition probe
(`probe_bseed_ts0726_v56_transition.js` against the hardened base) => PASS with
`identityReadFailureFailsClosed: true`, `staleCacheIgnored: true`,
`v6.customAttribute: 0xff06` (`gate-b/transition-mock-probe-local.json`).

## Gate A — durable standard-ABI (EP1/2/3 genOnOffSwitchCfg 0x0010 = 2) — NOT CLOSABLE AS SPECIFIED

Two independent findings, both evidence-backed:

1. **The durable evidence the brief hoped to recover does not exist.**
   Full-coverage search of the live Z2M log rotation AND the archived host-side
   WU5 bundles (per-file line counts and first/last timestamps in
   `gate-a-evidence-absence-report.txt`): every retained log is `info` level;
   `readResponse`/`attributeReport`/`0xff06`/raw-frame tokens = 0 occurrences;
   the explicit endpoint-scoped `genOnOffSwitchCfg.read([16])` (= 0x0010)
   attempts (9x EP1/EP2/EP3, 21:45–22:02 local Sep-3) ALL timed out; the only
   2-valued `{"switchActions":2}` read-results (13x, 21:07–21:15 local) predate
   the outage but are **not endpoint-attributable at info level** — the committed
   `abi-standard-reads.json` / `final-standard-reads.json` (NO_RESPONSE x3)
   remain the only endpoint-labeled files and they contradict the WU5 narrative.
2. **The described WU5 re-probe mechanism cannot exist on this runtime.**
   `read_switch_*` / `state_property` / `abi_switchactions_*` appears nowhere in
   Z2M 2.14.0-1 `/app/dist`, in the live transition converter (blob `ed8ee78f`),
   or anywhere on the host (`grep -r` of /config + /mnt/data). On V6 the
   hardened converter's only public action-property GET reads **custom 0xff06**
   (transport chosen by fresh `swBuildId`); there is NO public property that GETs
   standard 0x0010 on V6, Z2M 2.14 has no legacy raw-read API, and the installed
   WindFront build exposes no DevTools/ZCL-passthrough surface. Re-running the
   "same read-only /set probes" cannot produce standard-0x0010 evidence with the
   current converter + runtime — even with a healthy route.

=> Gate A needs a Supervisor ruling: an authorized read path for standard 0x0010
(e.g. a probe-only higher-priority definition or a converter surface exposing
standard-action GET + EP-tagged state publish, `debug` log capture, or accepting
the WU4/WU5 custom-0xff06 + V5-era standard 2/2/2 chain as the release proof).
NOTHING was improvised on the live system to force this closed.

## Gate C — fresh pre-production snapshot — FAIL: target does not answer fresh reads

Fresh read-only probe at `2026-09-04T07:39–07:40Z` (empty-payload
`zigbee2mqtt/LivingRoomMainDimmer/get`, full TX/RX transcript in
`gate-c/route-health-get-snapshot.json`):

```text
availability topic: {"state":"online"}   (retained, inbound)
GET accepted by Z2M (TX logged)
device answered NOTHING within 40 s — 13/13 requested properties missing
target is a mains Router (rx_on_when_idle): failed direct read => broken
coordinator->device return route, corroborating the log forensics below.
```

Corroborating live-side facts (read-only recon + `gate-b/bridge-devices.json`
captured 07:19Z):

```text
- device rejoined overnight with NEW nwk 24677 -> 17007; early-morning outbound
  commands still targeted stale 24677 and timed out; 0 ROUTE_ERROR lines for the
  target since 22:53 local Sep-3, but also ZERO successful target reads.
- last device-confirmed transaction: interview success 06:56Z + ZCL response
  (UNSUPPORTED_ATTRIBUTE on an onOff read of EP1 — app-layer round trip).
- NO successful genOnOffSwitchCfg read since Sep-3 21:15 local.
- bridge/devices now reports bindings: [] on ALL SIX endpoints and
  configured_reportings: [] fleet-wide-for-target (Sep-2 capture had EP1/2/3
  coordinator + light + group-25 bindings). Z2M bind CACHE is empty post-
  rejoin; the on-device binding table is UNKNOWN until a fresh read is possible.
```

Per the brief: **"If route health is still bad: STOP. Do not recover-flash."**
The RIGHT pure-relay bind procedure additionally REQUIRES preserving exact EP3
records BEFORE removal — impossible with an unknown/empty table. Proceeding
would risk unrecoverable topology loss. STOP is mandatory on both counts.

Disclosed while-not-trusting cache: `state.json` cache holds
`relay_right_physical_mode="Follow logical state"` with a divergent sibling key
`"Always off"` — unverified cache only; RIGHT hard-power has NOT been
authorized-applied in this work unit and the cache must not be treated as such.

## Production converter, settings, topology — NOT STARTED

Sections 5–7 of the dispatch are gated on A–C PASS. B passes; A is structurally
unclosable as specified; C fails on route. Nothing installed, nothing restarted,
no `/set`, no bind/group mutation, no OTA. HA v2 remains staged.

## Additional disclosures

1. 2.14.0-1 add-on update landed DURING WU5 at the 21:04:51 transition restart
   (startup banner evidence) — WU5's "ZHC 26.90.0 validated" note applies to the
   pre-restart era only; Gate B above now covers 26.103.0 formally.
2. Live `switch_custom.js` on disk = `e178e68a…` / 912,912 B, differing from
   STATUS.md Gate-F ledger value (967,427 B / `50d135be…`); it does not govern
   the target while BSEED wins by fingerprint+priority, but the ledger needs
   reconciliation.
3. Host/container staging dirs for this work unit: `/tmp/v6prod-20260904/`
   (host + container), inert scripts + capture outputs only, nothing in
   `/config`; tear-down is `rm -rf /tmp/v6prod-20260904` on host and
   `docker exec app_45df7312_zigbee2mqtt rm -rf /tmp/v6prod-20260904
   /tmp/v6prod-20260904-stage`.

## Return

```text
GATE_B(runtime_zhc_26_103)=PASS
GATE_A(standard_abi_durable_evidence)=NOT_CLOSABLE_AS_SPECIFIED -> SUPERVISOR RULING REQUIRED
GATE_C(fresh_pre_production_snapshot)=FAIL_ROUTE_DEGRADED
PRODUCTION_DEPLOYMENT=NOT_AUTHORIZED (gates not all PASS)
DEVICE_MUTATIONS=NONE
evidence=<commit sha of this commit>
STOPPED — per dispatch: do not recover-flash; wait for mesh investigation
```

## Artifacts

```text
gate-b/            composition scan, installed-ZHC probes (live+prod files),
                   production probe, bridge captures + merged descriptors (07:19Z)
gate-c/            read-only route-health GET snapshot (TX/RX transcript, 07:40Z)
gate-a-evidence-absence-report.txt   live-log coverage table + bundle audit
scripts/           all probe/capture scripts used (re-runnable)
```
