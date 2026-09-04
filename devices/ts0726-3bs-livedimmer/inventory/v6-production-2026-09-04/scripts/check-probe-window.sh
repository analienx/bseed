#!/bin/bash
C=app_45df7312_zigbee2mqtt
WIN=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
echo "window=$WIN"
echo "=== 12:16 window (probe SET) — short lines ==="
docker exec $C sh -c "grep -E '^\[2026-09-04 12:1[567]' /config/zigbee2mqtt/log/$WIN/log.log | awk 'length(\$0) < 500'"
echo "=== any zhc/tz/Read/Write/error lines 12:1x ==="
docker exec $C sh -c "grep -E '^\[2026-09-04 12:1' /config/zigbee2mqtt/log/$WIN/log.log | grep -E 'zhc|tz:|Read result|write|error|Error' | awk 'length(\$0) < 500' | tail -20"
