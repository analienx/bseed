'use strict';
// P002 unified-PM diagnostic/canary toolkit (issue #11 superseding ruling; issue #53 op shapes).
// Modes: preflight | schedule | observe <seconds> | unschedule | postcheck | canary
// Hard gates: artifact SHA/size/header, target identity, relay OFF, no other OTA. Sanitized evidence only.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const crypto = require('crypto');

const DEV = 'LivingRoomSocketWifiLeft';
const IEEE = '0xa4c138ba60b92c5f';
const OTA_PATH = '/tmp/pm-ota/forward.ota';
const REQ = {
    sha256: 'c3ccb484c28d7ef08594acc306b2054aed3ba9fcfc9579643da339f7fcc9fe7c',
    bytes: 195394, mfr: 4417, img: 43556, fv: 302329858, swBuild: '1.2.5-bseedv8u1',
    file_name: 'bseed-ts011f-pm-v8-ded91a1.ota', sourceRun: '34015243265',
    artifact: 'bseed-pm-v8-reproducibility', sourceSHA: 'ded91a1fb1cdeb320d0858c8f4bcabab32bf5564',
};
const TGT = { ieee: IEEE, mfr: 'b28wrpvx', model: 'TS011F-BS-PM', role: 'Router', deviceConfig: 'b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;' };
const OUT = '/tmp/pm002';
fs.mkdirSync(OUT, {recursive: true});
fs.mkdirSync(OUT + '/mqtt', {recursive: true});
fs.mkdirSync(OUT + '/z2m', {recursive: true});
const MODE = process.argv[2];
const ARG = process.argv[3];
const now = () => new Date().toISOString();
const logAction = (step, cls, result, detail) => {
    fs.appendFileSync(OUT + '/actions.jsonl', JSON.stringify({timestamp: now(), step, action_class: cls, result, detail}) + '\n');
};
const fail = (step, msg) => { logAction(step, 'gate', 'FAIL', msg); console.error('FATAL ' + msg); process.exit(2); };

function verifyArtifact() {
    const data = fs.readFileSync(OTA_PATH);
    const sha = crypto.createHash('sha256').update(data).digest('hex');
    const mfr = data.readUInt16LE(10), img = data.readUInt16LE(12), fv = data.readUInt32LE(14), total = data.readUInt32LE(52);
    const id = data.readUInt32LE(0);
    const ok = data.length === REQ.bytes && sha === REQ.sha256 && mfr === REQ.mfr && img === REQ.img && fv === REQ.fv && total === data.length;
    const hdr = {identifier: '0x' + id.toString(16).toUpperCase(), headerVersion: data.readUInt16LE(4), headerLength: data.readUInt16LE(6), manufacturerCode: mfr, imageType: img, fileVersion: fv, stackVersion: data.readUInt16LE(18), totalImageSize: total};
    if (!ok) fail('artifact', 'artifact mismatch: bytes=' + data.length + ' sha=' + sha + ' hdr=' + JSON.stringify(hdr));
    fs.writeFileSync(OUT + '/hashes.txt', ['file_name: ' + REQ.file_name, 'bytes: ' + data.length, 'sha256: ' + sha, 'source_repo: analienx/tuya-zigbee-switch PR#5', 'source_SHA: ' + REQ.sourceSHA, 'actions_run: ' + REQ.sourceRun + ' artifact: ' + REQ.artifact, 'header: ' + JSON.stringify(hdr)].join('\n') + '\n');
    logAction('artifact', 'gate', 'PASS', 'bytes=' + data.length + ' sha256=' + sha + ' mfr=' + mfr + ' img=' + img + ' fv=' + fv + ' total=' + total);
    return {data, sha, hdr};
}

function connect(cb) {
    const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
    const m = cfg.mqtt;
    const client = mqtt.connect(m.server, {clientId: 'pm002-' + MODE + '-' + Math.random().toString(16).slice(2, 6), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000, keepalive: 60});
    client.on('connect', () => cb(client, cfg));
    return client;
}

