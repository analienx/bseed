#!/bin/bash
C=app_45df7312_zigbee2mqtt
LATEST=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
docker exec $C sh -c "grep -iE 'Updating|OTA update|progress|image block|abort|failed' /config/zigbee2mqtt/log/$LATEST/log.log | tail -10"
echo "=== runner file? ==="
docker exec $C sh -c 'ls -la /tmp/ota-update.json 2>/dev/null || echo IN_PROGRESS'
