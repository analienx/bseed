'use strict';
// Precondition restoration (dispatch §3C "mains = 1/1/1" + §6 RIGHT-prep ordering):
// set relay_right_physical_mode = "Always on" (was drifted to "Follow logical state"
// out of sequence), read back, plus per-EP standard 0x0010 re-proof.
// ONE policy write. No bind/group/OTA/config-file mutation.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-restore-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const r = {started_utc: new Date().toISOString(), events: [], reads: {}, errors: []};
const t = () => new Date().toISOString().slice(11, 23);
let subscribed = false;
client.on('connect', () => client.subscribe(['zigbee2mqtt/' + DEV, 'zigbee2mqtt/bridge/logging', 'zigbee2mqtt/LivingRoomMainDimmer/set'], () => { subscribed = true; }));
client.on('message', (topic, payload) => {
    const s = payload.toString();
    if (topic === 'zigbee2mqtt/' + DEV) {
        try {
            const j = JSON.parse(s);
            for (const k of ['relay_right_physical_mode', 'state_relay_right']) if (k in j) r.reads[k + '@' + t()] = j[k];
            for (const k of Object.keys(j)) if (/^abi_/.test(k)) r.reads[k + '@' + t()] = j[k];
        } catch (e) {}
    }
    if (topic === 'zigbee2mqtt/bridge/logging' && /error|warn/i.test(s) && s.includes(DEV)) r.errors.push({at: t(), text: s.slice(0, 300)});
    if (topic === 'zigbee2mqtt/' + DEV + '/set') r.events.push({at: t(), set: s.slice(0, 200)});
});
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
function anyRead(prefix) {
    return Object.keys(r.reads).some((k) => k.startsWith(prefix));
}
async function waitForRead(prefix, ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if (anyRead(prefix)) return true;
        await wait(500);
    }
    return false;
}
(async () => {
    while (!subscribed) await wait(100);
    // before-state (fresh GET)
    await pub(`zigbee2mqtt/${DEV}/get`, {relay_right_physical_mode: '', state_relay_right: ''});
    await waitForRead('relay_right_physical_mode@', 20_000);
    // restore Always on
    await pub(`zigbee2mqtt/${DEV}/set`, {relay_right_physical_mode: 'Always on'});
    await wait(4000);
    await pub(`zigbee2mqtt/${DEV}/get`, {relay_right_physical_mode: '', state_relay_right: ''});
    await waitForRead('relay_right_physical_mode@', 20_000).then(() => wait(1500));
    // per-EP standard re-proof
    for (const ep of ['switch_left', 'switch_middle', 'switch_right']) {
        await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [16], state_property: 'abi_switchactions_' + ep.replace('switch_', ''), endpoint: ep}});
        await wait(3000);
    }
    r.finished_utc = new Date().toISOString();
    fs.writeFileSync('/tmp/v6prod-20260904-restore.json', JSON.stringify(r, null, 1));
    console.log(JSON.stringify({events: r.events.length, errors: r.errors, reads: r.reads}, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { console.error('HARD_TIMEOUT'); process.exit(1); }, 150_000);
