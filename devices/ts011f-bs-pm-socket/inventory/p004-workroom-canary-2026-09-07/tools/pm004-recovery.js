'use strict';
// P004 RECOVERY: revert WorkroomSocketCabinet from V8 (0x12053002) to known-good protection build (0x12053000)
// using the ruling-authorized recovery artifact, via direct target-only ota_update/update. No downgrade-ceremony.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const crypto = require('crypto');
const DEV = 'WorkroomSocketCabinet';
const OTA_PATH = '/tmp/p004-ota/recovery-forced.zigbee';
const REQ_SHA = '02fe4b9f75c6b48b17de913c1aa5a5d1550d622399376c1a38c54d984ea7e4d7';
const OUT = '/tmp/p004';
const now = () => new Date().toISOString();
const logAction = (step, cls, result, detail) => fs.appendFileSync(OUT + '/actions.jsonl', JSON.stringify({timestamp: now(), step, action_class: cls, result, detail}) + '\n');
const data = fs.readFileSync(OTA_PATH);
const sha = crypto.createHash('sha256').update(data).digest('hex');
if (data.length !== 201986 || sha !== REQ_SHA) { console.error('RECOVERY ARTIFACT MISMATCH'); process.exit(2); }
const mfr = data.readUInt16LE(10), img = data.readUInt16LE(12), fv = data.readUInt32LE(14);
logAction('recovery', 'gate', 'PASS', 'artifact 201986B sha=02fe4b9f hdr=' + mfr + '/' + img + '/0x' + fv.toString(16));
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'pm004-recovery', username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10000});
client.on('connect', async () => {
    let lastState = null, resp = null, imageOffered = false, firstBlock = false, maxProgress = 0, terminal = null;
    client.on('message', (topic, payload) => {
        try {
            const s = payload.toString();
            if (!/^zigbee2mqtt\/(bridge\/(logging|response)|WorkroomSocketCabinet)/.test(topic)) return;
            fs.appendFileSync(OUT + '/mqtt/capture-recovery.jsonl', JSON.stringify({timestamp: now(), topic, payload: s.length > 700 ? s.slice(0, 700) + '...[trunc]' : s}) + '\n');
            if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/update') resp = s;
            const msg = topic === 'zigbee2mqtt/bridge/logging' ? (JSON.parse(s).message || '') : '';
            if (topic === 'zigbee2mqtt/bridge/logging') {
                if (/Updating 'WorkroomSocketCabinet'/i.test(msg)) imageOffered = true;
                if (/was OTA updated from/i.test(msg)) terminal = 'updated';
                if (/OTA update of 'WorkroomSocketCabinet' failed/i.test(msg)) { terminal = terminal || 'failed'; logAction('recovery', 'read', 'FAIL', msg.slice(0, 250)); }
            } else if (topic === 'zigbee2mqtt/' + DEV) {
                const j = JSON.parse(s);
                const u = j.update || {};
                if (u.progress !== undefined && u.progress > 0) { if (u.progress > maxProgress) maxProgress = u.progress; firstBlock = true; }
                lastState = j;
            }
        } catch (e) {}
    });
    await client.subscribe(['zigbee2mqtt/bridge/logging', 'zigbee2mqtt/' + DEV, 'zigbee2mqtt/bridge/response/device/ota_update/#']);
    await new Promise((r) => setTimeout(r, 1000));
    const t1 = Date.now();
    await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/update', JSON.stringify({id: DEV, hex: {data: data.toString('hex').toUpperCase(), file_name: 'bseed-b28wrpvx-protection-canary-forced.zigbee'}}), {qos: 1}, res));
    const sentAt = now();
    logAction('recovery', 'mutation', 'SENT', 'direct ota_update/update (revert) at ' + sentAt);
    console.log('RECOVERY-SENT ' + sentAt);
    const tf = Date.now();
    while (Date.now() - tf < 15 * 60 * 1000 && !terminal) {
        await new Promise((r) => setTimeout(r, 3000));
        if (resp && !imageOffered) {
            const rj = JSON.parse(resp);
            if (rj.status === 'error') { logAction('recovery', 'read', 'RESP-ERROR', resp.slice(0, 250)); console.log('RESP-ERROR ' + resp.slice(0, 200)); break; }
        }
    }
    const result = {at: now(), sentAt, directResponse: resp, imageOffered, firstBlock, maxProgress, terminal, finalUpdate: lastState && lastState.update, finalBuild: lastState && (lastState.device || {}).softwareBuildID, finalRelay: lastState && lastState.state_relay};
    fs.writeFileSync(OUT + '/recovery-result.json', JSON.stringify(result, null, 1));
    logAction('recovery', 'read', 'DONE', JSON.stringify({imageOffered, firstBlock, maxProgress, terminal, finalBuild: result.finalBuild, finalRelay: result.finalRelay}));
    console.log('RECOVERY-DONE ' + JSON.stringify({imageOffered, firstBlock, maxProgress, terminal, finalBuild: result.finalBuild, finalRelay: result.finalRelay}));
    client.end(true); process.exit(terminal === 'updated' ? 0 : 3);
});
