## SUPERVISOR RULING — V7 software canary ACCEPTED; proceed to physical acceptance, then HA v2 + closure

The previously referenced `5545453943` is not present in this repository. Treat that anchor as void. This comment is the authoritative replacement.

I accept executor return `5545339859` and evidence `cd807fff34258775bc6ebbbbcdd5a04c00020a63`.

### Software canary status: GREEN

The release-critical software gates are now closed:

- production converter `71077dc...` recognizes exact V5/V6/V7 identities and V7 uses the audited `0xff06` transport;
- V7 OTA completed and the target is running `swBuildId=1.1.7-bseedv7` / `fileVersion=285356041`;
- recovery remains below it at `285356040` and was not co-exposed;
- canonical `device_config` survived;
- switch type is `0xff00=1/1/1` MOMENTARY;
- decisive real-hardware persistence proof is complete: **post-firmware-reboot `0xff05=3/3/0`**, so RIGHT `Never/disabled` survives NVM reload;
- RIGHT mains policy was then changed to **Follow logical state** and is resting logical OFF / physical OFF / LED OFF;
- LEFT/MIDDLE remain Always on and were not disturbed;
- bindings/groups were untouched.

The earlier supposed `0xff05` revert remains conclusively retracted; it was the endpoint-misrouted probe, not firmware behavior.

### ONLY remaining release gate: operator physical acceptance

Executor: orchestrate logging/readbacks, but do not infer observations the operator has not made.

Run one bounded acceptance capture with no topology mutation:

1. **LEFT short press** — operator confirms its intended bound light changes exactly once. Verify LEFT mains policy remains Always on and no unexpected local physical-power change is reported.
2. **LEFT hold/release** — operator confirms expected bound-light dim Move while held and Stop on release.
3. **MIDDLE short press** — same: intended bound light changes exactly once; mains remains Always on.
4. **MIDDLE hold/release** — expected Move + Stop.
5. **RIGHT short press OFF→ON** — operator confirms exactly one local relay actuation and LED follows physical output. Executor simultaneously proves no outbound bound OnOff or Level command from RIGHT while `0xff05=0`.
6. **RIGHT short press ON→OFF** — same proof; leave final state **RIGHT logical OFF / physical OFF / LED OFF**.
7. Optional but useful: one RIGHT hold/release while disabled, with log proof of no bound Level Move/Stop. Do not require it if the two short-press checks plus the already load-bearing V7 test provide sufficient physical confidence; do not extend scope unnecessarily.

**Stop only for a real acceptance failure**: double actuation, LEFT/MIDDLE power interruption, RIGHT failing to control its local relay/LED, or any RIGHT bound OnOff/Level traffic.

### After operator says physical acceptance PASS

Proceed automatically; no further supervisor round-trip is required unless a regression appears:

1. Deploy staged HA v2 from `analienx/home-assistant-stack` branch `supervisor/ts0726-post-migration-ha-v2`, commit `9472e5b2825e0c1db5705f2b0b2f63349fb09864`.
2. Verify HA v2 reconciles **LEFT/MIDDLE only** and does not mutate RIGHT, mains policy, bindings/groups or `device_config`.
3. Run final regression/readback:
   - V7 identity/version intact;
   - `0xff00=1/1/1`;
   - `0xff05=3/3/0`;
   - LEFT/MIDDLE Always on;
   - RIGHT Follow logical state;
   - RIGHT final OFF / LED OFF;
   - no converter errors;
   - Z2M healthy.
4. Update the BSEED ledger/status to the actual V7 production state and close issue #8 if all checks pass.

### Explicitly DEFERRED — not blockers for this canary

- attributable `consts.h` uncrustify formatting cleanup;
- network-dependent TC32 toolchain bootstrap / reproducible-toolchain packaging;
- the two shipped Node probe helpers still hard-pinning two fingerprints;
- OTA attempt-1 route failure / mesh health: record or move to the existing mesh/routing investigation, but it does not invalidate the successful identical-image retry or V7 result;
- generic invalid-value/NVM hardening and other upstream-quality work already identified.

Do not turn any of the above into another pre-acceptance cycle.

**Ruling: V7 software canary ACCEPTED. Physical acceptance is the sole remaining release gate.**
