# BSEED brick threat model

Status: **MANDATORY / PRE-FLASH HARD GATE**

Target: `WALL_OUTLET_BSEED_TS011F_PM`, `_TZ3000_b28wrpvx` / custom `b28wrpvx`, `TS011F-BS-PM`, ZTU / TLSR8258, router firmware.

Pinned upstream reference: `romasku/tuya-zigbee-switch@bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702`.

## Definition used by this project

For this project a **brick** is broader than a permanently dead MCU. Any firmware action that leaves the socket unable to accept the next approved OTA without opening the device counts as a brick-class deployment failure.

Classes:

- **B0 — safe failure:** candidate is rejected before flash.
- **B1 — OTA soft brick:** device still runs but OTA/update path is inaccessible or cannot match a recovery image.
- **B2 — boot/network soft brick:** firmware boots/reboots but never becomes stably reachable enough to recover OTA.
- **B3 — wired-recovery brick:** OTA unavailable; device can only be recovered through SWS while completely disconnected from mains.
- **B4 — hardware damage:** firmware/configuration causes electrical stress or physical damage. This is unacceptable and may not be recoverable.

Project target is **B0 only**. B1–B4 are treated as prevention failures even when wired recovery exists.

No list can mathematically prove absence of an unknown silicon/SDK defect. Therefore any new/unclassified failure mode is automatically `BLOCKED` until characterized.

---

# Threat inventory

## A. Wrong target / wrong build identity

### BRICK-A01 — wrong physical device or PCB revision

**Mechanism:** flash a build intended for another TS011F/BSEED/Aubess/Moes variant. Multiple PM devices can share `TS011F`, Telink ZTU and even the same custom image type while having different GPIO layouts.

**Consequence:** wrong relay/LED/button/PM GPIO drive, unreachable device or hardware stress.

**Controls:** one labeled canary; PCB revision and sanitized device identity recorded; no bulk/update-all operation; exact canary selected manually.

### BRICK-A02 — wrong MCU/family

**Mechanism:** build for anything other than Telink TLSR8258/ZTU.

**Consequence:** no boot or undefined low-level behavior.

**Control:** candidate manifest must say `mcu_family=Telink`, `mcu=TLSR8258`; source/build gate must prove board target.

### BRICK-A03 — router/end-device mode change

**Mechanism:** build BSEED as `end_device` instead of current `router`.

**Consequence:** upstream explicitly treats router/end-device NVM as incompatible and factory-resets on a role change; network state is lost and OTA may become operationally unavailable.

**Control:** freeze `device_type=router`; candidate gate rejects any role change.

### BRICK-A04 — wrong BSEED base configuration

Known-good upstream config is exactly:

```text
b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;
```

**Mechanism:** alter existing relay/button/LED/indicator mapping while adding PM.

**Consequence:** relay regression, invalid pin drive, boot/runtime instability, loss of confidence in recovery.

**Control:** base config string is immutable during PM development and must be present verbatim in the Telink payload.

### BRICK-A05 — runtime device-config write

**Mechanism:** write Basic cluster `device_config` (`0xff00`). Upstream loads this value from NVM on every boot and immediately reboots after a write. The config can remap outputs and can contain `i<image_type>`, which changes the OTA image type at runtime.

**Consequence:** B1/B2/B3. Upstream also documents historical firmware where config writes bricked devices.

**Control:** **device-config writes are prohibited for all BSEED PM experiments.** PM pin mapping must not be delivered through the mutable config string.

### BRICK-A06 — OTA image type changed by config or code

**Mechanism:** `hal_zigbee_set_image_type()` or `i...` config changes the runtime OTA preamble.

**Consequence:** known-good rollback no longer matches.

**Control:** custom image type fixed at `43556 / 0xAA24`; config string contains no `i` entry; OTA source frozen.

### BRICK-A07 — manufacturer/image-type mismatch in OTA wrapper

**Control:** fixed manufacturer code `4417 / 0x1141`; fixed image type `43556 / 0xAA24`; artifact parser rejects drift.

