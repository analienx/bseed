'use strict';
// Read-only detail fetch for the 5 already-custom units (ruling 5561451599). GET-only.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const DEVS = ['LivingRoomSocketWifiLeft', 'WorkroomSocketCabinet', 'BedroomSocketBalcony', 'WRSocketEntrance', 'BedroomSocketCabinetRight'];
const client = mqtt.connect(m.server, {clientId: 'p004-detail', username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10000});
client.on('connect', async () => {
    const got = {};
    client.on('message', (t, p) => {
        try { if (DEVS.includes(t.slice('zigbee2mqtt/'.length))) got[t.slice('zigbee2mqtt/'.length)] = JSON.parse(p.toString()); } catch (e) {}
    });
    await client.subscribe(DEVS.map((d) => 'zigbee2mqtt/' + d));
    await new Promise((r) => setTimeout(r, 1500));
    for (const d of DEVS) {
        await new Promise((res) => client.publish('zigbee2mqtt/' + d + '/get', JSON.stringify({state_relay: '', device_config_switch: '', update: {}, energy: '', voltage: '', power: ''}), {qos: 1}, res));
        await new Promise((r) => setTimeout(r, 2500));
    }
    await new Promise((r) => setTimeout(r, 5000));
    const out = {at: new Date().toISOString(), detail: {}};
    for (const d of DEVS) {
        const s = got[d] || {};
        out.detail[d] = {device_config: s.device_config_switch ?? null, relay: s.state_relay ?? null, power: s.power ?? null, energy: s.energy ?? null, voltage: s.voltage ?? null, update: s.update ?? null, linkquality: s.linkquality ?? null};
    }
    fs.writeFileSync('/tmp/p004/custom-detail.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
});
