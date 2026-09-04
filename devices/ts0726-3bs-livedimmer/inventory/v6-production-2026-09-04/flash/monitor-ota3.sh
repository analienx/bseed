#!/bin/bash
C=app_45df7312_zigbee2mqtt
echo "UTC: $(date -u)"
LATEST=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "window=$LATEST"
echo "=== last target lines (non-publish) ==="
docker exec $C sh -c "tail -1200 /config/zigbee2mqtt/log/$LATEST/log.log | grep -aE '0xa4c13843a9d40f85|LivingRoomMainDimmer' | grep -avE 'MQTT publish' | tail -12"
echo "=== mesh events ==="
docker exec $C sh -c "tail -2400 /config/zigbee2mqtt/log/$LATEST/log.log | grep -aE 'announce|interview|leave|removed|rediscovered|Starting' | tail -8"
echo "=== runner ==="
docker exec $C sh -c 'ls /tmp/ota-update.json 2>/dev/null && echo RUNNER_DONE || echo RUNNER_STILL_WAITING'
echo "=== update state topic ==="
docker exec $C sh -c 'true'
ssh_dummy=1
