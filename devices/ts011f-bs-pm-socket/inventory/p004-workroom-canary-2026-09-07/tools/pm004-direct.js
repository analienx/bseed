'use strict';
// P004 direct OTA initiation (user override): unschedule any leftover, then target-only ota_update/update with V8 hex.
// Full capture; wait for terminal state up to 15 min. Device: WorkroomSocketCabinet.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const crypto = require('crypto');
const DEV = 'WorkroomSocketCabinet';
const IEEE = '0xa4c138c5f07ee732';
const OTA_PATH = '/tmp/pm-ota/forward.ota';
const REQ_SHA = 'c3ccb484c28d7ef08594acc306b2054aed3ba9fcfc9579643da339f7fcc9fe7c';
const OUT = '/tmp/p004';
const now = () => new Date().toISOString();
const logAction = (step, cls, result, detail) => fs.appendFileSync(OUT + '/actions.jsonl', JSON.stringify({timestamp: now(), step, action_class: cls, result, detail}) + '\n');
const data = fs.readFileSync(OTA_PATH);
const sha = crypto.createHash('sha256').update(data).digest('hex');
if (data.length !== 195394 || sha !== REQ_SHA) { console.error('ARTIFACT MISMATCH'); process.exit(2); }
logAction('direct', 'gate', 'PASS', 'artifact verified ' + sha.slice(0, 12));
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'pm004-direct', username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10000});
client.on('connect', async () => {
    let lastState = null, avail = null, resp = null, unschedResp = null, imageOffered = false, firstBlock = false, maxProgress = 0, terminal = null;
    client.on('message', (topic, payload) => {
        try {
            const s = payload.toString();
            if (!/^zigbee2mqtt\/(bridge\/(logging|response)|WorkroomSocketCabinet)/.test(topic)) return;
            fs.appendFileSync(OUT + '/mqtt/capture-direct.jsonl', JSON.stringify({timestamp: now(), topic, payload: s.length > 700 ? s.slice(0, 700) + '...[trunc]' : s}) + '\n');
            if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/unschedule') { unschedResp = s; return; }
            if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/update') resp = s;
            const msg = topic === 'zigbee2mqtt/bridge/logging' ? (JSON.parse(s).message || '') : '';
            if (topic === 'zigbee2mqtt/bridge/logging') {
                if (/Updating 'WorkroomSocketCabinet'/i.test(msg)) imageOffered = true;
                if (/was OTA updated from/i.test(msg)) terminal = 'updated';
                if (/OTA update of 'WorkroomSocketCabinet' failed/i.test(msg)) { terminal = terminal || 'failed'; logAction('direct', 'read', 'FAIL', msg.slice(0, 250)); }
            } else if (topic === 'zigbee2mqtt/' + DEV) {
                const j = JSON.parse(s);
                const u = j.update || {};
                if (u.progress !== undefined && u.progress > 0) { if (u.progress > maxProgress) maxProgress = u.progress; firstBlock = true; }
                lastState = j;
            } else if (topic === 'zigbee2mqtt/' + DEV + '/availability') { avail = JSON.parse(s); }
        } catch (e) {}
    });
    await client.subscribe(['zigbee2mqtt/bridge/logging', 'zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/availability', 'zigbee2mqtt/bridge/response/device/ota_update/#']);
    await new Promise((r) => setTimeout(r, 1000));
    // 1) unschedule leftover
    await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/unschedule', JSON.stringify({id: DEV}), {qos: 1}, res));
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && !unschedResp) await new Promise((r) => setTimeout(r, 500));
    logAction('direct', 'mutation', (unschedResp && JSON.parse(unschedResp).status === 'ok') ? 'PASS' : 'SKIP', 'pre-unschedule=' + (unschedResp || 'none'));
    // 2) direct update
    const t1 = Date.now();
    await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/update', JSON.stringify({id: DEV, hex: {data: data.toString('hex').toUpperCase(), file_name: 'bseed-ts011f-pm-v8-ded91a1.ota'}}), {qos: 1}, res));
    const sentAt = now();
    logAction('direct', 'mutation', 'SENT', 'direct ota_update/update at ' + sentAt);
    console.log('DIRECT-SENT ' + sentAt);
    const tf = Date.now();
    while (Date.now() - tf < 15 * 60 * 1000 && !terminal) {
        await new Promise((r) => setTimeout(r, 3000));
        if (resp && !imageOffered) {
            const rj = JSON.parse(resp);
            if (rj.status === 'error') { logAction('direct', 'read', 'RESP-ERROR', resp.slice(0, 250)); console.log('RESP-ERROR ' + resp.slice(0, 200)); break; }
            if (rj.status === 'ok') { logAction('direct', 'read', 'RESP-OK', resp.slice(0, 200)); }
        }
    }
    const result = {at: now(), sentAt, directResponse: resp, imageOffered, firstBlock, maxProgress, terminal, finalUpdate: lastState && lastState.update, avail};
    fs.writeFileSync(OUT + '/direct-result.json', JSON.stringify(result, null, 1));
    logAction('direct', 'read', 'DONE', JSON.stringify({imageOffered, firstBlock, maxProgress, terminal}));
    console.log('DIRECT-DONE ' + JSON.stringify({imageOffered, firstBlock, maxProgress, terminal}));
    client.end(true); process.exit(terminal === 'updated' ? 0 : 3);
});
