#!/bin/bash
C=app_45df7312_zigbee2mqtt
LATEST=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
docker exec $C sh -c "grep -E 'OTA update of .0xa4c13843a9d40f85|OTA update of .LivingRoomMainDimmer|Finished OTA|update of .* finished|OTA update available|updateSuccessful|error.*ota|OTA.*failed' /config/zigbee2mqtt/log/$LATEST/log.log 2>/dev/null | awk 'length(\$0)<260' | tail -6"
docker exec $C sh -c "grep -E 'swBuildId|1\.1\.7' /config/zigbee2mqtt/log/$LATEST/log.log 2>/dev/null | grep -vE 'payload' | awk 'length(\$0)<200' | tail -4"
docker exec $C sh -c 'ls /tmp/ota-update.json 2>/dev/null && echo RUNNER_DONE || echo RUNNER_STILL_LISTENING'
