'use strict';
// Preflight for binding restore (READ-ONLY): resolve group 25 name, confirm LinearDimmer
// online + has EP11, confirm coordinator alias, and re-confirm dimmer current empty table.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-pf-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const seen = {};
client.on('connect', () => client.subscribe(['zigbee2mqtt/bridge/devices', 'zigbee2mqtt/bridge/groups']));
client.on('message', (topic, payload) => { seen[topic] = JSON.parse(payload.toString()); if (seen['zigbee2mqtt/bridge/devices'] && seen['zigbee2mqtt/bridge/groups']) report(); });
function report() {
    const devs = seen['zigbee2mqtt/bridge/devices'];
    const groups = seen['zigbee2mqtt/bridge/groups'];
    const g25 = groups.find((g) => g.id === 25);
    console.log('group25:', JSON.stringify({id: g25 && g25.id, name: g25 && g25.name, members: g25 && (g25.members || []).length}));
    const ld = devs.find((x) => x.ieee_address === '0xa4c1388b709b209c');
    console.log('LinearDimmer:', JSON.stringify(ld ? {name: ld.friendly_name, nwk: ld.network_address ? '0x' + ld.network_address.toString(16) : null, ep11_present: !!((ld.endpoints || {})['11']), ep11_clusters: (ld.endpoints || {})['11'] ? Object.keys((ld.endpoints['11'].clusters || {})) : null} : {absent: true}));
    const coord = devs.find((x) => x.definition && x.definition.model && /Coordinator|ZBCoordinator|zigate|ConBee|deCONZ|SLZB/i.test(x.friendly_name + ' ' + JSON.stringify(x.definition))) || devs.find((x) => x.ieee_address === '0xfdb1122d004b1200');
    console.log('coordinator ieee 0xfdb1122d004b1200 present:', !!devs.find((x) => x.ieee_address === '0xfdb1122d004b1200'));
    const dim = devs.find((x) => x.ieee_address === '0xa4c13843a9d40f85');
    console.log('dimmer online:', dim && dim.available, 'bindings now:', JSON.stringify(Object.fromEntries(Object.entries(dim.endpoints || {}).map(([k, v]) => [k, (v.bindings || []).length]))));
    process.exit(0);
}
setTimeout(() => { console.error('TIMEOUT', JSON.stringify(Object.keys(seen))); process.exit(1); }, 15_000);
