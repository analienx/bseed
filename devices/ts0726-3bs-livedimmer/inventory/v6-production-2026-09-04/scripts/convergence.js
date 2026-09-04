'use strict';
// Step 3 (read + one public GET only): force cache convergence. The new wrapper's
// convertGet reads EP3 0xff05 authoritatively. We require the published
// switch_right_binded_mode to converge to the REAL device value (3 / "Short press"),
// clearing the stale optimistic "Never (disabled)". Also do a raw read for cross-check.
// No SET performed here.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-conv-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const r = {started_utc: new Date().toISOString(), before: {}, after: {}, raw: null, log: []};
const t = () => new Date().toISOString().slice(11, 23);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, payload === '' ? '' : JSON.stringify(payload), {qos: 1}, res));
function capture(slot, j) {
    if ('switch_right_binded_mode' in j) r[slot].switch_right_binded_mode = {value: j.switch_right_binded_mode, at: t()};
    if ('switch_right_binded_mode_switch_right' in j) r[slot].switch_right_binded_mode_ep = {value: j.switch_right_binded_mode_switch_right, at: t()};
    if ('conv_ff05' in j) r.raw = {key: 'conv_ff05', value: j.conv_ff05, at: t()};
}
client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try { capture('after', JSON.parse(payload.toString())); } catch (e) {}
});
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(2000);
    // snapshot the stale retained state BEFORE any get (this is the value we must clear)
    try {
        const st = JSON.parse(fs.readFileSync('/config/zigbee2mqtt/state.json', 'utf8'))[DEV] || {};
        r.before.statejson_switch_right_binded_mode = st.switch_right_binded_mode ?? null;
        r.before.statejson_switch_right_binded_mode_ep = st.switch_right_binded_mode_switch_right ?? null;
    } catch (e) { r.before.error = e.message; }
    // raw authoritative read (independent of public property path)
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65285], state_property: 'conv_ff05', endpoint: 'switch_right'}});
    await wait(9000);
    // public GET -> convertGet reads EP3 and republishes device truth into state
    await pub(`zigbee2mqtt/${DEV}/get`, {switch_right_binded_mode: ''});
    await wait(9000);
    // re-read state.json to confirm persistence of converged value
    try {
        const st = JSON.parse(fs.readFileSync('/config/zigbee2mqtt/state.json', 'utf8'))[DEV] || {};
        r.persisted = {switch_right_binded_mode: st.switch_right_binded_mode ?? null, switch_right_binded_mode_ep: st.switch_right_binded_mode_switch_right ?? null};
    } catch (e) { r.persisted = {error: e.message}; }
    r.verdict = (r.raw && r.raw.value && (r.raw.value[65285] ?? r.raw.value['65285']) !== undefined)
        ? {raw_ff05: r.raw.value[65285] ?? r.raw.value['65285'], published_after_get: (r.after.switch_right_binded_mode || {}).value ?? null}
        : {raw_ff05: null, published_after_get: (r.after.switch_right_binded_mode || {}).value ?? null};
    r.converged = r.verdict.published_after_get === 'Short press' || r.verdict.published_after_get === 'Match local state' || (r.verdict.published_after_get && r.verdict.published_after_get !== 'Never (disabled)');
    r.finished_utc = new Date().toISOString();
    fs.writeFileSync('/tmp/v9/capture/convergence.json', JSON.stringify(r, null, 1));
    console.log(JSON.stringify({before: r.before, raw: r.raw, after_get: r.after, persisted: r.persisted, verdict: r.verdict, converged: r.converged}, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/v9/capture/convergence.json', JSON.stringify(r, null, 1)); } catch (e) {} console.log(JSON.stringify({timeout: true, before: r.before, raw: r.raw, after: r.after})); process.exit(1); }, 45_000);