### BRICK-A08 — wrong manufacturer/model exposed to Zigbee2MQTT

**Mechanism:** default/NVM config changes `b28wrpvx` or `TS011F-BS-PM`.

**Consequence:** external converter may not match, OTA UI/support path can disappear or become confusing.

**Control:** target preflight verifies manufacturer/model/config before flash; candidate preserves them.

### BRICK-A09 — same image type offered to a different compatible-looking device

**Mechanism:** OTA identity is not a unique physical-board identity.

**Control:** isolated local candidate index, automatic OTA disabled, manual update on one project-local canary ID only. Never use update-all.

---

## B. OTA artifact/package corruption

### BRICK-B01 — malformed Zigbee OTA header
### BRICK-B02 — bad total image size/header length/optional-field encoding
### BRICK-B03 — wrong OTA sub-element ID or length
### BRICK-B04 — malformed/truncated Telink payload
### BRICK-B05 — missing Telink OTA magic
### BRICK-B06 — invalid embedded firmware length
### BRICK-B07 — invalid Telink payload CRC
### BRICK-B08 — image larger than safe OTA slot

Upstream big-OTA scheme uses `0x00000` and `0x40000` slots and declares `MAX_FIRMWARE_SIZE=0x40000`.

**Controls for B01–B08:** `scripts/ota_guard.py` must parse the outer Zigbee header and Telink inner image, validate exact lengths/sub-element, Telink magic, CRC and `<= 0x40000` payload before the file can enter a flash proposal.

### BRICK-B09 — outer version inconsistent with inner firmware version

**Mechanism:** accidental hand-edited version can produce an image that Z2M accepts/rejects unexpectedly.

**Control:** normal OTA outer version must equal inner firmware version. Forced/reinstall OTA outer version may be `0xFFFFFFFF` only when the manifest explicitly declares forced mode.

### BRICK-B10 — wrong/stale/moving artifact URL

**Control:** proposal names an immutable local file and SHA-256. Moving `main/latest` URLs are never the recovery source of truth.

### BRICK-B11 — corrupted rollback artifact

**Control:** rollback file is independently parsed and hashed before candidate flash; baseline manifest hash must equal rollback file hash.

---

## C. Flash layout / boot relocation

These are the highest-risk software surfaces in the Telink implementation.

### BRICK-C01 — modify early boot or boot-address detection
### BRICK-C02 — modify `ensure_correct_ota_scheme*`
### BRICK-C03 — modify RAM flash read/write/erase/status routines
### BRICK-C04 — change startup flags or boot addresses (`0x8000`, `0x20000`, `0x40000`)
### BRICK-C05 — change `MAX_FIRMWARE_SIZE` / slot assumptions
### BRICK-C06 — change linker/start-address/toolchain layout
### BRICK-C07 — erase/write current executing slot or wrong sector
### BRICK-C08 — corrupt the active/next-slot startup marker
### BRICK-C09 — change flash write-protection manipulation

Upstream self-relocation runs before normal application startup and can erase/copy/mark flash slots from RAM. A defect here can prevent Zigbee and OTA from ever starting.

**Control:** all these files/build surfaces are frozen for ordinary PM work and checked by `recovery_surface_guard.py`. Any required change becomes a separate `[HIGH-RISK][RECOVERY-INFRA]` project and is not combined with PM functionality.

---

## D. OTA client / Zigbee recovery path

### BRICK-D01 — remove/change OTA cluster registration
### BRICK-D02 — change OTA client callback/reboot behavior
### BRICK-D03 — change runtime OTA preamble identity
### BRICK-D04 — change network initialization/steering required for recovery
### BRICK-D05 — corrupt endpoint/cluster descriptors so Zigbee initialization fails
### BRICK-D06 — initialize risky PM code before OTA/network baseline is healthy
### BRICK-D07 — converter missing or wrong, making device unsupported operationally
### BRICK-D08 — wrong OTA index (normal vs FORCE) or index not loaded
### BRICK-D09 — weak Zigbee link causes repeated failed transfer
### BRICK-D10 — automatic/bulk OTA updates multiple sockets with an experimental image

