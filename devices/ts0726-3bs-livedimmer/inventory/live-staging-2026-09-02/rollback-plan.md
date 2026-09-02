# Rollback plan — live overlay staging (bseed_ts0726_v4.js)

Trigger: any Stage 2 post-condition failure (startup error, fleet/device/API delta,
target definition change, device count change, converter hash mismatch).

Steps:
1. docker exec app_45df7312_zigbee2mqtt rm /config/zigbee2mqtt/external_converters/bseed_ts0726_v4.js
2. docker restart app_45df7312_zigbee2mqtt  (exactly one restart)
3. Verify: external_converters identical to /share/bseed-live-staging-20260902T083105Z/external_converters-rollback (hashes)
4. Verify: bridge snapshot identical to pre-stage captures (fleet-before/target-before)

Full pre-stage converter directory copy: /share/bseed-live-staging-20260902T083105Z/external_converters-rollback/
