#!/bin/sh
# Deploy reviewed HA-v2 delta (pre-patched live+delta files staged in /tmp) into HA /config,
# with a timestamped in-place backup taken first. Any failure before "install" leaves live untouched.
set -e
CTR=homeassistant
echo "== staged files (expected digests: c2457fd0 autom / 79a75fa1 scripts) =="
sha256sum /tmp/patched-automations.yaml /tmp/patched-scripts.yaml
echo "== backup current live =="
docker exec $CTR cp /config/automations.yaml /config/automations.yaml.pre-hav2-20260905
docker exec $CTR cp /config/scripts.yaml /config/scripts.yaml.pre-hav2-20260905
docker exec $CTR sha256sum /config/automations.yaml.pre-hav2-20260905 /config/scripts.yaml.pre-hav2-20260905
echo "== install =="
docker cp /tmp/patched-automations.yaml $CTR:/config/automations.yaml
docker cp /tmp/patched-scripts.yaml $CTR:/config/scripts.yaml
echo "== in-place digests =="
docker exec $CTR sha256sum /config/automations.yaml /config/scripts.yaml
echo "== parsed sanity (core's own python) =="
docker exec $CTR python -c "
import yaml
a=yaml.safe_load(open('/config/automations.yaml'))
s=yaml.safe_load(open('/config/scripts.yaml'))
print('automation entries:',len(a))
print('script keys:',len(s))
print('v5 reconcile:',[x.get('alias') for x in a if str(x.get('alias','')).startswith('LR - MainDimmer v5')])
print('legacy sync still present:',[x.get('alias') for x in a if 'Swapped Output Sync' in str(x.get('alias'))])
print('finalize script:', 'main_dimmer_finalize_v5_indicators' in s)
r=[x for x in a if str(x.get('alias','')).startswith('LR - MainDimmer v5')][0]
print('reconcile triggers:',[t.get('id') for t in r['triggers']])
print('reconcile mode/max:',r.get('mode'),r.get('max'))
import re
txt=yaml.dump(r)
print('RIGHT writes in reconcile block:', re.findall(r'state_relay_right|switch\.livingroommaindimmer_relay_right', txt))
"
echo DONE
