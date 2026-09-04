'use strict';
// Task 2 (READ-ONLY): raw genOnOffSwitchCfg attr 0xff00 (switch type; 1=MOMENTARY)
// on EP1/EP2/EP3 of the live V6 target. Unique state_property per read. No writes.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-sw-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const found = {};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (/^sw_/.test(k) && !(k in found)) found[k] = {value: j[k], at: new Date().toISOString().slice(11, 19)}; } catch (e) {}
});
async function readOne(key, endpoint) {
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65280], state_property: key, endpoint}});
    const start = Date.now();
    while (Date.now() - start < 18_000) { if (key in found) return; await wait(400); }
    found[key] = {value: null, at: new Date().toISOString().slice(11, 19), timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(1200);
    await readOne('sw_ep1_0xff00', 'switch_left');
    await readOne('sw_ep2_0xff00', 'switch_middle');
    await readOne('sw_ep3_0xff00', 'switch_right');
    const out = {started_utc: new Date().toISOString(), reads: found,
        summary: {ep1: (found.sw_ep1_0xff00 || {}).value ?? null, ep2: (found.sw_ep2_0xff00 || {}).value ?? null, ep3: (found.sw_ep3_0xff00 || {}).value ?? null},
        all_momentary_1: ['sw_ep1_0xff00', 'sw_ep2_0xff00', 'sw_ep3_0xff00'].every((k) => { const v = found[k]; return v && v.value && (v.value[65280] ?? v.value['65280']) === 1; })};
    fs.writeFileSync('/tmp/v9-swtype.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/v9-swtype.json', JSON.stringify({found, timeout: true}, null, 1)); } catch (e) {} console.log(JSON.stringify({found, timeout: true})); process.exit(1); }, 70_000);
