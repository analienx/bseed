#!/bin/sh
# Activation: targeted YAML reloads through the supervisor REST proxy, then read back the
# affected entity ids. No core restart, no device write performed here.
T="$SUPERVISOR_TOKEN"
A=http://supervisor/homeassistant/api
post() {
  printf '%s -> ' "$1"
  curl -s -m 40 -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{}' "$A/services/$1"
  echo
}
echo "== BEFORE: relevant entity ids =="
curl -s -m 30 -H "Authorization: Bearer $T" $A/states | tr ',' '\n' | grep '"entity_id"' | grep -i -E 'maindimmer|circle_light' | sed 's/.*"entity_id": *"//; s/".*//' | sort
echo "== reload =="
post "automation/reload"
post "script/reload"
sleep 4
echo "== AFTER: relevant entity ids =="
curl -s -m 30 -H "Authorization: Bearer $T" $A/states | tr ',' '\n' | grep '"entity_id"' | grep -i -E 'maindimmer|circle_light' | sed 's/.*"entity_id": *"//; s/".*//' | sort
echo "== new automation state =="
curl -s -m 20 -H "Authorization: Bearer $T" $A/states/automation.lr_maindimmer_v5_target_state_reconciliation
echo
echo "== legacy automation states (expect 404 text) =="
curl -s -m 20 -H "Authorization: Bearer $T" $A/states/automation.lr_livingroommaindimmer_swapped_output_sync_on
echo
curl -s -m 20 -H "Authorization: Bearer $T" $A/states/automation.lr_livingroommaindimmer_swapped_output_sync_off
echo
echo "== HA health =="
curl -s -m 20 -H "Authorization: Bearer $T" $A/
echo
curl -s -m 20 -H "Authorization: Bearer $T" $A/config | tr ',' '\n' | grep -E '"state"|"version"|"safe_mode"|"required"|"core"|"custom_components"' | head
