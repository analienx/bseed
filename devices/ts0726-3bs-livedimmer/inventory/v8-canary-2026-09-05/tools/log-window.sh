#!/bin/bash
C=app_45df7312_zigbee2mqtt
D=/config/zigbee2mqtt/log/2026-09-05.06-17-16
OUT=/tmp/v8canary/log-window
mkdir -p $OUT
docker exec $C sh -c "tail -c +2511692 $D/log2.log > $OUT/window-ota.log; cp $D/log1.log $OUT/window-post1.log; cp $D/log.log $OUT/window-post2.log; wc -l $OUT/window-ota.log $OUT/window-post1.log $OUT/window-post2.log"
echo "== OTA sequence (non-block lines) =="
docker exec $C sh -c "grep -iE 'ota|Updating' $OUT/window-ota.log | grep -v 'image block' | head -20"
echo "== target announce/reboot =="
docker exec $C sh -c "grep -iE 'announce|left the network|joined' $OUT/window-ota.log | head -10"
echo "== currentLevel noise =="
docker exec $C sh -c "grep -c 'Failed to poll currentLevel' $OUT/window-ota.log $OUT/window-post1.log $OUT/window-post2.log"
echo "== target errors in window =="
docker exec $C sh -c "grep -i '0xa4c13843a9d40f85' $OUT/window-ota.log | grep -iE 'error|fail' | head -8"
echo "== other-device OTA activity =="
docker exec $C sh -c "grep -iE 'ota' $OUT/window-ota.log | grep -viE 'LivingRoomMainDimmer|0xa4c13843a9d40f85' | head -5"
echo "== restart markers =="
docker exec $C sh -c "grep -n 'Starting Zigbee2MQTT' $OUT/window-ota.log $OUT/window-post1.log $OUT/window-post2.log | head -5"
echo "== post-window error summary =="
docker exec $C sh -c "cat $OUT/window-post1.log $OUT/window-post2.log | grep -iE 'error' | sed 's/.*error:[[:space:]]*//' | sed 's/[0-9a-f]\{16\}/IEEE/g; s/[0-9]\+/N/g' | sort | uniq -c | sort -rn | head -10"
echo DONE

#!/bin/bash
# Post-OTA log window analysis (bounded: from pre-OTA offset 2511691 of the live log file).
C=app_45df7312_zigbee2mqtt
LOG=/config/zigbee2mqtt/log/$(ls -t /config/zigbee2mqtt/log | head -1)/log.log
OUT=/tmp/v8canary/log-window
mkdir -p $OUT
tail -c +2511692 $LOG > $OUT/window-full.log
echo "== window size =="; wc -l $OUT/window-full.log
echo "== OTA sequence (update/announce) =="
grep -iE "ota|Updating" $OUT/window-full.log | grep -v "image block" | head -25
echo "== device announce/rejoin/leave (target) =="
grep -iE "announce|left the network|joined the network" $OUT/window-full.log | head -15
echo "== currentLevel poll noise =="
grep -c "Failed to poll currentLevel" $OUT/window-full.log || true
echo "== errors mentioning target =="
grep -i "0xa4c13843a9d40f85" $OUT/window-full.log | grep -iE "error|fail|timeout" | grep -v "65282|0xff02" | head -10
echo "== other devices OTA activity =="
grep -iE "ota" $OUT/window-full.log | grep -viE "LivingRoomMainDimmer|0xa4c13843a9d40f85" | head -5
echo "== error summary by type =="
grep -iE "error" $OUT/window-full.log | sed 's/.*error:[[:space:]]*//' | sed 's/[0-9a-f]\{16\}/IEEE/g; s/[0-9]\+/N/g' | sort | uniq -c | sort -rn | head -12
echo DONE-LOG-WINDOW
