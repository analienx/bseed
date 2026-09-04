#!/bin/bash
C=app_45df7312_zigbee2mqtt
WIN=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "window=$WIN"
docker exec $C sh -c "grep -E 'switch_right_binded_mode|Publish .set. to .LivingRoomMainDimmer|error' /config/zigbee2mqtt/log/$WIN/log.log | tail -20"
