#!/bin/bash
C=app_45df7312_zigbee2mqtt
date -u
L=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
LOG="/config/zigbee2mqtt/log/$L/log.log"
echo "=== progress tail ==="
docker exec $C sh -c "grep -a 'OTA update of' $LOG | tail -4 | cut -c1-160"
echo "=== completion lines ==="
docker exec $C sh -c "grep -aE 'Finished OTA|finished firmware update|updateSuccessful|Installing|reboot|announced|interviewed|ota_update/update' $LOG | tail -8 | cut -c1-240"
echo "=== runner ==="
docker exec $C sh -c 'ls /tmp/ota-update.json 2>/dev/null && echo RUNNER_DONE || echo WAITING'
