'use strict';
// Decisive probe: does V6 firmware retain 0xff05=0 on EP3?
// SET 'Never (disabled)' -> wait -> raw ZCL read 65285 on EP3 (bypasses property decode chain).
// READ + one policy write only (the write the dispatch authorizes).
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-ff05-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});
const r = {started_utc: new Date().toISOString(), sequence: []};
const t = () => new Date().toISOString().slice(11, 23);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));
const raw = {};
client.on('message', (topic, payload) => {
    if (topic !== 'zigbee2mqtt/' + DEV) return;
    try {
        const j = JSON.parse(payload.toString());
        for (const k of Object.keys(j)) if (/^probe_/.test(k)) raw[k + '@' + t()] = j[k];
    } catch (e) {}
});
async function rawRead(tag, beforeCount) {
    await pub(`zigbee2mqtt/${DEV}/set`, {read: {cluster: 'genOnOffSwitchCfg', attributes: [65285], state_property: tag, endpoint: 'switch_right'}});
    const start = Date.now();
    while (Date.now() - start < 20_000) {
        await wait(500);
        if (Object.keys(raw).filter((k) => k.startsWith(tag + '@')).length > beforeCount) return true;
    }
    return false;
}
(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe(`zigbee2mqtt/${DEV}`, res));
    await wait(1500);
    // baseline
    let n = 0;
    await rawRead('probe_ff05_base', n); n++;
    // SET Never
    await pub(`zigbee2mqtt/${DEV}/set`, {switch_right_binded_mode: 'Never (disabled)'});
    r.sequence.push({at: t(), ev: 'SET Never (disabled) published'});
    await wait(10_000);
    // immediate raw read
    await rawRead('probe_ff05_after1', n); n++;
    await wait(20_000);
    await rawRead('probe_ff05_after2', n); n++;
    r.raw = raw;
    r.finished_utc = new Date().toISOString();
    fs.writeFileSync('/tmp/v6prod-20260904-ff05probe.json', JSON.stringify(r, null, 1));
    console.log(JSON.stringify(r, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
setTimeout(() => { fs.writeFileSync('/tmp/v6prod-20260904-ff05probe.json', JSON.stringify({...r, timeout: true, raw}, null, 1)); console.log(JSON.stringify({timeout: true, raw})); process.exit(1); }, 90_000);
