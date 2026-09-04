'use strict';
// POST-OTA verification (READ-ONLY, endpoint-scoped). V7 identity + safety attrs.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-post-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {}; let stateSnap = null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
client.on('message', (topic, payload) => {
    if (topic === `zigbee2mqtt/${DEV}`) {
        try {
            const j = JSON.parse(payload.toString());
            if (j.update) stateSnap = {update: j.update, software_build_id: j.device && j.device.softwareBuildID};
            for (const k of Object.keys(j)) if (/^po_/.test(k) && !(k in got)) got[k] = j[k];
        } catch (e) {}
    }
});
async function r(ep, cluster, attrs, tag) {
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: tag}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 15_000) { if (Object.keys(got).some((k) => k.startsWith(tag))) return; await wait(300); }
    got[tag] = {__timeout: true};
}
const num = (tag) => { const k = Object.keys(got).find((x) => x.startsWith(tag)); const v = k && got[k]; if (!v) return null; return v[Object.keys(v)[0]] ?? null; };
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe([`zigbee2mqtt/${DEV}`, ...['switch_left','switch_middle','switch_right','relay_left','relay_middle','relay_right'].map((e)=>`zigbee2mqtt/${DEV}/${e}`)], res));
    await wait(1500);
    await r('switch_left', 'genBasic', ['swBuildId'], 'po_swbuild');
    for (const [n, ep] of [['1','switch_left'],['2','switch_middle'],['3','switch_right']]) {
        await r(ep, 'genOnOffSwitchCfg', [65280], `po_ep${n}_ff00`);
        await r(ep, 'genOnOffSwitchCfg', [65285], `po_ep${n}_ff05`);
        await r(ep, 'genOnOffSwitchCfg', [16], `po_ep${n}_std`);
    }
    for (const [n, ep] of [['4','relay_left'],['5','relay_middle'],['6','relay_right']]) {
        await r(ep, 'genOnOff', [65283], `po_ep${n}_policy`);
    }
    await r('relay_right', 'genOnOff', [0], 'po_ep6_onoff');
    await wait(2000);
    const checks = {
        swbuild_is_v7: num('po_swbuild') === '1.1.7-bseedv7',
        swbuild_value: num('po_swbuild'),
        ff00_1_1_1: [1,2,3].every((i) => num('po_ep'+i+'_ff00') === 1),
        std_2_2_2: [1,2,3].every((i) => num('po_ep'+i+'_std') === 2),
        ff05_3_3_0: num('po_ep1_ff05') === 3 && num('po_ep2_ff05') === 3 && num('po_ep3_ff05') === 0,
        ff05_values: [num('po_ep1_ff05'), num('po_ep2_ff05'), num('po_ep3_ff05')],
        policies_on: [4,5,6].every((i) => num('po_ep'+i+'_policy') === 1),
        right_logical_off: num('po_ep6_onoff') === 0,
    };
    checks.nvm_persistence_proof = checks.ff05_3_3_0 && checks.swbuild_is_v7;
    checks.ALL_PASS = checks.swbuild_is_v7 && checks.ff00_1_1_1 && checks.std_2_2_2 && checks.ff05_3_3_0 && checks.policies_on && checks.right_logical_off;
    const out = {at_utc: new Date().toISOString(), checks, stateSnap, raw: got};
    fs.writeFileSync('/tmp/post-ota.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify({checks, stateSnap}, null, 1));
    client.end(true); process.exit(checks.ALL_PASS ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/post-ota.json', JSON.stringify({timeout: true, got, stateSnap}, null, 1)); } catch (e) {} console.log(JSON.stringify({timeout: true, got, stateSnap})); process.exit(1); }, 150_000);