**Controls:** core OTA/network implementation frozen; candidate converter/index staged before flashing; strong link; one canary; manual OTA only; first post-boot checks OTA liveness while PM remains disabled.

Upstream known-issues history includes a firmware release (`v1.1.0`) where devices could not update OTA; therefore “it compiled” can never prove OTA survivability.

---

## E. Early-boot/runtime failure before recovery becomes usable

### BRICK-E01 — null pointer/assert/fault during PM initialization
### BRICK-E02 — infinite/blocking loop before normal Zigbee task service
### BRICK-E03 — watchdog reset loop
### BRICK-E04 — stack overflow/buffer overwrite/memory corruption
### BRICK-E05 — excessive CPU load starves Zigbee/OTA tasks
### BRICK-E06 — timer/peripheral conflict with SDK services
### BRICK-E07 — interrupt storm from CF/CF1
### BRICK-E08 — invalid counter handle/resource exhaustion
### BRICK-E09 — report storm saturates network/device
### BRICK-E10 — PM fault coupled to relay/OTA/network code
### BRICK-E11 — PM automatically re-enables after crash/reboot
### BRICK-E12 — power-management/deep-sleep change makes router unreachable

**Controls:**

- first plumbing candidate contains no active PM behavior;
- diagnostic PM is **volatile-disabled on every boot**;
- enable only after joined + relay/button/LED + OTA health have been observed;
- activation is manual and non-persistent during discovery;
- PM failure/reboot returns to PM-disabled state;
- raw counter work does no heavy ISR processing;
- timer/counter implementation must be reviewed for SDK resource conflicts before use;
- reporting is added only after raw acquisition is proven;
- no PM code executes in Telink `main()`/OTA relocation path.

PR #314 is therefore source material, not blindly mergeable proof of safety.

---

## F. GPIO / electrical damage caused by firmware

### BRICK-F01 — drive a BL0937 output (CF/CF1) as MCU output
### BRICK-F02 — drive an unknown/unverified net
### BRICK-F03 — output-vs-output contention
### BRICK-F04 — select a pin connected to VCC/GND/protection circuitry
### BRICK-F05 — use ZTU SWS as PM GPIO and lose emergency programming path
### BRICK-F06 — use/reset-drive ZTU RST incorrectly
### BRICK-F07 — alter existing relay `D2`, button `B5`, status LED `C3` or indicator `B4` behavior
### BRICK-F08 — toggle SEL before its exact path and logic level are confirmed
### BRICK-F09 — relay chatter or unintended repeated switching

Tuya documents dedicated ZTU `SWS` (module pin 4) and `RST` (pin 18). Those are protected recovery pins.

**Controls:**

- CF/CF1/SEL mappings require unpowered continuity/resistance evidence from the exact canary PCB;
- SWS/RST/VCC/GND are forbidden PM assignments;
- CF and CF1 first come up input-only;
- SEL output is a later separate gate after mapping is DEVICE_OBSERVED/REPEATED;
- existing base GPIO mapping is immutable;
- open PCB is never energized.

---

## G. NVM/config/persistence makes rollback unsafe

### BRICK-G01 — reuse/collide with an existing NVM item ID
### BRICK-G02 — change size/meaning of an existing NVM item
### BRICK-G03 — irreversible migration that older rollback firmware cannot understand
### BRICK-G04 — bump migration logic and create boot-time migration failure
### BRICK-G05 — persist PM-enabled state and reproduce a crash after every reboot
### BRICK-G06 — corrupt device config NVM
### BRICK-G07 — unintended factory reset/clear-all loses network recovery path
### BRICK-G08 — high-frequency energy writes wear flash
### BRICK-G09 — power failure during persistence write leaves invalid state

**Controls:**

- diagnostic/raw/calibration phases perform **zero new PM NVM writes**;
- NVM files/migration version are frozen until energy persistence phase;
- persistence later uses a new unused item ID only, self-versioned data + integrity check, bounded write rate and safe default on read failure;
- old known-good firmware must ignore the new item so rollback remains valid;
- PM enable remains volatile during development;
- rollback round trip is repeated after persistence is introduced.

