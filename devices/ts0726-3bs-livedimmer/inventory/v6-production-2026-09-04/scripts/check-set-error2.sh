#!/bin/bash
C=app_45df7312_zigbee2mqtt
WIN=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "window=$WIN"
echo "=== SET-related lines (not full state publishes) ==="
docker exec $C sh -c "grep -vE \"MQTT publish: topic 'zigbee2mqtt/(LivingRoomMainDimmer|bridge/log)'\" /config/zigbee2mqtt/log/$WIN/log.log | grep -E \"Publish .set.|switch_right_binded|zhc:tz|Error:|error:|FAILED|UNSUPPORTED\" | tail -30"
echo "=== 12:11 window raw (short lines only) ==="
docker exec $C sh -c "grep -E '^\[2026-09-04 12:1[012]' /config/zigbee2mqtt/log/$WIN/log.log | awk 'length(\$0) < 400'" | tail -40
