#!/bin/sh
# Activation of the corrected content + zero-write functional proof.
T="$SUPERVISOR_TOKEN"
A=http://supervisor/homeassistant/api
post() { printf '%s -> ' "$1"; curl -s -m 40 -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{}' "$A/services/$1"; echo; }
echo "== reload =="
post "automation/reload"
post "script/reload"
sleep 4
rt() { printf '%s -> ' "$1"; curl -s -m 30 -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d @"/tmp/$2" "$A/services/homeassistant/render_template"; echo; }
echo "== gate renders (evaluated by HA itself, no publish) =="
rt "gate1 mains profile      " rt-gate1.json
rt "gate2 LED profile (fixed)" rt-gate2.json
rt "finalizer option cond    " rt-finalizer-cond.json
echo "== payload templates =="
rt "LEFT branch payload " rt-left.json
rt "full reconcile      " rt-full.json
echo "== entity resolution of every id the delta references =="
sh /tmp/refcheck.sh | tail -4
echo "== loaded automation + script =="
curl -s -m 20 -H "Authorization: Bearer $T" "$A/states/automation.lr_livingroommaindimmer_indicator_sync_on" | tr ',' '\n' | grep -E '"state"|"friendly_name"|"last_triggered"'
curl -s -m 20 -H "Authorization: Bearer $T" "$A/states/script.main_dimmer_finalize_v5_indicators" | tr ',' '\n' | grep -E '"state"|"friendly_name"'
