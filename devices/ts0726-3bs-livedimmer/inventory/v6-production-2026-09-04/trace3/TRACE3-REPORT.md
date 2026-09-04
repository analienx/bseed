# TRACE-3 — ruling `5543052507` execution + **probe-routing defect found; the "revert" is retracted**

Date 2026-09-04 16:07–16:19Z. Authorizes-and-executes: Task 2 (0xff00 reads), Task 3
(one bounded debug SET trace, revert-localization). Task 1 (v7 tests/builds) reported
separately by the firmware workstream in the same return.

## Task 2 — switch type (`0xff00`): PASS
```text
EP1=1 EP2=1 EP3=1  (MOMENTARY) — endpoint-scoped raw reads, switch-type-0xff00.json
```
Ruling §C precondition satisfied; TOGGLE double-act hypothesis excluded for all channels.

## Task 3 — trace executed exactly as bounded, then the frames changed the story
Executed: debug hot-enable → 2 baseline reads → **ONE** SET `Never (disabled)` →
polls → restore `log_level: info` (proven, configuration.yaml re-read) → segment saved
(`revert-trace.json`, `revert-segment.log`, 137 KB, 532 lines).

Decisive frame-level evidence from the debug segment (log-local +02:00):
```text
18:09:12 my poll reads, issued to ROOT /set with endpoint:"switch_right", were ROUTED:
    ZCL 0xa4c13843a9d40f85/1 genOnOffSwitchCfg.read([65285])   ← EP1!
18:09:12 converter's own post-write readback (meta pinning, correct):
    ZCL 0xa4c13843a9d40f85/3 genOnOffSwitchCfg.read([65285])
18:09:13 readResponse {"65285":0} FROM ENDPOINT 3              ← EP3 accepted the write
18:09:17 my poll rv3_p → /1 → {65285:3}                        ← that "3" was EP1 (LEFT)
```
**Z2M 2.14 core generic `read` on the root `/set` topic ignores the payload `endpoint`
field and uses the device's first endpoint.** Every root-topic "per-EP" claim in this
session's earlier phases therefore measured EP1 and is VOID for EP2/EP3.

Corrected verification (endpoint-scoped topics, `ep3-endpoint-scoped-poll.json`,
`authoritative-endpoint-reads.json`, 16:13–16:18Z):
```text
EP3 0xff05: 0 at 16:13:52, 16:14:24, 16:14:56, 16:18:57   ← HELD ≥10 min post-SET
EP1 0xff05: 3 (correct for LEFT)   ; EP2: 3 (correct)
standard 0x0010 = 2/2/2 ; custom 0xff06 = 3/3/2 (RIGHT=Toggle per profile)
swBuildId 1.1.6-bseedv6
(The 15:17Z SET's converter-side readback also returned EP3=0; the 15:17-16:09 gap was
only ever sampled with the flawed mechanism, so no claim is made for that window.)
```

## Retraction chain (mine, in order, explicitly)
1. Phase 2 claim "device retains 3 / does not persist 0" — **WRONG**: decay/fresh-reads
   were EP1 reads.
2. Phase 3 claim "accepted then asynchronously REVERTS to 3 within ≤3.5 min" — **WRONG**:
   the "revert samples" were EP1. **EP3 accepted 0 and has held it.**
3. The "cache-lie" escalation (state.json showing Never while device 'really' 3) —
   **DOWNGRADED**: device truth for EP3 was 0; the retained value AGREED with the device.
   The convertSet-optimism weakness is still real (code-proven; fixed by 9070072's
   readback-publish) but this instance was not an actual lie.
4. Property-GET behavior: "GET republishes retained without re-decoding" — still TRUE
   (convergence-isolated), which is what made the phantom-3 story self-consistent.

## Answer to the ruling's one question
**Neither.** No other MQTT `/set` writer touched the device in-window (segment shows
only my 4 messages + 1 converter publish), no ZDO/rejoin/restart/route-error frames,
and no `3` ever arrived at EP3. There is no revert to localize; the observed `3`s were
EP1 due to the core routing quirk above. EP3 was verified `0xff05=0` held continuously
for ≥10 min after the 16:09 SET (and the 15:17 SET's converter-side readback also
returned 0); the 15:17–16:09 gap was only ever sampled with the flawed mechanism, so no
claim is made for that window.

## What remains genuinely open (ruling §B stands)
- **Cross-reboot persistence is still unproven** (ignored `hal_nvm_write()` return +
  load path) — the new power-cycle persistence gate is the correct requirement; my
  in-RAM holding result does NOT discharge it.
- §D normalization of invalid binded_mode values, §F V5 identity-gate hardening, §G
  version floor — unaffected firmware-side requirements.
- §H: with EP3 genuinely 0 and v7's no-transmit guard behaviorally proven, blind EP3
  unbind remains unnecessary. Production RIGHT finalize now needs: the v7 build + the
  reboot-persistence gate, not another live SET.

## As-left state (unchanged; safe)
RIGHT `0xff05=0` (held), mains `Always on` (flip still withheld per ruling until V7 +
persistence gate), logical OFF; LEFT/MIDDLE `3` + final profile; standard 2/2/2; ABI/
identity canonical; log level restored info (proven); binds untouched; SETs this phase:
exactly one. Rollback armed (backup-production-20260904/).