const targetGate = (state) => {
    if (!state) fail('target', 'no device state received');
    const d = state.device || {};
    const errs = [];
    if (d.friendlyName !== DEV) errs.push('name');
    if (d.ieeeAddr !== TGT.ieee) errs.push('ieee');
    if (d.manufacturerName !== TGT.mfr) errs.push('manufacturer:' + d.manufacturerName);
    if (d.model !== TGT.model && d.model !== 'TS011F_plug_1_2') errs.push('model:' + d.model);
    if (d.type !== TGT.role) errs.push('type:' + d.type);
    if (state.device_config_switch !== TGT.deviceConfig) errs.push('device_config:' + state.device_config_switch);
    if (errs.length) fail('target', 'identity mismatch: ' + errs.join(','));
    logAction('target', 'gate', 'PASS', 'identity+device_config exact: ' + DEV + ' / ' + TGT.ieee);
};

async function collectState(client, secs) {
    return new Promise((resolve) => {
        let last = null, avail = null, devices = null;
        client.on('message', (topic, payload) => {
            try {
                const s = payload.toString();
                if (topic === 'zigbee2mqtt/' + DEV) { last = JSON.parse(s); fs.appendFileSync(OUT + '/mqtt/device-states.jsonl', JSON.stringify({timestamp: now(), state: {state_relay: last.state_relay, update: last.update, voltage: last.voltage, current: last.current, power: last.power, energy: last.energy, overload_alarm_switch: last.overload_alarm_switch, lq: last.linkquality}}) + '\n'); }
                else if (topic === 'zigbee2mqtt/' + DEV + '/availability') { avail = JSON.parse(s); }
                else if (topic === 'zigbee2mqtt/bridge/devices') { devices = JSON.parse(s); }
            } catch (e) {}
        });
        (async () => {
            await client.subscribe(['zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/availability', 'zigbee2mqtt/bridge/devices']);
            await new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/get', JSON.stringify({state_relay: '', device_config_switch: '', update: ''}), {qos: 1}, res));
            await new Promise((r) => setTimeout(r, secs * 1000));
            resolve({last, avail, devices});
        })();
    });
}
if (MODE === 'preflight') {
    const art = verifyArtifact();
    connect(async (client, cfg) => {
        const st = await collectState(client, 9);
        targetGate(st.last);
        const otaCfg = cfg.ota || {};
        const target = (st.devices || []).find((d) => d.friendly_name === DEV);
        const preflight = {
            timestamp: now(), mode: 'DIRECT_LOCAL_TOOLKIT', proposal: 'P002',
            artifact: {file_name: REQ.file_name, bytes: REQ.bytes, sha256: art.sha, header: art.hdr, source_run: REQ.sourceRun, artifact: REQ.artifact, source_SHA: REQ.sourceSHA},
            z2m: {version: require('/app/package.json').version, ota_config: {block_size: otaCfg.block_size, default_maximum_data_size: otaCfg.default_maximum_data_size, image_block_request_timeout: otaCfg.image_block_request_timeout ?? 150000, image_block_response_delay: otaCfg.image_block_response_delay ?? 250, disable_automatic_update_check: otaCfg.disable_automatic_update_check ?? false, update_check_interval: otaCfg.update_check_interval ?? 'default(1440min)'}},
            target: {friendly_name: DEV, ieee: IEEE, manufacturer: (st.last.device || {}).manufacturerName, model_id: target && target.model_id, model_def: (st.last.device || {}).model, type: (st.last.device || {}).type, network_address: (st.last.device || {}).networkAddress, software_build_id: target && target.software_build_id, date_code: target && target.date_code, update: st.last.update, device_config: st.last.device_config_switch, availability: st.avail, relay: st.last.state_relay, metering: {voltage: st.last.voltage, current: st.last.current, power: st.last.power, apparent_power: st.last.apparent_power, reactive_power: st.last.reactive_power, power_factor: st.last.power_factor, energy: st.last.energy, overload_alarm_switch: st.last.overload_alarm_switch}, calibration_exposed: false, other: {multi_press_reset_count: st.last.multi_press_reset_count_switch, network_led: st.last.network_led_switch, power_on_behavior: st.last.power_on_behavior_relay, indicator: st.last.relay_indicator_mode_relay}},
        };
        fs.writeFileSync(OUT + '/preflight.json', JSON.stringify(preflight, null, 1));
        fs.writeFileSync(OUT + '/target.json', JSON.stringify(preflight.target, null, 1));
        const gates = {online: st.avail && st.avail.state === 'online', relay_off: st.last.state_relay === 'OFF', identity_ok: true, artifact_ok: true};
        logAction('preflight', 'read', gates.online && gates.relay_off ? 'PASS' : 'FAIL', 'online=' + gates.online + ' relay=' + st.last.state_relay);
        console.log('PREFLIGHT-DONE ' + JSON.stringify(gates) + ' update.state=' + (st.last.update && st.last.update.state));
        client.end(true); process.exit(gates.online && gates.relay_off ? 0 : 2);
    });
} else if (MODE === 'schedule') {
    const art = verifyArtifact();
    connect(async (client) => {
        const st = await collectState(client, 9);
        targetGate(st.last);
        if (st.last.state_relay !== 'OFF') fail('schedule', 'relay not OFF: ' + st.last.state_relay);
        if (!(st.avail && st.avail.state === 'online')) fail('schedule', 'target not online');
        const req = {id: DEV, hex: {data: art.data.toString('hex').toUpperCase(), file_name: REQ.file_name}};
        const summary = {timestamp: now(), topic: 'zigbee2mqtt/bridge/request/device/ota_update/schedule', target: DEV, file_name: REQ.file_name, bytes: REQ.bytes, sha256: art.sha, header: art.hdr, payload_hex_stored: false};
        fs.writeFileSync(OUT + '/mqtt/request-summary.json', JSON.stringify(summary, null, 1));
        let resp = null;
        client.on('message', (topic, payload) => {
            if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/schedule') {
                resp = payload.toString();
                fs.appendFileSync(OUT + '/mqtt/responses.jsonl', JSON.stringify({timestamp: now(), topic, data: resp}) + '\n');
            }
        });
        await client.subscribe(['zigbee2mqtt/bridge/response/device/ota_update/schedule', 'zigbee2mqtt/' + DEV]);
        await new Promise((r) => setTimeout(r, 1000));
        await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/schedule', JSON.stringify(req), {qos: 1}, res));
        logAction('schedule', 'mutation', 'SENT', 'schedule request published for ' + DEV + ' (hex ' + REQ.bytes + 'B, sha ' + art.sha.slice(0, 12) + '...)');
        const t0 = Date.now();
        while (Date.now() - t0 < 30_000) {
            await new Promise((r) => setTimeout(r, 1000));
            if (resp && JSON.parse(resp).status === 'ok') break;
        }
        if (!resp || JSON.parse(resp).status !== 'ok') fail('schedule', 'schedule response not ok: ' + resp);
        const t1 = Date.now();
        let schedState = null;
        while (Date.now() - t1 < 20_000) {
            const stx = await collectState(client, 4);
            schedState = stx.last.update && stx.last.update.state;
            if (schedState === 'scheduled') break;
        }
        logAction('schedule', 'mutation', schedState === 'scheduled' ? 'PASS' : 'FAIL', 'response ok; update.state=' + schedState);
        console.log('SCHEDULE-DONE response_ok=true update.state=' + schedState);
        client.end(true); process.exit(schedState === 'scheduled' ? 0 : 2);
    });
} else if (MODE === 'observe') {
    const secs = parseInt(ARG || '900', 10);
    connect(async (client) => {
        const ev = {startedAt: now(), windowSeconds: secs, clientQueryObserved: false, clientQueryAt: null, imageOffered: false, imageIdentityMatched: null, firstBlockObserved: false, firstBlockAt: null, blockRequestCount: 0, maxProgress: 0, progressSamples: [], stateTransitions: [], availabilityFlips: [], errors: [], terminalOtaState: null, terminalAt: null};
        let lastAvail = null, lastState = null;
        let blockRound = 0;
        client.on('message', (topic, payload) => {
            const s = payload.toString();
            try {
                if (topic === 'zigbee2mqtt/bridge/logging') {
                    const j = JSON.parse(s);
                    const msg = (j.message || '') + '';
                    if (/requested OTA|Updating|OTA update of|was OTA updated|image block|Query Next Image/i.test(msg)) {
                        if (/requested OTA/i.test(msg) && !ev.clientQueryObserved) { ev.clientQueryObserved = true; ev.clientQueryAt = now(); }
                        if (/Updating 'LivingRoomSocketWifiLeft'/i.test(msg) && !ev.imageOffered) { ev.imageOffered = true; ev.imageIdentityMatched = true; }
                        if (/was OTA updated from/i.test(msg)) { ev.terminalOtaState = 'updated'; ev.terminalAt = now(); }
                        if (/OTA update of 'LivingRoomSocketWifiLeft' failed/i.test(msg)) { ev.terminalOtaState = 'failed'; ev.terminalAt = now(); ev.errors.push({at: now(), line: msg.slice(0, 300)}); }
                        if (/image block/i.test(msg)) blockRound++;
                        ev.stateTransitions.push({at: now(), line: msg.slice(0, 300)});
                    }
                } else if (topic === 'zigbee2mqtt/' + DEV) {
                    const j = JSON.parse(s);
                    const u = j.update || {};
                    if (u.state && (!lastState || lastState.update.state !== u.state)) ev.stateTransitions.push({at: now(), from: lastState && lastState.update.state, to: u.state});
                    lastState = j;
                    if (u.progress !== undefined && u.progress > 0) {
                        const p = u.progress;
                        if (p > ev.maxProgress) ev.maxProgress = p;
                        if (!ev.firstBlockObserved) { ev.firstBlockObserved = true; ev.firstBlockAt = now(); }
                        ev.progressSamples.push({at: now(), progress: p, remaining: u.remaining});
                    }
                    fs.appendFileSync(OUT + '/mqtt/device-states.jsonl', JSON.stringify({timestamp: now(), state: {state_relay: j.state_relay, update: u, voltage: j.voltage, current: j.current, power: j.power, energy: j.energy}}) + '\n');
                } else if (topic === 'zigbee2mqtt/' + DEV + '/availability') {
                    const a = JSON.parse(s);
                    if (lastAvail && lastAvail.state !== a.state) ev.availabilityFlips.push({at: now(), from: lastAvail.state, to: a.state});
                    lastAvail = a;
                }
            } catch (e) {}
        });
        await client.subscribe(['zigbee2mqtt/bridge/logging', 'zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/availability']);
        const t0 = Date.now();
        const poll = setInterval(() => { console.log(new Date().toISOString().slice(11, 19), 'observing q=' + ev.clientQueryObserved + ' imgOffered=' + ev.imageOffered + ' progress=' + ev.maxProgress + '% terminal=' + ev.terminalOtaState); }, 60_000);
        while (Date.now() - t0 < secs * 1000) {
            await new Promise((r) => setTimeout(r, 5000));
            if (ev.terminalOtaState) { await new Promise((r) => setTimeout(r, 90_000)); break; }
        }
        clearInterval(poll);
        ev.blockRequestCount = blockRound;
        ev.finishedAt = now();
        fs.writeFileSync(OUT + '/observe.json', JSON.stringify(ev, null, 1));
        logAction('observe', 'read', 'DONE', 'query=' + ev.clientQueryObserved + ' imgOffered=' + ev.imageOffered + ' firstBlock=' + ev.firstBlockObserved + ' maxProgress=' + ev.maxProgress + ' terminal=' + ev.terminalOtaState);
        console.log('OBSERVE-DONE ' + JSON.stringify({clientQueryObserved: ev.clientQueryObserved, imageOffered: ev.imageOffered, firstBlockObserved: ev.firstBlockObserved, maxProgress: ev.maxProgress, terminalOtaState: ev.terminalOtaState}));
        client.end(true); process.exit(0);
    });
} else if (MODE === 'unschedule') {
    connect(async (client) => {
        let resp = null;
        client.on('message', (topic, payload) => {
            if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/unschedule') { resp = payload.toString(); fs.appendFileSync(OUT + '/mqtt/responses.jsonl', JSON.stringify({timestamp: now(), topic, data: resp}) + '\n'); }
        });
        await client.subscribe(['zigbee2mqtt/bridge/response/device/ota_update/unschedule', 'zigbee2mqtt/' + DEV]);
        await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/unschedule', JSON.stringify({id: DEV}), {qos: 1}, res));
        logAction('unschedule', 'mutation', 'SENT', 'unschedule request for ' + DEV);
        const t0 = Date.now();
        while (Date.now() - t0 < 20_000 && !(resp && JSON.parse(resp).status === 'ok')) await new Promise((r) => setTimeout(r, 1000));
        const stx = await collectState(client, 5);
        const sched = stx.last.update && stx.last.update.state;
        const ok = resp && JSON.parse(resp).status === 'ok' && sched !== 'scheduled';
        logAction('unschedule', 'mutation', ok ? 'PASS' : 'FAIL', 'response=' + (resp || 'none') + ' update.state=' + sched);
        console.log('UNSCHEDULE-DONE ok=' + ok + ' update.state=' + sched);
        client.end(true); process.exit(ok ? 0 : 2);
    });
} else if (MODE === 'postcheck') {
    connect(async (client) => {
        const st = await collectState(client, 10);
        const u = st.last.update || {};
        const bridgeTarget = (st.devices || []).find((d) => d.friendly_name === DEV);
        const checks = {
            fileVersion: u.installed_version === REQ.fv,
            software_build: String((st.last.device || {}).softwareBuildID || '').includes('bseedv8u1'),
            manufacturer: (st.last.device || {}).manufacturerName === TGT.mfr,
            model: (st.last.device || {}).model === 'TS011F_plug_1_2' || (bridgeTarget || {}).model_id === TGT.model,
            ieee: (st.last.device || {}).ieeeAddr === IEEE,
            device_config: st.last.device_config_switch === TGT.deviceConfig,
            relay_off: st.last.state_relay === 'OFF',
            online: st.avail && st.avail.state === 'online',
            energy_nondecreasing: st.last.energy >= 0.26 - 0.01,
            overload_alarm: st.last.overload_alarm_switch === 'none',
            no_load_power_near_zero: st.last.power === undefined || st.last.power <= 5,
        };
        const post = {timestamp: now(), checks, measured: {softwareBuildID: (st.last.device || {}).softwareBuildID, dateCode: (st.last.device || {}).dateCode, update: u, device_config: st.last.device_config_switch, relay: st.last.state_relay, metering: {voltage: st.last.voltage, current: st.last.current, power: st.last.power, apparent_power: st.last.apparent_power, energy: st.last.energy, overload_alarm_switch: st.last.overload_alarm_switch}, calibration: 'NOT_EXPOSED', availability: st.avail, update_state: u.state}};
        fs.writeFileSync(OUT + '/postcheck.json', JSON.stringify(post, null, 1));
        const ok = Object.values(checks).every(Boolean);
        logAction('postcheck', 'read', ok ? 'PASS' : 'FAIL', JSON.stringify(checks));
        console.log('POSTCHECK-DONE ok=' + ok + ' ' + JSON.stringify(checks));
        client.end(true); process.exit(ok ? 0 : 2);
    });
} else if (MODE === 'canary') {
    connect(async (client) => {
        const samples = {cycles: [], energyStart: null, energyEnd: null, overloadEvents: []};
        const push = (j, phase, cyc) => samples.cycles.push({at: now(), cycle: cyc, phase, relay: j.state_relay, voltage: j.voltage, current: j.current, power: j.power, apparent_power: j.apparent_power, energy: j.energy, overload_alarm_switch: j.overload_alarm_switch});
        let last = null;
        client.on('message', (topic, payload) => {
            if (topic !== 'zigbee2mqtt/' + DEV) return;
            try { last = JSON.parse(payload.toString()); if (last.overload_alarm_switch && last.overload_alarm_switch !== 'none') samples.overloadEvents.push({at: now(), alarm: last.overload_alarm_switch}); } catch (e) {}
        });
        await client.subscribe('zigbee2mqtt/' + DEV);
        const set = (v) => new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/set', JSON.stringify({state_relay: v}), {qos: 1}, res));
        const waitS = (s) => new Promise((r) => setTimeout(r, s * 1000));
        const refresh = () => new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/get', JSON.stringify({state_relay: '', voltage: '', current: '', power: '', energy: ''}), {qos: 1}, res));
        await waitS(2); await refresh(); await waitS(6);
        samples.energyStart = last && last.energy;
        for (let c = 1; c <= 3; c++) {
            await set('ON'); await waitS(10); await refresh(); await waitS(6); if (last) push(last, 'ON', c);
            await set('OFF'); await waitS(10); await refresh(); await waitS(6); if (last) push(last, 'OFF', c);
        }
        await refresh(); await waitS(6);
        samples.energyEnd = last && last.energy;
        samples.finalRelay = last && last.state_relay;
        fs.writeFileSync(OUT + '/functional-canary.json', JSON.stringify(samples, null, 1));
        logAction('functional_canary', 'mutation', 'DONE', 'cycles=3 finalRelay=' + samples.finalRelay + ' energy ' + samples.energyStart + '->' + samples.energyEnd + ' overloadEvents=' + samples.overloadEvents.length);
        console.log('CANARY-DONE ' + JSON.stringify(samples));
        client.end(true); process.exit(samples.finalRelay === 'OFF' ? 0 : 2);
    });
} else { console.error('usage: pm002.js preflight|schedule|observe <s>|unschedule|postcheck|canary'); process.exit(2); }