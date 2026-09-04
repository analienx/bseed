#!/bin/bash
# Bounded wait for V7 OTA completion: exits when runner file present or swBuildId 1.1.7 seen, max ~15 min.
C=app_45df7312_zigbee2mqtt
for i in $(seq 1 45); do
  sleep 20
  DONE=$(docker exec $C sh -c 'ls /tmp/ota-update.json 2>/dev/null && echo yes || echo no')
  V7=$(docker exec $C sh -c 'L=$(ls -t /config/zigbee2mqtt/log/ | head -1); grep -a "1.1.7-bseedv7" /config/zigbee2mqtt/log/$L/log.log | tail -1')
  PCT=$(docker exec $C sh -c 'L=$(ls -t /config/zigbee2mqtt/log/ | head -1); grep -a "OTA update of" /config/zigbee2mqtt/log/$L/log.log | tail -1' | grep -oE '[0-9.]+%, [0-9]+ seconds remaining')
  ERR=$(docker exec $C sh -c 'L=$(ls -t /config/zigbee2mqtt/log/ | head -1); grep -aE "OTA update of .LivingRoomMainDimmer. failed|did not start/finish" /config/zigbee2mqtt/log/$L/log.log | tail -1')
  echo "t=${i} done=$DONE pct='$PCT' v7=${V7:+YES} err=${ERR:+YES}"
  if [ "$DONE" = "no" ] && [ -n "$V7" ]; then echo "RESULT=V7_APPLIED_WAITING_REJOIN"; break; fi
  if [ -n "$ERR" ]; then echo "RESULT=FAILED"; echo "$ERR" | cut -c1-240; break; fi
  if [ "$DONE" = "yes" ]; then echo "RESULT=RUNNER_DONE"; break; fi
done
echo "final window:"
docker exec $C sh -c 'L=$(ls -t /config/zigbee2mqtt/log/ | head -1); echo $L; tail -300 /config/zigbee2mqtt/log/$L/log.log | grep -aE "OTA|swBuildId|1.1.7|interviewed|announce|error" | tail -10 | cut -c1-200'
