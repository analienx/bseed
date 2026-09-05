#!/bin/sh
T="$SUPERVISOR_TOKEN"
A=http://supervisor/homeassistant/api
echo "== last_triggered now (activation was ~11:41-12:05 CEST; stale value = 06:42:37Z) =="
curl -s -m 20 -H "Authorization: Bearer $T" "$A/states/automation.lr_livingroommaindimmer_indicator_sync_on" | tr ',' '\n' | grep -E '"state"|"last_triggered"'
echo "== history of the automation entity since activation (UTC 09:40) =="
curl -s -m 30 -H "Authorization: Bearer $T" "$A/history/period/2026-09-05T09:40:00Z?filter_entity_id=automation.lr_livingroommaindimmer_indicator_sync_on" | head -c 600
echo
echo "== tracked target light states + their recent transitions =="
for e in light.livingroomlineardimmer light.lr_kitchen_table_bulbs; do
  printf '%s -> ' "$e"; curl -s -m 20 -H "Authorization: Bearer $T" "$A/states/$e" | tr ',' '\n' | grep -m1 '"state"'
done
echo "== final: any HA-originated set publish to the device since activation? (Z2M log) =="
docker exec app_45df7312_zigbee2mqtt sh -c "grep -h 'LivingRoomMainDimmer/set' /config/zigbee2mqtt/log/2026-09-05*/*.log | tail -5"
echo "(empty above = no inbound set command recorded)"
echo "== refcheck summary =="
sh /tmp/refcheck.sh | tail -2
