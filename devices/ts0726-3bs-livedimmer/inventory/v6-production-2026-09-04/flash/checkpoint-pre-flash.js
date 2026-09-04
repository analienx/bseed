'use strict';
// CHECK #6 pre-flash checkpoint — READ ONLY, endpoint-scoped topics ONLY.
// Required: EP1/2/3 0xff05=3/3/0, 0xff00=1/1/1, 0x0010=2/2/2, 0xff06=3/3/x;
// RIGHT mains policy Always on (EP6 0xff03=1), RIGHT logical OFF (EP6 onOff=0),
// LEFT/MIDDLE final profile (EP4/5 0xff03=1, 0xff02 indicator modes, 0xff06=3/3).
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-ck6-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
client.on('message', (topic, payload) => {
    if (!topic.startsWith(`zigbee2mqtt/${DEV}`)) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (/^ck_/.test(k) && !(k in got)) got[k] = {value: j[k], via: topic, at: new Date().toISOString().slice(11, 19)}; } catch (e) {}
});
async function r(ep, cluster, attrs, tag) {
    await new Promise((res) => client.publish(`zigbee2mqtt/${DEV}/${ep}/set`, JSON.stringify({read: {cluster, attributes: attrs, state_property: tag}}), {qos: 1}, res));
    const start = Date.now();
    while (Date.now() - start < 12_000) { if (tag in got) return got[tag].value; await wait(300); }
    got[tag] = {value: null, timeout: true};
    return null;
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe([`zigbee2mqtt/${DEV}`, `zigbee2mqtt/${DEV}/switch_left`, `zigbee2mqtt/${DEV}/switch_middle`, `zigbee2mqtt/${DEV}/switch_right`, `zigbee2mqtt/${DEV}/relay_left`, `zigbee2mqtt/${DEV}/relay_middle`, `zigbee2mqtt/${DEV}/relay_right`], res));
    await wait(1000);
    for (const [n, ep] of [['1', 'switch_left'], ['2', 'switch_middle'], ['3', 'switch_right']]) {
        await r(ep, 'genOnOffSwitchCfg', [65285], `ck_ep${n}_ff05`);
        await r(ep, 'genOnOffSwitchCfg', [65280], `ck_ep${n}_ff00`);
        await r(ep, 'genOnOffSwitchCfg', [16], `ck_ep${n}_std`);
        await r(ep, 'genOnOffSwitchCfg', [65286], `ck_ep${n}_ff06`);
    }
    for (const [n, ep] of [['4', 'relay_left'], ['5', 'relay_middle'], ['6', 'relay_right']]) {
        await r(ep, 'genOnOff', [65283], `ck_ep${n}_policy`);
        await r(ep, 'genOnOff', [65282], `ck_ep${n}_led`);
        await r(ep, 'genOnOff', [0], `ck_ep${n}_onoff`);
    }
    await r('switch_left', 'genBasic', ['swBuildId'], 'ck_swbuild');
    const summary = {};
    for (const k of Object.keys(got)) summary[k.replace(/@.*/, '')] = got[k].value;
    const num = (v) => v && (v[Object.keys(v)[0]] ?? Object.values(v)[0]);
    const checks = {
        ep1_ff05_eq3: num(summary.ck_ep1_ff05) === 3,
        ep2_ff05_eq3: num(summary.ck_ep2_ff05) === 3,
        ep3_ff05_eq0: num(summary.ck_ep3_ff05) === 0,
        ff00_1_1_1: [1, 2, 3].every((i) => num(summary['ck_ep' + i + '_ff00']) === 1),
        std_2_2_2: [1, 2, 3].every((i) => num(summary['ck_ep' + i + '_std']) === 2),
        ep1_ff06_eq3: num(summary.ck_ep1_ff06) === 3,
        ep2_ff06_eq3: num(summary.ck_ep2_ff06) === 3,
        ep6_policy_always_on: num(summary.ck_ep6_policy) === 1,
        ep4_policy_always_on: num(summary.ck_ep4_policy) === 1,
        ep5_policy_always_on: num(summary.ck_ep5_policy) === 1,
        ep6_logical_off: num(summary.ck_ep6_onoff) === 0,
        swbuild: summary.ck_swbuild,
    };
    checks.ALL_PASS = Object.entries(checks).filter(([k]) => k !== 'swbuild' && k !== 'ALL_PASS').every(([, v]) => v === true);
    const out = {at_utc: new Date().toISOString(), reads: summary, checks};
    fs.writeFileSync('/tmp/ck6.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({timeout: true, got})); process.exit(1); }, 240_000);
