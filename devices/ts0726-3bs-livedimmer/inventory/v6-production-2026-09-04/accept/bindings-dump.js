'use strict';
// Read-only: dump the retained zigbee2mqtt/bridge/devices bindings for the dimmer,
// plus retained groups it appears in. Answers "are LEFT/MIDDLE bindings present in Z2M?"
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-bnd-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
let done = {dev: false, grp: false};
let groups = [];
function maybeExit() { if (done.dev && done.grp) process.exit(0); }
client.on('connect', () => client.subscribe(['zigbee2mqtt/bridge/devices', 'zigbee2mqtt/bridge/groups']));
client.on('message', (topic, payload) => {
    const j = JSON.parse(payload.toString());
    if (topic === 'zigbee2mqtt/bridge/groups') { groups = j; done.grp = true; maybeExit(); return; }
    if (topic !== 'zigbee2mqtt/bridge/devices') return;
    done.dev = true;
    const d = j.find((x) => x.friendly_name === 'LivingRoomMainDimmer');
    if (!d) { console.log('device not in bridge/devices'); maybeExit(); return; }
    console.log(JSON.stringify({ieee: d.ieee_address, nwk: d.network_address, definition_model: d.definition && d.definition.model, endpoints: Object.fromEntries(Object.entries(d.endpoints || {}).map(([k, v]) => [k, {bindings: v.bindings, clusters: Object.keys(v.clusters || {})}]))}, null, 1));
    const members = groups.filter((g) => (g.members || []).some((mm) => mm.ieee === d.ieee_address || String(mm.endpoint) !== 'undefined' && mm.ieee === d.ieee_address)).map((g) => ({id: g.id, name: g.name, members: g.members}));
    console.log('--- groups containing this device ---');
    console.log(JSON.stringify(members, null, 1));
    maybeExit();
});
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15_000);
