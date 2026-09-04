#!/bin/bash
# Post-deploy startup verification (read-only).
C=app_45df7312_zigbee2mqtt
WIN=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "window=$WIN"
docker exec $C sh -c "cat /config/zigbee2mqtt/log/$WIN/log.log 2>/dev/null" | grep -E "Loaded external converter|Started frontend|Converting definition|error:|Error|interview|Successfully" | head -40
echo "=== converter load census ==="
docker exec $C sh -c "cat /config/zigbee2mqtt/log/$WIN/log.log 2>/dev/null" | grep -c "Loaded external converter"
echo "=== bseed lines ==="
docker exec $C sh -c "cat /config/zigbee2mqtt/log/$WIN/log.log 2>/dev/null" | grep -i "bseed\|zigbee2mqtt_v6" | head -10
echo "=== frontend port ==="
docker exec $C sh -c 'wget -qS -O /dev/null http://127.0.0.1:8099/ 2>&1 | head -2'
echo "=== target definition after restart ==="
docker exec $C sh -c "cat /config/zigbee2mqtt/log/$WIN/log.log 2>/dev/null" | grep -E "LivingRoomMainDimmer|0xa4c13843a9d40f85" | tail -8
