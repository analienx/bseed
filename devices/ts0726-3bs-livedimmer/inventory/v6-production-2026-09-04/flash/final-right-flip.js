'use strict';
// FINAL profile step: RIGHT mains -> Follow logical state (ruling 5543706214 step 4;
// persistence gate passed). Then raw readbacks: EP6 policy must be 0, logical 0,
// physical follows to OFF. LEFT/MIDDLE untouched. No bind ops.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-final-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const got = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (/^fin_/.test(k)) got[k] = {value: j[k], at: new Date().toISOString().slice(11, 19)}; } catch (e) {}
});
async function raw(tag, expectMs) {
    const start = Date.now();
    while (Date.now() - start < (expectMs || 15_000)) { if (Object.keys(got).some((k) => k.startsWith(tag))) return got[Object.keys(got).find((k) => k.startsWith(tag))].value; await wait(300); }
    return {timeout: true};
}
async function r(ep, cluster, attrs, tag) {
    await pub(`zigbee2mqtt/${DEV}/${ep}/set`, {read: {cluster, attributes: attrs, state_property: tag}});
    return raw(tag);
}
const v = (o) => (o ? o[Object.keys(o)[0]] : null) ?? null;
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(1200);
    const out = {at_utc: new Date().toISOString(), steps: []};
    // pre-state
    out.pre = {policy: v(await r('relay_right', 'genOnOff', [65283], 'fin_pre_policy')), logical: v(await r('relay_right', 'genOnOff', [0], 'fin_pre_logical'))};
    // the flip
    await pub(`zigbee2mqtt/${DEV}/set`, {relay_right_physical_mode: 'Follow logical state'});
    out.steps.push({at: new Date().toISOString().slice(11, 19), action: 'SET relay_right_physical_mode=Follow logical state'});
    await wait(8000);
    // readbacks: policy attr + public property + logical; and LEFT/MIDDLE policies unchanged
    out.post = {
        policy_raw: v(await r('relay_right', 'genOnOff', [65283], 'fin_post_policy')),
        logical_raw: v(await r('relay_right', 'genOnOff', [0], 'fin_post_logical')),
        left_policy: v(await r('relay_left', 'genOnOff', [65283], 'fin_left_policy')),
        mid_policy: v(await r('relay_middle', 'genOnOff', [65283], 'fin_mid_policy')),
    };
    await wait(1500);
    out.verdict = {
        right_policy_follows: out.post.policy_raw === 0,
        right_logical_off: out.post.logical_raw === 0,
        left_still_always_on: out.post.left_policy === 1,
        middle_still_always_on: out.post.mid_policy === 1,
    };
    out.verdict.ALL_PASS = Object.values(out.verdict).every((x) => x === true);
    fs.writeFileSync('/tmp/final-flip.json', JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    client.end(true); process.exit(out.verdict.ALL_PASS ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({got, timeout: true})); process.exit(1); }, 90_000);
