'use strict';
// Raw post-OTA reads: genBasic 0xff01 (deviceConfig) EP1 + genBasic 0xff02 (indicator cfg) EP4/5/6.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const TAG = process.argv[2] || 'post';
const OUT = '/tmp/v8canary/' + TAG;
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-raw9-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const got = {};
client.on('message', (topic, payload) => {
    if (topic !== 'zigbee2mqtt/' + DEV) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (k.startsWith('rw9_')) got[k] = j[k]; } catch (e) {}
});
async function epRead(ep, cluster, attrs, tag) {
    const t = 'rw9_' + tag;
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: t}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 14_000) { if (Object.keys(got).some((k) => k.startsWith(t))) return; await wait(300); }
    got[t] = {__timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await client.subscribe('zigbee2mqtt/' + DEV);
    await wait(800);
    await epRead('switch_left', 'genBasic', [65280], 'devcfg_ep1');
    await epRead('relay_left', 'genBasic', [65282], 'led_ep4');
    await epRead('relay_middle', 'genBasic', [65282], 'led_ep5');
    await epRead('relay_right', 'genBasic', [65282], 'led_ep6');
    const out = {at_utc: new Date().toISOString(), reads: got};
    fs.writeFileSync(OUT + '/raw-device-config-post.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