---

## H. Operational errors around flashing

### BRICK-H01 — wrong device selected in Z2M
### BRICK-H02 — candidate/rollback hashes changed after approval
### BRICK-H03 — candidate index points to different binary than reviewed
### BRICK-H04 — load/automation causes instability during OTA
### BRICK-H05 — mains interruption during critical update/boot transition
### BRICK-H06 — user closes Z2M/restarts coordinator during update
### BRICK-H07 — executor improvises after an unexpected result
### BRICK-H08 — no exact known-good rollback file available locally
### BRICK-H09 — “rollback” has never actually been accepted by this target
### BRICK-H10 — emergency SWS path is assumed but not physically accessible/tested
### BRICK-H11 — attempted wired recovery while mains connected

**Controls:**

- one named canary only;
- no connected load during OTA unless a later reason requires it;
- disable automations that can operate the canary during the maintenance window;
- strong Zigbee signal and stable mains;
- immutable local candidate/rollback files + hashes;
- no coordinator/Z2M maintenance during transfer;
- exact stop conditions; no improvisation;
- wired recovery only fully unpowered;
- prove SWS read/recovery access before higher-risk phases.

---

# Mandatory deployment sequence

This sequence cannot be skipped.

## P0 — identify canary and freeze state

Read-only capture:

- physical/project-local canary ID;
- PCB revision;
- custom manufacturer/model;
- exact `device_config` value;
- router role;
- current firmware version;
- current OTA manufacturer/image type;
- Zigbee2MQTT converter/index state;
- relay/button/LED baseline;
- network/OTA liveness.

Any mismatch from the BSEED profile => `BLOCKED`.

## P1 — prove the rollback file before experimenting

While still on known-good firmware, use the exact known-good **forced/reinstall** artifact to reinstall the same known-good firmware on the canary.

Then verify:

- expected known-good version;
- stable rejoin;
- relay/button/LED baseline;
- OTA liveness again.

This is the **LKG self-reinstall drill**. If it fails, do not flash experimental code.

## P2 — prove build pipeline with a no-functional-change candidate

Build the pinned upstream BSEED target through our exact toolchain with no PM behavior changes. Artifact/source guards must PASS. OTA it to the canary and repeat health checks. Then roll back to the exact LKG and return to the pipeline build.

This separates “our build/packaging pipeline is safe” from “PM code is safe”.

## P3 — PM plumbing compiled, inactive

Add PM source files/counter abstraction but execute none of it. PM state after every boot is `DISABLED`. Repeat OTA canary and rollback round trip.

## P4 — activation-control-only candidate

Add a manually controlled, volatile PM activation gate without touching PM GPIO. Prove enable/disable/reboot behavior. Reboot must always return `DISABLED` during discovery.

## P5 — CF input only

Only after GPIO mapping is confirmed: initialize **CF as input/counter only** after manual activation. No SEL drive, no CF1, no calibration, no persistence. Observe/repeat.

## P6 — CF1 input only

Add CF1 as a separate bounded step. Observe/repeat.

## P7 — SEL output

Only after SEL path is confirmed and CF/CF1 acquisition is stable. Validate safe inactive/active level and transitions. Observe/repeat.

## P8+ — calibration, clusters, energy, persistence, reporting

One new risk dimension at a time. Repeat OTA rollback proof after any change that can affect boot, Zigbee descriptors, NVM or reporting load.

---

# Flash authorization gate

A flash is prohibited unless all are true:

- `ota_guard.py` PASS;
- `recovery_surface_guard.py` PASS;
- `candidate_gate.py` PASS;
- live `preflash_gate.py` PASS;
- exact rollback hash already proven by the LKG self-reinstall drill;
- candidate source commit is immutable;
- PM default is disabled;
- canary identity is exact;
- no load/automation interference;
- explicit control-channel response begins `APPROVED / OTA-CANARY`.

If any item is `UNKNOWN`, the answer is **do not flash**.
