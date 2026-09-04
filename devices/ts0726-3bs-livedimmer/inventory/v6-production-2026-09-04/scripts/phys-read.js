'use strict';
// READ-ONLY: fresh raw physical relay energization EP4/5/6 attr 0xff03 (genOnOff),
// plus logical EP1/2/3 genOnOff 0xff03 via native generic `read` converter.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-phys-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const out = {reads: {}, timeline: []};
const t = () => new Date().toISOString().slice(11, 23);
function done() {
    fs.writeFileSync('/tmp/v6prod-20260904-phys.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out.reads, null, 1));
    client.end(true);
    process.exit(0);
}
let subscribed = false;
client.on('connect', () => client.subscribe(['zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/set'], () => { subscribed = true; run(); }));
client.on('message', (topic, payload) => {
    const s = payload.toString();
    if (topic === 'zigbee2mqtt/' + DEV) {
        try {
            const j = JSON.parse(s);
            for (const k of Object.keys(j)) if (/^phys_/.test(k)) { out.reads[k] = {value: j[k], at: t()}; }
        } catch (e) {}
    }
});
async function run() {
    const targets = [
        ['phys_ep4_relay_left', 'relay_left'],
        ['phys_ep5_relay_middle', 'relay_middle'],
        ['phys_ep6_relay_right', 'relay_right'],
    ];
    for (const [key, endpoint] of targets) {
        client.publish('zigbee2mqtt/' + DEV + '/set', JSON.stringify({
            read: {cluster: 'genOnOff', attributes: [{ID: 0xff03, type: 0x30}], state_property: key, endpoint},
        }), {qos: 1});
        await new Promise((res) => {
            const start = Date.now();
            const iv = setInterval(() => {
                if (out.reads[key] || Date.now() - start > 22_000) { clearInterval(iv); res(); }
            }, 400);
        });
    }
    done();
}
setTimeout(done, 90_000);
