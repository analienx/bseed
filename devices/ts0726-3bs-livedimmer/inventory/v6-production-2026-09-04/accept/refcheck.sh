#!/bin/sh
# Test every entity id referenced by the HA-v2 delta against live HA. Read-only.
T="$SUPERVISOR_TOKEN"
A=http://supervisor/homeassistant/api
miss=0; ok=0
: > /tmp/ref-results.txt
while read -r e; do
  [ -z "$e" ] && continue
  r=$(curl -s -m 20 -H "Authorization: Bearer $T" "$A/states/$e")
  case "$r" in
    *"Entity not found."*)
      echo "MISSING  $e" >> /tmp/ref-results.txt; miss=$((miss+1));;
    *)
      s=$(echo "$r" | tr ',' '\n' | grep -m1 '"state"' | sed 's/.*"state"://')
      echo "OK       $e  state=$s" >> /tmp/ref-results.txt; ok=$((ok+1));;
  esac
done < /tmp/delta-refs.txt
cat /tmp/ref-results.txt
echo
echo "summary: ok=$ok missing=$miss"
