'use strict';
// §6 frozen-profile application — RIGHT mains LAST, NO bind/group ops.
// Per property: fresh GET baseline -> SET -> fresh GET readback.
// Values from zigbee2mqtt/production/ts0726-v6-profile.json @ d50fd53.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-apply-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const r = {started_utc: new Date().toISOString(), steps: [], errors: []};
const t = () => new Date().toISOString().slice(11, 23);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, payload === '' ? '' : JSON.stringify(payload), {qos: 1}, res));

let latest = {};
client.on('message', (topic, payload) => {
    if (topic !== 'zigbee2mqtt/' + DEV) return;
    try { Object.assign(latest, JSON.parse(payload.toString())); } catch (e) {}
});
client.on('error', (e) => r.errors.push({at: t(), text: 'MQTT ' + e.message}));

async function freshGet(prop) {
    const before = JSON.stringify(latest[prop] ?? null);
    const seenBefore = prop in latest;
    // force re-evaluation: track value change OR any new publish after get
    const stamp = Date.now();
    await pub(`zigbee2mqtt/${DEV}/get`, {[prop]: ''});
    let ok = false;
    const start = Date.now();
    while (Date.now() - start < 25_000) {
        await wait(500);
        // Z2M republishes state on readResponse arrival; detect via value or publish marker
        if (logLines(prop, stamp)) { ok = true; break; }
        if (!seenBefore && prop in latest) { ok = true; break; }
    }
    return {value: latest[prop] ?? null, answered: ok};
}
// crude publish-arrival detector: subscribe to bridge logging for Read result after stamp is noisy;
// instead track ANY state message timestamp via _rx stamp on latest merge
function logLines(prop, since) { return latest.__rx && latest.__rx > since; }
client.on('message', () => { if (!latest.__rx) latest.__rx = 0; latest.__rx = Date.now(); });

async function step(name, prop, setVal, expect) {
    const pre = await freshGet(prop);
    let posted = null;
    if (expect !== undefined && setVal !== undefined && pre.value !== setVal) {
        await pub(`zigbee2mqtt/${DEV}/set`, {[prop]: setVal});
        await wait(6000);
    }
    const post = await freshGet(prop);
    const s = {step: name, prop, pre: pre.value, set: setVal, post: post.value, answered_pre: pre.answered, answered_post: post.answered, ok: setVal === undefined ? true : post.value === setVal, at: t()};
    r.steps.push(s);
    if (!s.ok) { console.log('STEP FAIL', JSON.stringify(s)); throw new Error('readback mismatch ' + name); }
    return s;
}

(async () => {
    await new Promise((res) => { client.on('connect', res); });
    await new Promise((res) => client.subscribe(['zigbee2mqtt/' + DEV], res));
    await wait(2500); // let retained state arrive
    // LEFT
    await step('LEFT direct-binding=Match', 'switch_left_action_mode', 'Match local state');
    await step('LEFT LED=Binding status', 'relay_left_indicator_mode', 'Binding status');
    await step('LEFT update=Short press', 'switch_left_relay_mode', 'Short press');
    await step('LEFT bound=Short press', 'switch_left_binded_mode', 'Short press');
    await step('LEFT channel=Left', 'switch_left_relay_index', 'Left');
    await step('LEFT mains=Always on', 'relay_left_physical_mode', 'Always on');
    // MIDDLE
    await step('MIDDLE direct-binding=Match', 'switch_middle_action_mode', 'Match local state');
    await step('MIDDLE LED=Binding status', 'relay_middle_indicator_mode', 'Binding status');
    await step('MIDDLE update=Short press', 'switch_middle_relay_mode', 'Short press');
    await step('MIDDLE bound=Short press', 'switch_middle_binded_mode', 'Short press');
    await step('MIDDLE channel=Middle', 'switch_middle_relay_index', 'Middle');
    await step('MIDDLE mains=Always on', 'relay_middle_physical_mode', 'Always on');
    // RIGHT (mains still Always on here)
    await step('RIGHT LED=Physical output', 'relay_right_indicator_mode', 'Physical output');
    await step('RIGHT direct-binding=Toggle', 'switch_right_action_mode', 'Toggle');
    await step('RIGHT update=Short press', 'switch_right_relay_mode', 'Short press');
    await step('RIGHT channel=Right', 'switch_right_relay_index', 'Right');
    await step('RIGHT bound=Never (disabled)', 'switch_right_binded_mode', 'Never (disabled)');
    // raw EP3 0xff05 proof via generic read (must be 0)
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65285], state_property: 'rawff05', endpoint: 'switch_right'}});
    await wait(8000);
    r.steps.push({step: 'RIGHT raw 0xff05', expect_raw: 0, raw: latest.__rx ? '(see reads)' : null, abi_rawff05: latest.rawff05 ?? latest.rawff05_switch_right ?? null, at: t()});
    // record RIGHT logical state, then final mains policy
    const logical = await freshGet('state_relay_right');
    r.rightLogicalStateRecorded = {value: logical.value, at: t()};
    await step('RIGHT mains=Follow logical state (FINAL)', 'relay_right_physical_mode', 'Follow logical state');
    // post-switch physical proof: raw 0xff03 on EP6 must now be 0, onOff 0
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOff', attributes: [65283], state_property: 'rawphys6', endpoint: 'relay_right'}});
    await wait(8000);
    r.rightFinalRaw = {rawphys6: latest.rawphys6 ?? latest.rawphys6_relay_right ?? null, state_relay_right: latest.state_relay_right ?? null, relay_right_indicator: latest.relay_right_indicator ?? null, at: t()};
    // standard ABI + identity re-proof after all writes
    for (const ep of ['switch_left', 'switch_middle', 'switch_right']) {
        await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [16], state_property: 'abi_final_' + ep.replace('switch_', ''), endpoint: ep}});
        await wait(4000);
    }
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genBasic', attributes: ['swBuildId'], state_property: 'abi_final_swbuild', endpoint: 'switch_left'}});
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65286], state_property: 'abi_final_ff06_left', endpoint: 'switch_left'}});
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65286], state_property: 'abi_final_ff06_middle', endpoint: 'switch_middle'}});
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65286], state_property: 'abi_final_ff06_right', endpoint: 'switch_right'}});
    await wait(15_000);
    r.finalAbi = Object.fromEntries(Object.keys(latest).filter((k) => k.startsWith('abi_final')).map((k) => [k, latest[k]]));
    r.rawff05_final = latest.rawff05_switch_right ?? latest.rawff05 ?? null;
    r.rightFinalRaw.rawphys6_final = latest.rawphys6_relay_right ?? latest.rawphys6 ?? null;
    r.finished_utc = new Date().toISOString();
    fs.writeFileSync('/tmp/v6prod-20260904-settings.json', JSON.stringify(r, null, 1));
    console.log(JSON.stringify({steps: r.steps.length, fails: r.steps.filter((s) => s.ok === false), errors: r.errors, rightLogical: r.rightLogicalStateRecorded, rightFinalRaw: r.rightFinalRaw, rawff05: r.rawff05_final, finalAbi: r.finalAbi}, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => {
    r.fatal = String(e && e.stack || e);
    fs.writeFileSync('/tmp/v6prod-20260904-settings.json', JSON.stringify(r, null, 1));
    console.error('FATAL', String(e));
    client.end(true);
    process.exit(1);
});
setTimeout(() => { r.timeout = true; fs.writeFileSync('/tmp/v6prod-20260904-settings.json', JSON.stringify(r, null, 1)); console.error('HARD_TIMEOUT'); process.exit(1); }, 420_000);
