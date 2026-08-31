# Recovery runbook

This runbook is subordinate to `policy/BRICK_THREAT_MODEL.md` and `policy/OTA_REVERSIBILITY.md`.

## Prevention objective

Recovery is not the primary safety mechanism. The primary goal is to reject unsafe candidates **before flashing**. If the enclosure must be opened to restore OTA, the project records that as a brick-class prevention failure even when SWS can recover the MCU.

## Recovery baseline required before experimental firmware

Before any experimental OTA reaches the canary:

1. identify the exact canary/PCB;
2. preserve the exact known-good forced/reinstall OTA artifact locally;
3. parse/hash it with `ota_guard.py`;
4. perform an **LKG self-reinstall drill** while the device is still known-good;
5. verify LKG version, rejoin, relay/button/LED and OTA liveness after that reinstall;
6. completely disconnect mains/load, open the designated canary under an approved unpowered procedure, prove SWS readback access, and preserve a full flash backup;
7. hash-verify that backup;
8. reassemble the socket and do not proceed if any mechanical/insulation state is uncertain.

Only after these facts are proven can an experimental candidate be considered.

## Normal OTA recovery preference

1. Stop the experiment and do not enable PM.
2. If the assembled device is electrically behaving normally, determine whether Zigbee/OTA is still responsive.
3. Locate the exact pre-proven known-good forced/reinstall artifact.
4. Verify its SHA-256 against the approved rollback manifest.
5. Roll back only under the exact Supervisor approval; never edit version/image type/index metadata to force acceptance.
6. Verify expected LKG version, rejoin, relay, physical button, LEDs and OTA-client liveness.
7. Preserve failure evidence and do not immediately retry the candidate.

## If Zigbee/OTA is unavailable

Do not repeatedly power-cycle, change device config, alter OTA indexes or try random images.

Post `BLOCKED / OTA-UNAVAILABLE` with candidate ID/hash, last known uptime/reset state, relay/button observations, network status, Zigbee2MQTT observations, last proven rollback artifact/hash and the point at which OTA stopped being reachable.

This is a brick-class failure. Supervisor decides whether emergency wired SWS recovery is justified.

## Emergency wired SWS recovery

Wired recovery is emergency-only and requires:

- socket completely disconnected from mains and load;
- no mains connection during the entire wired procedure;
- previously documented/proven 3.3 V/SWS/RST/GND path;
- exact programmer/tool/commands supplied by Supervisor;
- separate explicit approval;
- verify the programmer voltage is 3.3 V before connection;
- read/preserve current flash before any erase/write when readable;
- compare the new readback with the pre-experiment backup to characterize what changed;
- only then use an exact reviewed full firmware image for recovery.

After wired recovery, PM development remains blocked until the normal custom→custom OTA path and an LKG self-reinstall drill are proven again.

## Local-only recovery bundle

```text
.local/recovery/<device-id>/
  device-profile.json
  lkg-forced.zigbee
  lkg-baseline.json
  lkg-self-reinstall.json
  full-flash-backup.bin
  full-flash-backup.sha256
  sws-readback-evidence.json
```

Never rely on a moving URL for recovery. Preserve exact files plus hashes locally.

## Candidate directory

```text
.local/candidates/<candidate-id>/
  candidate.zigbee
  candidate_ota_guard.json
  candidate_manifest.json
  source_guard.json
  candidate_gate.json
  preflash-state.json
  preflash_gate.json
  baseline.json
  rollback-forced.zigbee
  README.txt
```

No file in this directory is itself authorization to flash. Only a control-channel response beginning `APPROVED / OTA-CANARY` after all gates PASS authorizes the named operation.
