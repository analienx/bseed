'use strict';
// Final read-only as-left verification. No writes at all (reads + subscribes only).
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-final-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const r = {started_utc: new Date().toISOString(), values: {}, errors: []};
const t = () => new Date().toISOString().slice(11, 23);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));
let lastRx = 0;
client.on('message', (topic, payload) => {
    if (topic !== 'zigbee2mqtt/' + DEV) return;
    try { const j = JSON.parse(payload.toString()); for (const k of Object.keys(j)) if (/^v_/.test(k)) { r.values[k] = {value: j[k], at: t()}; lastRx = Date.now(); } } catch (e) {}
});
async function read(tag, cluster, attrs, endpoint) {
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster, attributes: attrs, state_property: tag, endpoint}});
    const start = Date.now();
    while (Date.now() - start < 20_000) { if (r.values[tag]) return; await wait(400); }
    r.values[tag] = {value: null, at: t(), timeout: true};
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(1200);
    for (const [tag, ep] of [['v_std_left', 'switch_left'], ['v_std_middle', 'switch_middle'], ['v_std_right', 'switch_right']]) {
        await read(tag, 'genOnOffSwitchCfg', [16], ep);
    }
    for (const [tag, ep] of [['v_ff06_left', 'switch_left'], ['v_ff06_middle', 'switch_middle'], ['v_ff06_right', 'switch_right']]) {
        await read(tag, 'genOnOffSwitchCfg', [65286], ep);
    }
    for (const [tag, ep] of [['v_ff05_left', 'switch_left'], ['v_ff05_middle', 'switch_middle'], ['v_ff05_right', 'switch_right']]) {
        await read(tag, 'genOnOffSwitchCfg', [65285], ep);
    }
    for (const [tag, ep] of [['v_mains_ep4', 'relay_left'], ['v_mains_ep5', 'relay_middle'], ['v_mains_ep6', 'relay_right']]) {
        await read(tag, 'genOnOff', [65283], ep);
    }
    await read('v_swbuild', 'genBasic', ['swBuildId'], 'switch_left');
    await read('v_devconfig', 'genBasic', [65280], 'switch_left');
    r.finished_utc = new Date().toISOString();
    fs.writeFileSync('/tmp/v6prod-20260904-finalverify.json', JSON.stringify(r, null, 1));
    console.log(JSON.stringify(r.values, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { try { fs.writeFileSync('/tmp/v6prod-20260904-finalverify.json', JSON.stringify({...r, timeout: true}, null, 1)); } catch (e) {} console.log(JSON.stringify(r.values, null, 1)); process.exit(1); }, 260_000);
