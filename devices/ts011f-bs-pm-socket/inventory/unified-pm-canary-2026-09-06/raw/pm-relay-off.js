'use strict';
// Safety: set PM relay OFF, verify state + power settles near zero. Usage: node pm-relay-off.js
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomSocketWifiLeft';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'pm-off-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const out = {at_utc: new Date().toISOString()};
client.on('message', (topic, payload) => {
    if (topic !== 'zigbee2mqtt/' + DEV) return;
    try {
        const j = JSON.parse(payload.toString());
        if (j.state_relay !== undefined) { out.state_relay = j.state_relay; fs.writeFileSync('/tmp/pmcanary/relay-off.json', JSON.stringify(out, null, 1)); }
        if (j.power !== undefined) out.power = j.power;
        if (j.current !== undefined) out.current = j.current;
    } catch (e) {}
});
(async () => {
    await new Promise((res) => client.on('connect', res));
    await client.subscribe('zigbee2mqtt/' + DEV);
    await new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/set', JSON.stringify({state_relay: 'OFF'}), {qos: 1}, res));
    await new Promise((r) => setTimeout(r, 12000));
    await new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/get', JSON.stringify({state_relay: '', power: '', current: ''}), {qos: 1}, res));
    await new Promise((r) => setTimeout(r, 12000));
    fs.writeFileSync('/tmp/pmcanary/relay-off.json', JSON.stringify(out, null, 1));
    console.log('RELAY-OFF-DONE ' + JSON.stringify(out));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
