#!/bin/sh
# Post-deploy proof, part 2. All read-only: entity states via REST + HA's own template engine
# (homeassistant.render_template evaluates the automation's gate and payloads WITHOUT publishing).
T="$SUPERVISOR_TOKEN"
A=http://supervisor/homeassistant/api
say() { printf '\n--- %s\n' "$1"; }
st() { curl -s -m 20 -H "Authorization: Bearer $T" "$A/states/$1" | tr ',' '\n' | grep -E '"state"|"friendly_name"|"installed_version"|"update_installed_version"|"latest_version"|"title"' | head -6; }

say "firmware identity as HA/Z2M reports it (update entity)"
st update.livingroommaindimmer

say "mains-policy surface (read-only; must be L/M=Always on, R=Follow logical state)"
for e in select.livingroommaindimmer_relay_left_physical_mode select.livingroommaindimmer_relay_middle_physical_mode select.livingroommaindimmer_relay_right_physical_mode; do
  printf '%s -> ' "$e"; st "$e" | grep '"state"'
done
say "LED-source surface (must be L/M=Binding status, R=Physical output)"
for e in select.livingroommaindimmer_relay_left_indicator_mode select.livingroommaindimmer_relay_middle_indicator_mode select.livingroommaindimmer_relay_right_indicator_mode; do
  printf '%s -> ' "$e"; st "$e" | grep '"state"'
done

rt() {
  printf '\n--- render: %s\n' "$1"
  printf '{"template": "%s"}' "$2" > /tmp/rt.json
  curl -s -m 30 -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d @/tmp/rt.json "$A/services/homeassistant/render_template"
  echo
}
rt "gate 1 (accepted mains profile)" "states('select.livingroommaindimmer_relay_left_physical_mode') == 'Always on' and states('select.livingroommaindimmer_relay_middle_physical_mode') == 'Always on' and states('select.livingroommaindimmer_relay_right_physical_mode') == 'Follow logical state'"
rt "gate 2 (accepted LED profile)" "states('select.livingroommaindimmer_relay_left_indicator_mode') == 'Binding status' and states('select.livingroommaindimmer_relay_middle_indicator_mode') == 'Binding status' and states('select.livingroommaindimmer_relay_right_indicator_mode') == 'Physical output'"
rt "LEFT branch payload as it would publish" "{ \"state_relay_left\":\"{{ 'ON' if is_state('light.livingroomlineardimmer', 'on') else 'OFF' }}\", \"relay_left_binding_intent\":\"{{ 'ON' if is_state('light.livingroomlineardimmer', 'on') else 'OFF' }}\" }"
rt "MIDDLE branch payload as it would publish" "{ \"state_relay_middle\":\"{{ 'ON' if is_state('light.lr_kitchen_table_bulbs', 'on') else 'OFF' }}\", \"relay_middle_binding_intent\":\"{{ 'ON' if is_state('light.lr_kitchen_table_bulbs', 'on') else 'OFF' }}\" }"
rt "startup/full reconcile payload" "{ \"state_relay_left\":\"{{ 'ON' if is_state('light.livingroomlineardimmer', 'on') else 'OFF' }}\", \"relay_left_binding_intent\":\"{{ 'ON' if is_state('light.livingroomlineardimmer', 'on') else 'OFF' }}\", \"state_relay_middle\":\"{{ 'ON' if is_state('light.lr_kitchen_table_bulbs', 'on') else 'OFF' }}\", \"relay_middle_binding_intent\":\"{{ 'ON' if is_state('light.lr_kitchen_table_bulbs', 'on') else 'OFF' }}\" }"
rt "GATE 2 EXACTLY AS DEPLOYED (suffixed indicator entity ids)" "states('select.livingroommaindimmer_relay_left_indicator_mode_relay_left') == 'Binding status' and states('select.livingroommaindimmer_relay_middle_indicator_mode_relay_middle') == 'Binding status' and states('select.livingroommaindimmer_relay_right_indicator_mode_relay_right') == 'Physical output'"
say "do the suffixed indicator entity ids exist at all? (expect Entity not found)"
for e in select.livingroommaindimmer_relay_left_indicator_mode_relay_left select.livingroommaindimmer_relay_middle_indicator_mode_relay_middle select.livingroommaindimmer_relay_right_indicator_mode_relay_right; do
  printf '%s -> ' "$e"; curl -s -m 20 -H "Authorization: Bearer $T" "$A/states/$e" | head -c 120; echo
done
say "and the unsuffixed form (what live actually has)"
for e in select.livingroommaindimmer_relay_left_indicator_mode select.livingroommaindimmer_relay_middle_indicator_mode select.livingroommaindimmer_relay_right_indicator_mode; do
  printf '%s -> ' "$e"; curl -s -m 20 -H "Authorization: Bearer $T" "$A/states/$e" | tr ',' '\n' | grep -E '"state"' | head -1
done
say "RIGHT write keys present anywhere in the loaded automations/scripts? (expect no matches)"
docker exec homeassistant grep -c "state_relay_right" /config/automations.yaml /config/scripts.yaml
say "v5 automation + legacy entries in loaded files"
docker exec homeassistant grep -c "LR - MainDimmer v5 Target State Reconciliation" /config/automations.yaml
docker exec homeassistant grep -c "Swapped Output Sync" /config/automations.yaml
