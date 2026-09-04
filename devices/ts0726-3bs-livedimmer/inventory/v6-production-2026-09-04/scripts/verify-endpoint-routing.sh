#!/bin/bash
# Prove which endpoint each mechanism hits. Read-only.
C=app_45df7312_zigbee2mqtt
LATEST=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "window=$LATEST"
echo "=== 16:13-16:15 genOnOffSwitchCfg.read traffic (which EP, which value) ==="
docker exec $C sh -c "cat /config/zigbee2mqtt/log/$LATEST/log.log" | grep -E "genOnOffSwitchCfg.read|readResponse.*genOnOffSwitchCfg|'switch_right'|x_ep3|x_ep1" | tail -40
