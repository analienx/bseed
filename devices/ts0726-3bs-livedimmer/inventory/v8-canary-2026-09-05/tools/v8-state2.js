'use strict';
// Capture the full device payload + availability (READ-ONLY). Usage: node v8-state2.js <tag>
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const TAG = (process.argv[2] || 'pre').replace(/[^a-z0-9]/gi, '');
const OUT = '/tmp/v8canary/' + TAG;
fs.mkdirSync(OUT, {recursive: true});
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-st2-' + TAG + '-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
let last = null, avail = null;
client.on('message', (topic, payload) => {
    try {
        if (topic === 'zigbee2mqtt/' + DEV) { last = JSON.parse(payload.toString()); fs.writeFileSync(OUT + '/device-state.json', JSON.stringify(last, null, 1)); }
        else if (topic === 'zigbee2mqtt/' + DEV + '/availability') { avail = JSON.parse(payload.toString()); fs.writeFileSync(OUT + '/availability.json', JSON.stringify(avail, null, 1)); }
    } catch (e) {}
});
(async () => {
    await new Promise((res) => client.on('connect', res));
    await client.subscribe(['zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/availability']);
    const GET = {device_config: '', state_relay_left: '', state_relay_middle: '', state_relay_right: '', relay_left_physical_mode: '', relay_middle_physical_mode: '', relay_right_physical_mode: '', relay_left_indicator_mode: '', relay_middle_indicator_mode: '', relay_right_indicator_mode: ''};
    await new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/get', JSON.stringify(GET), {qos: 1}, res));
    await new Promise((r) => setTimeout(r, 8000));
    console.log('STATE2-DONE payload=' + (last ? Object.keys(last).length + ' keys' : 'NONE') + ' avail=' + (avail ? avail.state : 'NONE'));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
