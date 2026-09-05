'use strict';
// Authorized bounded cleanup per Supervisor 5550531593: remove ONLY EP4/EP5
// genLevelCtrl->coordinator(1) bindings. Unbind -> readback -> unbind -> readback.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-unb-' + Math.random().toString(16).slice(2, 5), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pending = null;
const results = [];
client.on('message', (topic, payload) => {
    if (pending && topic === pending.resp) { try { pending.resolve(JSON.parse(payload.toString())); } catch (e) { pending.resolve({status: 'parse_err'}); } }
});
function req(topic, payload) {
    const resp = topic.replace('/request/', '/response/');
    return new Promise((resolve, reject) => {
        const to = setTimeout(() => { pending = null; reject(new Error('resp timeout')); }, 30_000);
        pending = {resp, resolve: (v) => { clearTimeout(to); pending = null; resolve(v); }};
        client.subscribe(resp, () => client.publish(topic, JSON.stringify(payload), {qos: 1}));
    });
}
async function dumpBindings() {
    return await new Promise((resolve) => {
        const h = (topic, payload) => {
            if (topic !== 'zigbee2mqtt/bridge/devices') return;
            client.unsubscribe('zigbee2mqtt/bridge/devices');
            const d = JSON.parse(payload.toString()).find((x) => x.friendly_name === 'LivingRoomMainDimmer');
            const out = [];
            for (const [ep, v] of Object.entries(d.endpoints)) for (const b of v.bindings) out.push(`${ep}:${b.cluster}->${b.target.ieee_address || 'grp' + b.target.id}${b.target.endpoint ? '/' + b.target.endpoint : ''}`);
            resolve(out.sort());
        };
        client.on('message', h);
        client.subscribe('zigbee2mqtt/bridge/devices');
        setTimeout(() => { client.unsubscribe('zigbee2mqtt/bridge/devices'); resolve(['__timeout__']); }, 12_000);
    });
}
const UNBIND = 'zigbee2mqtt/bridge/request/device/unbind';
(async () => {
    await new Promise((res) => client.on('connect', res));
    const pre = await dumpBindings();
    results.push({stage: 'pre', total: pre.length, bindings: pre});
    console.log('PRE total:', pre.length);
    for (const ep of [4, 5]) {
        const r = await req(UNBIND, {from: 'LivingRoomMainDimmer', from_endpoint: ep, to: 'coordinator', to_endpoint: 1, clusters: ['genLevelCtrl']});
        results.push({stage: 'unbind_ep' + ep, status: r.status, error: r.error || null, sent: {ep, cluster: 'genLevelCtrl', to: 'coordinator/1'}});
        console.log('UNBIND EP' + ep + ':', r.status, r.error || '');
        await wait(2500);
        const snap = await dumpBindings();
        results.push({stage: 'readback_after_ep' + ep, total: snap.length, bindings: snap});
        console.log('READBACK total:', snap.length, '| level4 present:', snap.includes('4:genLevelCtrl->0xfdb1122d004b1200/1'), '| level5 present:', snap.includes('5:genLevelCtrl->0xfdb1122d004b1200/1'));
    }
    fs.writeFileSync('/tmp/unbind-result.json', JSON.stringify(results, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
