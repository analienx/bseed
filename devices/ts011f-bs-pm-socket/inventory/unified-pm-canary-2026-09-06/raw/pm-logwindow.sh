#!/bin/bash
C=app_45df7312_zigbee2mqtt
D=/config/zigbee2mqtt/log/$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log | head -1')
OUT=/tmp/pmcanary/log-window
docker exec $C mkdir -p $OUT
docker exec $C sh -c "cp $D/log.log $OUT/window.log; wc -l $OUT/window.log"
echo "== PM OTA lines =="
docker exec $C sh -c "grep -iE 'LivingRoomSocketWifiLeft|0xa4c138ba60b92c5f|ota' $OUT/window.log | grep -viE 'image block' | head -30"
echo "== target errors =="
docker exec $C sh -c "grep -i '0xa4c138ba60b92c5f' $OUT/window.log | grep -iE 'error|fail|timeout' | head -10"
echo "== availability flips =="
docker exec $C sh -c "grep -iE 'offline|online' $OUT/window.log | grep -i 'WifiLeft' | head -10"
echo DONE
