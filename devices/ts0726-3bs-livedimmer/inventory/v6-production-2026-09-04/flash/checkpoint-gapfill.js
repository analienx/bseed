'use strict';
// Check #6 gap-fill (READ-ONLY, endpoint-scoped): RIGHT (EP6) logical onOff + confirm 0xff03 policy.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-ck6b-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
client.on('message', (topic, payload) => {
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (/^gk_/.test(k) && !(k in got)) got[k] = {value: j[k], via: topic}; } catch (e) {}
});
async function r(ep, cluster, attrs, tag) {
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: tag}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 12_000) { if (Object.keys(got).some((k) => k.startsWith(tag))) return; await wait(300); }
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(800);
    await r('relay_right', 'genOnOff', [0], 'gk_ep6_onoff');
    await r('relay_right', 'genOnOff', [65283], 'gk_ep6_policy');
    const out = {at_utc: new Date().toISOString(), got};
    out.rightLogicalOff = Object.entries(got).some(([k, v]) => k.startsWith('gk_ep6_onoff') && (v.value.onOff ?? v.value[0]) === 0);
    out.rightPolicyAlwaysOn = Object.entries(got).some(([k, v]) => k.startsWith('gk_ep6_policy') && (v.value[65283] ?? v.value['65283']) === 1);
    fs.writeFileSync('/tmp/ck6b.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({timeout: true, got})); process.exit(1); }, 40_000);
