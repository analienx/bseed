'use strict';
// PM canary preflight/post: capture bridge entry + full device state (READ-ONLY).
// Usage: node pm-preflight.js <tag> [--get k1,k2,...]
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = process.env.PM_DEV || 'LivingRoomSocketWifiLeft';
const TAG = (process.argv[2] || 'pre').replace(/[^a-z0-9]/gi, '');
const GETKEYS = (process.argv[4] || '').split(',').filter(Boolean);
const OUT = '/tmp/pmcanary/' + TAG;
fs.mkdirSync(OUT, {recursive: true});
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'pm-pf-' + TAG + '-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
let last = null, avail = null, devices = null, entry = null;
client.on('message', (topic, payload) => {
    try {
        if (topic === 'zigbee2mqtt/' + DEV) { last = JSON.parse(payload.toString()); fs.writeFileSync(OUT + '/device-state.json', JSON.stringify(last, null, 1)); }
        else if (topic === 'zigbee2mqtt/' + DEV + '/availability') { avail = JSON.parse(payload.toString()); fs.writeFileSync(OUT + '/availability.json', JSON.stringify(avail, null, 1)); }
        else if (topic === 'zigbee2mqtt/bridge/devices') {
            devices = JSON.parse(payload.toString());
            fs.writeFileSync(OUT + '/bridge-devices.json', JSON.stringify(devices, null, 1));
            entry = devices.find((d) => d.friendly_name === DEV || d.ieee_address === DEV);
            if (entry) fs.writeFileSync(OUT + '/target-bridge-entry.json', JSON.stringify(entry, null, 1));
        }
    } catch (e) {}
});
(async () => {
    await new Promise((res) => client.on('connect', res));
    await client.subscribe(['zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/availability', 'zigbee2mqtt/bridge/devices']);
    if (GETKEYS.length) {
        const q = {};
        for (const k of GETKEYS) q[k] = '';
        await new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/get', JSON.stringify(q), {qos: 1}, res));
    }
    await new Promise((r) => setTimeout(r, 9000));
    console.log('PM-PREFLIGHT-DONE tag=' + TAG + ' entry=' + (entry ? 'yes' : 'no') + ' state_keys=' + (last ? Object.keys(last).length : 0) + ' avail=' + (avail ? avail.state : 'NONE'));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
