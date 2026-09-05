#!/bin/sh
# Redeploy (Option A correction): back up the currently-installed files, install the
# corrected live+delta files, verify digests and parsed content. No reload here - that is
# a separate, explicitly-gated step.
set -e
CTR=homeassistant
echo "== staged (expect e1cb0e8e autom / cf4c3af7 scripts) =="
sha256sum /tmp/patched-automations.yaml /tmp/patched-scripts.yaml
echo "== backup currently installed =="
docker exec $CTR cp /config/automations.yaml /config/automations.yaml.pre-hav2r2-20260905
docker exec $CTR cp /config/scripts.yaml /config/scripts.yaml.pre-hav2r2-20260905
docker exec $CTR sha256sum /config/automations.yaml.pre-hav2r2-20260905 /config/scripts.yaml.pre-hav2r2-20260905
echo "== install corrected =="
docker cp /tmp/patched-automations.yaml $CTR:/config/automations.yaml
docker cp /tmp/patched-scripts.yaml $CTR:/config/scripts.yaml
docker exec $CTR sha256sum /config/automations.yaml /config/scripts.yaml
echo "== stale-id scan in loaded files (expect 0 / 0) =="
docker exec $CTR grep -c "indicator_mode_relay" /config/automations.yaml /config/scripts.yaml || true
echo "== parsed content check =="
docker exec $CTR python -c "
import yaml
a=yaml.safe_load(open('/config/automations.yaml')); s=yaml.safe_load(open('/config/scripts.yaml'))
r=[x for x in a if str(x.get('alias','')).startswith('LR - MainDimmer v5')][0]
print('automation entries:',len(a),'| script keys:',len(s))
txt=yaml.dump(r)
print('indicator ids used:',sorted(w for w in __import__('re').findall(r'select\.\w*indicator_mode\w*', txt)))
print('finalize indicator ids:',sorted(w for w in __import__('re').findall(r'select\.\w*indicator_mode\w*', yaml.dump(s['main_dimmer_finalize_v5_indicators']))))
print('RIGHT write keys:', 'state_relay_right' in open('/config/automations.yaml').read()+open('/config/scripts.yaml').read())
"
echo DONE
