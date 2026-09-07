'use strict';
// P006 candidate OTA: target-only ota_update/update with V8-fix1 hex (user-authorized supervisor handoff).
// Device: WorkroomSocketCabinet. Artifact: Actions 10017413394, SHA 2796ab8c..., 195314 bytes.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const crypto = require('crypto');
const DEV = 'WorkroomSocketCabinet';
const IEEE = '0xa4c138c5f07ee732';
const OTA_PATH = '/tmp/p006/candidate.ota';
const REQ_SHA = '2796ab8c44a32ea3c9d640bb06e7c54cc14ed350d8a365415e9174a409d42f12';
const OUT = '/tmp/p006';
const now = () => new Date().toISOString();
const logAction = (step, cls, result, detail) => fs.appendFileSync(OUT + '/actions.jsonl', JSON.stringify({timestamp: now(), step, action_class: cls, result, detail}) + '\n');
const data = fs.readFileSync(OTA_PATH);
const sha = crypto.createHash('sha256').update(data).digest('hex');
if (data.length !== 195314 || sha !== REQ_SHA) { console.error('ARTIFACT MISMATCH'); process.exit(2); }
logAction('p006', 'gate', 'PASS', 'candidate verified ' + sha.slice(0, 12));
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'p006-flash', username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10000});
client.on('connect', async () => {
    let lastState = null, avail = null, resp = null, unschedResp = null, imageOffered = false, firstBlock = false, maxProgress = 0, terminal = null;
    client.on('message', (topic, payload) => {
        try {
            const s = payload.toString();
            if (!/^zigbee2mqtt\/(bridge\/(logging|response)|WorkroomSocketCabinet)/.test(topic)) return;
            fs.appendFileSync(OUT + '/mqtt/capture-p006.jsonl', JSON.stringify({timestamp: now(), topic, payload: s.length > 700 ? s.slice(0, 700) + '...[trunc]' : s}) + '\n');
            if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/unschedule') { unschedResp = s; return; }
            if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/update') resp = s;
            const msg = topic === 'zigbee2mqtt/bridge/logging' ? (JSON.parse(s).message || '') : '';
            if (topic === 'zigbee2mqtt/bridge/logging') {
                if (/Updating 'WorkroomSocketCabinet'/i.test(msg)) imageOffered = true;
                if (/was OTA updated from/i.test(msg)) terminal = 'updated';
                if (/OTA update of 'WorkroomSocketCabinet' failed/i.test(msg)) { terminal = terminal || 'failed'; logAction('p006', 'read', 'FAIL', msg.slice(0, 250)); }
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
    logAction('p006', 'mutation', (unschedResp && JSON.parse(unschedResp).status === 'ok') ? 'PASS' : 'SKIP', 'pre-unschedule=' + (unschedResp || 'none'));
    // 2) candidate update via hex payload
    const t1 = Date.now();
    await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/update', JSON.stringify({id: DEV, hex: {data: data.toString('hex').toUpperCase(), file_name: 'bseed-ts011f-pm-v8-fix1-v12053004.ota'}}), {qos: 1}, res));
    const sentAt = now();
    logAction('p006', 'mutation', 'SENT', 'candidate ota_update/update at ' + sentAt);
    console.log('P006-SENT ' + sentAt);
    const tf = Date.now();
    while (Date.now() - tf < 15 * 60 * 1000 && !terminal) {
        await new Promise((r) => setTimeout(r, 3000));
        if (resp && !imageOffered) {
            const rj = JSON.parse(resp);
            if (rj.status === 'error') { logAction('p006', 'read', 'RESP-ERROR', resp.slice(0, 250)); console.log('RESP-ERROR ' + resp.slice(0, 200)); break; }
            if (rj.status === 'ok') { logAction('p006', 'read', 'RESP-OK', resp.slice(0, 200)); }
        }
    }
    const result = {at: now(), sentAt, directResponse: resp, imageOffered, firstBlock, maxProgress, terminal, finalUpdate: lastState && lastState.update, avail};
    fs.writeFileSync(OUT + '/p006-result.json', JSON.stringify(result, null, 1));
    logAction('p006', 'read', 'DONE', JSON.stringify({imageOffered, firstBlock, maxProgress, terminal}));
    console.log('P006-DONE ' + JSON.stringify({imageOffered, firstBlock, maxProgress, terminal}));
    client.end(true); process.exit(terminal === 'updated' ? 0 : 3);
});
