#!/bin/bash
C=app_45df7312_zigbee2mqtt
date -u +%H:%M:%SZ
echo "=== all log windows ==="
docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -4'
echo "=== dimmer mentions, ALL current-window lines (any kind) ==="
L=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
docker exec $C sh -c "grep -ac 'LivingRoomMainDimmer' /config/zigbee2mqtt/log/$L/log.log"
echo "=== receive-type lines for target (non-publish) ==="
docker exec $C sh -c "grep -a 'LivingRoomMainDimmer' /config/zigbee2mqtt/log/$L/log.log | grep -avE 'MQTT publish|homeassistant' | tail -15 | cut -c1-230"
echo "=== CURRENT dimmer state keys ==="
docker exec $C sh -c "node -e \"const s=JSON.parse(require('fs').readFileSync('/config/zigbee2mqtt/state.json','utf8'))['$([1] && echo)LivingRoomMainDimmer']||{}; for (const k of ['state_relay_left','state_relay_middle','state_relay_right','relay_right_indicator','relay_right_physical_mode','switch_right_binded_mode']) console.log(k,'=',JSON.stringify(s[k]))\""
