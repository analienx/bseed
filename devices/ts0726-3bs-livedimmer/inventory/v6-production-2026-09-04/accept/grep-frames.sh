#!/bin/bash
C=app_45df7312_zigbee2mqtt
L=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
docker exec $C sh -c "grep -aE 'LivingRoomMainDimmer|0xa4c13843a9d40f85' /config/zigbee2mqtt/log/$L/log.log | grep -aE 'commandToggle|commandOn|commandOff|Move|Step|Stop|multistate|endpoint 1|endpoint 2|endpoint 3|ep 1|ep 2|ep 3|srcEP' | tail -50 | cut -c1-230" > /tmp/accept-dimmer-frames.txt
wc -l /tmp/accept-dimmer-frames.txt
tail -50 /tmp/accept-dimmer-frames.txt
