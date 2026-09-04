#!/bin/bash
# Read-only recent-activity inspection for the V6 target.
C=app_45df7312_zigbee2mqtt
LATEST=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "log window: $LATEST"
docker exec $C sh -c "tail -4000 /config/zigbee2mqtt/log/$LATEST/*.log 2>/dev/null" | grep -E "LivingRoomMainDimmer|0xa4c13843a9d40f85|17007|24677" | tail -30
echo "=== last 10 lines overall ==="
docker exec $C sh -c "tail -60 /config/zigbee2mqtt/log/$LATEST/log.log 2>/dev/null | tail -12"
