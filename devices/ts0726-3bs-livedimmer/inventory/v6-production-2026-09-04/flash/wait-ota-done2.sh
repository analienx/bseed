#!/bin/bash
# Corrected bounded wait: only flag OTA failure lines timestamped AFTER the retry start (20:4x),
# and detect V7 apply by update-state installed_version or swBuildId 1.1.7 after 20:48.
C=app_45df7312_zigbee2mqtt
for i in $(seq 1 40); do
  sleep 20
  L=$(docker exec $C sh -c 'ls -t /config/zigbee2mqtt/log/ | head -1')
  LOG="/config/zigbee2mqtt/log/$L/log.log"
  LINE=$(docker exec $C sh -c "tail -600 $LOG | grep -a 'OTA update of' | tail -1")
  PCT=$(echo "$LINE" | grep -oE '[0-9.]+%, [0-9]+ seconds remaining')
  ERR=$(docker exec $C sh -c "tail -600 $LOG | grep -aE 'OTA update of .LivingRoomMainDimmer. failed' | tail -1")
  DONE=$(docker exec $C sh -c 'ls /tmp/ota-update.json 2>/dev/null && echo yes || echo no')
  FIN=$(docker exec $C sh -c "tail -800 $LOG | grep -aE 'Finished updating|successful update|update.*complete|1.1.7-bseedv7|Installed new software version' | tail -1")
  echo "t=$i pct='$PCT' runner=$DONE fin=${FIN:+YES} err=${ERR:+YES}"
  [ -n "$ERR" ] && { echo "REAL_FAIL"; echo "$ERR" | cut -c1-220; break; }
  [ "$DONE" = "yes" ] && { echo "RUNNER_DONE"; break; }
  [ -n "$FIN" ] && { echo "APPLIED"; break; }
done
echo "=== tail window ==="
docker exec $C sh -c "tail -400 $LOG | grep -aE 'OTA|1.1.7|interviewed|LivingRoomMainDimmer.*(swBuildId|update)' | tail -10 | cut -c1-200"
