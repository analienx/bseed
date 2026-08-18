# Recovery runbook

This runbook is subordinate to `policy/OTA_REVERSIBILITY.md`.

## Normal recovery preference

1. Stop the experiment.
2. Keep the device fully assembled and powered normally if it is electrically behaving normally.
3. Determine whether Zigbee/OTA is still responsive.
4. If responsive, locate the exact pre-verified known-good rollback/reinstall OTA artifact.
5. Verify its SHA-256 against the approved rollback manifest.
6. Roll back only under an exact Supervisor approval; do not edit versions/index metadata to force acceptance.
7. Verify expected known-good version, rejoin, relay, physical button, LEDs and OTA-client liveness.
8. Do not immediately retry the failed candidate.

## If Zigbee/OTA is unavailable

Do not repeatedly power-cycle, alter OTA indexes or improvise a different image.

Post `BLOCKED / OTA-UNAVAILABLE` with candidate ID/hash, last known uptime/reset state, whether relay/button work, whether it rejoins, Zigbee2MQTT observations and the last proven rollback state.

Supervisor decides whether emergency wired SWS recovery is justified.

## Wired SWS boundary

Wired recovery is emergency-only and requires:

- socket completely disconnected from mains and loads;
- no mains connection during the entire wired procedure;
- documented 3.3 V/SWS/RST/GND path;
- exact programmer/tool/commands supplied by Supervisor;
- separate explicit approval;
- preserving a full flash dump before destructive actions where practical.

After wired recovery, normal PM development remains blocked until custom→custom OTA is restored and empirically proven again.

## Candidate directory

Recommended local-only layout:

```text
.local/candidates/<candidate-id>/
  candidate.zigbee
  candidate_manifest.json
  candidate_gate.json
  baseline.json
  rollback-forced.zigbee
  README.txt
```

Never rely only on a moving URL. Preserve the exact verified rollback file locally with its hash.
