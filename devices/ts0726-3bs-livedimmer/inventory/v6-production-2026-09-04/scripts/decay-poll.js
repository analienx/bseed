'use strict';
// READ-ONLY decay poll: unique state_property per sample so a NEW answer is
// distinguishable from merged retained state. NO SET.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-decay-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const samples = [];
const seenKeys = new Set();
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try {
        const j = JSON.parse(payload.toString());
        for (const k of Object.keys(j)) {
            if (/^dc\d+_/.test(k) && !seenKeys.has(k)) {
                seenKeys.add(k);
                samples.push({key: k, at: new Date().toISOString().slice(11, 19), raw: j[k]});
            }
        }
    } catch (e) {}
});
async function poll(tag) {
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65285], state_property: tag, endpoint: 'switch_right'}});
    const start = Date.now();
    while (Date.now() - start < 16_000) { if (seenKeys.has(tag)) return; await wait(400); }
    samples.push({key: tag, at: new Date().toISOString().slice(11, 19), raw: null, timeout: true});
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(1000);
    await poll('dc1_ff05');
    await wait(20_000); await poll('dc2_ff05');
    await wait(20_000); await poll('dc3_ff05');
    await wait(40_000); await poll('dc4_ff05');
    await wait(60_000); await poll('dc5_ff05');
    const out = {started_utc: new Date().toISOString(), samples};
    fs.writeFileSync('/tmp/v9/capture/decay-poll.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(samples, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/v9/capture/decay-poll.json', JSON.stringify({samples, hard_timeout: true}, null, 1)); } catch (e) {} console.log(JSON.stringify(samples)); process.exit(1); }, 260_000);
