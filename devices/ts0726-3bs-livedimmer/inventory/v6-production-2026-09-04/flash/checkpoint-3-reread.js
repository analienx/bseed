'use strict';
// Step 3 checkpoint (READ-ONLY, endpoint-scoped). Fixed key matching via startsWith
// so it doesn't hit the 12s timeout path per read like the earlier version did.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-ck3-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
client.on('message', (topic, payload) => {
    if (!topic.startsWith(`zigbee2mqtt/${DEV}`)) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (/^pk_/.test(k) && !(k in got)) got[k] = {value: j[k], at: new Date().toISOString().slice(11, 19)}; } catch (e) {}
});
async function r(ep, cluster, attrs, tag) {
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: tag}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 15_000) { if (Object.keys(got).some((k) => k.startsWith(tag))) return; await wait(300); }
    got[tag] = {value: null, timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe([`zigbee2mqtt/${DEV}`, ...['switch_left','switch_middle','switch_right','relay_left','relay_middle','relay_right'].map(e=>`zigbee2mqtt/${DEV}/${e}`)], res));
    await wait(800);
    for (const [n, ep] of [['1','switch_left'],['2','switch_middle'],['3','switch_right']]) {
        await r(ep, 'genOnOffSwitchCfg', [65280], `pk_ep${n}_ff00`);
        await r(ep, 'genOnOffSwitchCfg', [65285], `pk_ep${n}_ff05`);
    }
    for (const [n, ep] of [['4','relay_left'],['5','relay_middle'],['6','relay_right']]) {
        await r(ep, 'genOnOff', [65283], `pk_ep${n}_policy`);
    }
    await r('relay_right', 'genOnOff', [0], 'pk_ep6_onoff');
    const val = (k) => { const hit = Object.keys(got).find((x) => x.startsWith('pk_' + k)); const v = hit && got[hit].value; return v ? (v[Object.keys(v)[0]] ?? null) : null; };
    const checks = {
        ff00_1_1_1: ['ep1_ff00','ep2_ff00','ep3_ff00'].every((k) => val(k) === 1),
        ff05_3_3_0: val('ep1_ff05') === 3 && val('ep2_ff05') === 3 && val('ep3_ff05') === 0,
        policies_on: [val('ep4_policy'), val('ep5_policy'), val('ep6_policy')].every((x) => x === 1),
        right_logical_off: val('ep6_onoff') === 0,
    };
    checks.ALL_PASS = Object.values(checks).every((x) => x === true);
    const out = {at_utc: new Date().toISOString(), raw: got, checks};
    fs.writeFileSync('/tmp/ck3.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify({checks, vals: {ff00: ['ep1_ff00','ep2_ff00','ep3_ff00'].map(val), ff05: ['ep1_ff05','ep2_ff05','ep3_ff05'].map(val), policies: ['ep4_policy','ep5_policy','ep6_policy'].map(val), rightOnOff: val('ep6_onoff')}}, null, 1));
    client.end(true); process.exit(checks.ALL_PASS ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/ck3.json', JSON.stringify({timeout: true, got}, null, 1)); } catch (e) {} console.log(JSON.stringify({timeout: true, got})); process.exit(1); }, 140_000);
