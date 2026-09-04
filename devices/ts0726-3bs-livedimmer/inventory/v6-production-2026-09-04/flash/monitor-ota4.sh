#!/bin/bash
C=app_45df7312_zigbee2mqtt
date -u
L=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "window=$L"
echo "=== ota_update/update response lines ==="
docker exec $C sh -c "grep -a 'ota_update/update' /config/zigbee2mqtt/log/$L/log.log | tail -4 | cut -c1-400"
echo "=== recent non-publish target lines ==="
docker exec $C sh -c "tail -3000 /config/zigbee2mqtt/log/$L/log.log | grep -aE 'LivingRoomMainDimmer|0xa4c13843a9d40f85' | grep -avE 'MQTT publish: .topic .zigbee2mqtt/LivingRoomMainDimmer' | tail -8 | cut -c1-260"
echo "=== runner file ==="
docker exec $C sh -c 'ls /tmp/ota-update.json 2>/dev/null || echo NO_RUNNER_FILE_YET'
