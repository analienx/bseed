# V6 PRODUCTION FINALIZATION — EXECUTOR WORK UNIT (2026-09-04)

Dispatch: `analienx/bseed` issue #8, comment `5532365230` (Supervisor —
"production finalization prepared; current blockers remain; final profile
updated to pure-relay RIGHT"), closing blockers from `5531743986` first.

Target: `LivingRoomMainDimmer` / `0xa4c13843a9d40f85` / `iedhxgyi` `TS0726-3-BS`
Firmware: `1.1.6-bseedv6` / build `285356039` (cache-corroborated; see Gate C).

## Verdict

```text
GATES A-C: B PASS · A PASS (durably recovered from live logs; see CORRECTION below) · C FAIL(route-degraded) => STOP
Production deployment NOT authorized (brief gates it on A+B+C all-PASS; C is the blocker).
NO converter deployment, NO restart, NO settings writes, NO bind/unbind
mutation, NO RIGHT hard-power activation, NO recover-flash performed.
```

> **CORRECTION (2026-09-04, same day, later session hour):** the first pass of this
> work unit reported Gate A as NOT-CLOSABLE-AS-SPECIFIED. That was WRONG and is
> retracted below in section "Gate A". Durable per-EP standard-ABI evidence DOES
> exist in the live logs and state; the recovery satisfies the Supervisor's
> option 1. The Gate C STOP stands unchanged.

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

## Gate A — durable standard-ABI proof (EP1/2/3 genOnOffSwitchCfg 0x0010 = 2) — PASS via recovery

**Retraction of this unit's earlier verdict:** "durable evidence does not exist;
the WU5 mechanism exists nowhere on this runtime" — **FALSE**. It came from (a)
an evidence-agent log search whose token list omitted `abi_switchactions`, and
(b) my own cmd-mangled `/app/dist` greps misread as clean negatives. Corrected
evidence, verbatim lines and honest limits: `gate-a/STANDARD-ABI-EVIDENCE.md`;
machine dump `gate-a/abi-read-lines-recovered.json` (253 EP-tagged publishes,
13 `Read result of 'genOnOffSwitchCfg': {"switchActions":2}` lines, 9 outage-era
`read([16])` timeout errors, all timestamped from retained WU5 windows).

Recovered proof (host-local +02:00):

```text
PRE policy-restart (window 2026-09-03.21-04-51):
  EP1(left)   {"switchActions":2} first 21:07:46  (40 EP-tagged publishes)
  EP2(middle) {"switchActions":2} first 21:07:57  (38)
  EP3(right)  {"switchActions":2} first 21:08:09  (36; all-three-keys publish)
POST policy-restart (window 2026-09-03.21-13-34, boot 21:13:34):
  fresh Read-result lines 21:14:48 / 21:14:58 / 21:15:10 (10 s per-EP cadence)
  EP-tagged publishes x213 per key through 21:33:28
OUTAGE RE-PROBES (not counter-evidence): 9x read([16]) timeouts 21:45:16-22:02:28
PERSISTENT: /config/zigbee2mqtt/state.json (sha256 58bb3401...) still holds all
  three abi_switchactions_* keys = {"switchActions": 2} on 2026-09-04
```

`switchActions` is the ZCL standard name for genOnOffSwitchCfg `0x0010` (custom
attrs decode as 65280/65285/65286, never `switchActions`); the failed outage
twins show the exact request form (`0xa4c13843a9d40f85/N
genOnOffSwitchCfg.read([16])`, EP-tagged `/1 /2 /3`). WU5's "2/2/2" narrative
was true; its committed sentinel files recorded only the LAST (outage) attempts
— which is precisely why the Supervisor demanded recovery from the logs, and
this recovery satisfies that option 1.

The mechanism is Z2M core's `set 'read'` + `state_property` (converter-
independent, read-only). Once routes return it can re-prove Gate A live and
fits the Gate C snapshot fields; no converter improvisation is needed.

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

Sections 5–7 of the dispatch are gated on A–C PASS. B and A now pass; **C fails
on route** — single remaining blocker. Nothing installed, nothing restarted,
no `/set`, no bind/group mutation, no OTA. HA v2 remains staged.

## Additional disclosures

1. 2.14.0-1 add-on update landed DURING WU5 at the 21:04:51 transition restart
   (startup banner evidence) — WU5's "ZHC 26.90.0 validated" note applies to the
   pre-restart era only; Gate B above now covers 26.103.0 formally.
2. Live `switch_custom.js` on disk = `e178e68a…` / 912,912 B, differing from
   STATUS.md Gate-F ledger value (967,427 B / `50d135be…`); it does not govern
   the target while BSEED wins by fingerprint+priority, but the ledger needs
   reconciliation.
3. Host/container staging dirs for this work unit (`/tmp/v6prod-20260904*` +
   probe copies) were **torn down** after evidence retrieval; `/config` was
   never touched this unit (verified post-run: external_converters unchanged,
   no converter_lib dir).

## Return

```text
GATE_B(runtime_zhc_26_103)=PASS
GATE_A(standard_abi_durable_evidence)=PASS_RECOVERED (2/2/2 pre AND post policy restart; see gate-a/)
GATE_C(fresh_pre_production_snapshot)=FAIL_ROUTE_DEGRADED
PRODUCTION_DEPLOYMENT=NOT_AUTHORIZED (C outstanding)
DEVICE_MUTATIONS=NONE
evidence=<commit sha of this commit>
STOPPED — per dispatch: do not recover-flash; wait for mesh investigation
```

## Artifacts

```text
gate-a/            STANDARD-ABI-EVIDENCE.md (recovered proof + limits) +
                   abi-read-lines-recovered.json (275 raw log lines)
gate-b/            composition scan, installed-ZHC probes (live+prod files),
                   production probe, pytest+mock transcripts, bridge captures
                   + merged descriptors (07:19Z)
gate-c/            read-only route-health GET snapshot (TX/RX transcript, 07:40Z)
gate-a-evidence-absence-report.txt   SUPERSEDED first-pass absence audit (kept
                   for audit trail; its log token list omitted abi_switchactions)
scripts/           all probe/capture/recovery scripts used (re-runnable)
```
