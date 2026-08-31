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

**Decision:** treat PR #314 as source material. Rebase/review the useful Telink counter implementation against the pinned upstream before integration.

**Reason:** the PR is open, based on an older main commit, and explicitly does not implement PM end to end.

## D-006 — Diagnostic-first firmware

**Decision:** first device build exposes raw pulse observations only. It must not report apparently calibrated voltage/current/power until calibration evidence exists.

## D-007 — Standard Zigbee clusters

**Decision:** final PM should use standard Electrical Measurement and Smart Energy Metering server clusters rather than a BSEED-only proprietary reporting path where upstream architecture allows it.

## D-008 — Energy persistence

**Decision:** cumulative energy uses a 64-bit RAM accumulator plus wear-bounded persistent checkpoints. Never write flash per pulse.

## D-009 — Evidence hygiene

**Decision:** raw firmware dumps and unsanitized device metadata are local-only. Git contains sanitized, reproducible evidence only.