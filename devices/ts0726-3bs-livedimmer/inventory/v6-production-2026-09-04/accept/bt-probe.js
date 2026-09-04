'use strict';
// Direct read of the device's own binding tables (genBinding 0x0000) on EP1/2/3.
// READ-ONLY. Results land in published state (bt* keys) AND debug log readResponse.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-bt-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (k.startsWith('bt') && !(k in got)) got[k] = j[k]; } catch (e) {}
});
async function r(ep, tag) {
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster: 'genBinding', attributes: [0], state_property: tag}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 14_000) { if (tag in got || Object.keys(got).some((k) => k.startsWith(tag))) return; await wait(300); }
    got[tag] = {__timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(600);
    await r('switch_left', 'bt_ep1');
    await r('switch_middle', 'bt_ep2');
    await r('switch_right', 'bt_ep3');
    const out = {at_utc: new Date().toISOString(), reads: got};
    fs.writeFileSync('/tmp/bt.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
