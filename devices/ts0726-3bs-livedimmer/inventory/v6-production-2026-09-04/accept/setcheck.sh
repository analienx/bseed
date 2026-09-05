#!/bin/sh
# Control test: does an info-level Z2M log actually record inbound .../set traffic?
# Yesterday/today 08:42 CEST the legacy automation DID write state_relay_* to this device.
echo "COUNTS per file:"
grep -c "LivingRoomMainDimmer/set" /config/zigbee2mqtt/log/2026-09-0*/*.log
echo
echo "SAMPLE (last 4 anywhere):"
grep -h "LivingRoomMainDimmer/set" /config/zigbee2mqtt/log/2026-09-0*/*.log | tail -4
echo
echo "ANY inbound set after 11:00 CEST today?"
grep -h "LivingRoomMainDimmer/set" /config/zigbee2mqtt/log/2026-09-05*/*.log | grep -E "^\[2026-09-05 1[1-9]:" | tail -5
echo "(if the 08:42 sample exists but the 11:xx block is empty, absence-after-activation is real evidence)"
