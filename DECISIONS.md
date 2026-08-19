# Engineering decisions

## D-001 — Supervisor/executor split

**Decision:** Supervisor owns architecture/code; local Executor performs bounded execution and evidence collection through GitHub issues.

**Reason:** the Supervisor cannot directly perform local hardware/runtime operations and the Executor must not improvise safety-critical work.

## D-002 — Persistent control channel

**Decision:** GitHub issue #1 is the authoritative mutation ledger.

**Protocol:** PROPOSAL → Supervisor `APPROVED` → RESULT, or BLOCKED on surprise.

## D-003 — Electrical safety boundary

**Decision:** no energized exposed-PCB probing is permitted in this project.

**Allowed:** unpowered continuity/resistance on an unplugged PCB; fully assembled energized plug-in calibration through an external reference meter.

## D-004 — Meter architecture

**Decision:** implement for Belling BL0937 pulse interface (`CF`, `CF1`, `SEL`). Do not pursue BL0942/UART architecture unless later hardware evidence contradicts the photographs.

## D-005 — Do not blindly merge upstream PR #314

**Decision:** treat PR #314 as historical/source material rather than blindly merging it.

**Reason:** a later downstream fork now contains the complete Telink pulse-counter + metering implementation and has been hardware-tested on the exact `_TZ3000_b28wrpvx` family. PR #314 remains useful provenance, but it is no longer the shortest implementation path.

## D-006 — Diagnostic-first firmware (superseded for implementation, retained for validation)

**Original decision:** first device build would expose raw pulse observations only and would not report calibrated V/A/W.

**Superseding decision:** source discovery found a hardware-tested downstream implementation with raw pulse diagnostics, standard clusters and measured calibration for `_TZ3000_b28wrpvx`. We will reuse that implementation rather than deliberately removing working measurement code. The first **project canary** still treats downstream calibration as provisional until confirmed on the exact project socket, and raw `CF`/`CF1`/`SEL` diagnostics remain part of acceptance.

## D-007 — Standard Zigbee clusters

**Decision:** PM uses standard Electrical Measurement and Smart Energy Metering server clusters. The downstream implementation already follows this architecture and is therefore preferred over a new proprietary path.

## D-008 — Energy persistence

**Decision:** cumulative energy must remain wear-conscious. The adopted downstream code currently checkpoints accumulated Wh every five minutes using the Telink NVM layer. This is acceptable for the first functional canary but is explicitly marked for endurance review before broad deployment; no design may write flash per pulse.

## D-009 — Evidence hygiene

**Decision:** raw firmware dumps and unsanitized device metadata are local-only. Git contains sanitized, reproducible evidence only.

## D-010 — Reuse the hardware-proven downstream implementation

**Decision:** pin `HobboRobin/tuya-zigbee-switch-with-metering@8b8cc4924a353b35880666f7b48f0afbee89eb17` as the implementation source for the first BSEED PM candidate.

**Evidence:** downstream commit `37de8385e5a661505ac9bc8d47b2e7791c7a5493` records the `_TZ3000_b28wrpvx` metering GPIOs as hardware-verified: `CF=PA1`, `CF1=PC2`, `SEL=PB1`. Later hardware calibration established V/A/W multipliers `161460 / 144679 / 16989`.

**Boundary:** this closes the **source-discovery** unknowns and unblocks coding/builds. It does not substitute for exact-canary `DEVICE_CONFIRMED` evidence required by the project's pre-flash Class A gate.

## D-011 — Preserve runtime `device_config`; activate metering by exact identity

**Decision:** the first project canary keeps the existing BSEED config **byte-for-byte**:

```text
b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;
```

Do **not** require an `EP...` token, a runtime `device_config` write, or a factory reset. Instead, after parsing the config, the candidate checks the exact custom identity `b28wrpvx` + `TS011F-BS-PM`. If no meter was explicitly configured, it initializes the already-proven pulse backend on `CF=PA1`, `CF1=PC2`, `SEL=PB1`.

For that exact identity, overload measurements remain available but the downstream overload state machine is not connected to the relay in the first canary.

**Reason:** already-converted devices persist `device_config` in NVM. Merely changing the compiled default to add `EPA1C2B1` would not reliably affect an existing socket after OTA and would create pressure to rewrite/reset NVM. The identity-scoped fallback adds PM while preserving current relay/button/LED semantics and recovery assumptions.

## D-012 — Calibration is reusable evidence, not immutable truth

**Decision:** compile the downstream hardware-measured multipliers into the candidate because they are better than guessed/default constants, but validate them against an external reference meter on the exact assembled project canary before declaring calibration accepted.

**Acceptance:** voltage/current/power accuracy and low-load behavior are Class B runtime validation items. If the exact canary requires fine-tuning, use the downstream runtime calibration mechanism rather than changing GPIO identity or OTA identity.

## D-013 — Build artifacts are evidence, not flash authorization

**Decision:** the canary workflow runs for the implementation PR and can also be dispatched manually. It performs only offline source checks, downstream tests, firmware build and artifact validation. Producing a valid image never authorizes OTA by itself. Issue #5 recovery proof and the project's live pre-flash gates remain mandatory before a canary flash.

## D-014 — Coordinator metadata is pinned separately from firmware config

**Decision:** package the downstream 1.2.5 `switch_custom.js` converter from Git blob `53b7c7bc66df95ca0316a98398f37bcee04a2a23` with the canary artifacts instead of regenerating it from the NVM-preserving candidate `device_db`.

**Reason:** converter generation uses the device config to infer PM exposes. Our firmware intentionally removes the explicit `EP` token from that config, but the runtime firmware still exposes the standard metering clusters. The already-generated downstream converter correctly describes those clusters and is pinned/hash-checked independently.

## D-015 — Bind every candidate to the actual reviewed head and CI provenance

**Decision:** PR builds check out the real PR head SHA rather than GitHub's synthetic merge commit. `build-provenance.json` records that supervisor SHA, the pinned downstream commit, overlay/guard hashes, exact converter blob/hash, PA1/PC2/PB1 mapping, preserved config, and the normal/forced OTA hashes plus versions.

`metering_candidate_gate.py` independently recomputes the local overlay-script hashes and cross-checks the candidate and converter against the CI provenance. This prevents a manually edited manifest from silently changing which source/artifact is being proposed.

The canary workflow is serialized per PR/ref with stale runs cancelled on subsequent revisions.
