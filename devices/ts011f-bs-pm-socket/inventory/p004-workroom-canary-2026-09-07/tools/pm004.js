'use strict';
// P004 finalization runner (issue #11 APPROVED / OTA-CANARY ruling 5560609637). One-shot predecessor-OTA attempt
// with human MCU power cycle + 20-min post-rejoin observation + deterministic branching. Sanitized evidence only.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const crypto = require('crypto');

const DEV = 'WorkroomSocketCabinet';
const IEEE = '0xa4c138c5f07ee732';
const OTA_PATH = '/tmp/pm-ota/forward.ota';
const LOGDIR = '/config/zigbee2mqtt/log/2026-09-05.06-17-16/';
const REQ = {
    sha256: 'c3ccb484c28d7ef08594acc306b2054aed3ba9fcfc9579643da339f7fcc9fe7c',
    bytes: 195394, mfr: 4417, img: 43556, fv: 302329858, swBuild: '1.2.5-bseedv8u1',
    file_name: 'bseed-ts011f-pm-v8-ded91a1.ota', sourceRun: '34015243265',
    artifact: 'bseed-pm-v8-reproducibility', sourceSHA: 'ded91a1fb1cdeb320d0858c8f4bcabab32bf5564',
};
const TGT = { ieee: IEEE, mfr: 'b28wrpvx', model: 'TS011F-BS-PM', role: 'Router', deviceConfig: 'b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;' };
const OUT = '/tmp/p004';
const SENTINEL = OUT + '/power-cycle-done';
const OBSERVE_SECS = 20 * 60;            // post-rejoin window per ruling
const SENTINEL_TIMEOUT_MS = 45 * 60 * 1000;
const REJOIN_TIMEOUT_MS = 10 * 60 * 1000;
const TRANSFER_CAP_MS = 30 * 60 * 1000;
fs.mkdirSync(OUT, {recursive: true});
fs.mkdirSync(OUT + '/mqtt', {recursive: true});
fs.mkdirSync(OUT + '/z2m', {recursive: true});
const MODE = process.argv[2];
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
    fs.writeFileSync(OUT + '/hashes.txt', ['file_name: ' + REQ.file_name, 'bytes: ' + data.length, 'sha256: ' + sha, 'source_repo: analienx/tuya-zigbee-switch PR#5', 'source_SHA: ' + REQ.sourceSHA + ' (reconfirmed 2026-09-06 pre-P004)', 'actions_run: ' + REQ.sourceRun + ' artifact: ' + REQ.artifact, 'header: ' + JSON.stringify(hdr)].join('\n') + '\n');
    logAction('artifact', 'gate', 'PASS', 'bytes=' + data.length + ' sha256=' + sha + ' mfr=' + mfr + ' img=' + img + ' fv=' + fv + ' total=' + total);
    return {data, sha, hdr};
}

function connect(cb) {
    const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
    const m = cfg.mqtt;
    const client = mqtt.connect(m.server, {clientId: 'pm004-' + MODE + '-' + Math.random().toString(16).slice(2, 6), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000, keepalive: 60});
    client.on('connect', () => cb(client, cfg));
    return client;
}

async function collectState(client, secs) {
    return new Promise((resolve) => {
        let last = null, avail = null, devices = null;
        const h = (topic, payload) => {
            try {
                const s = payload.toString();
                if (topic === 'zigbee2mqtt/' + DEV) last = JSON.parse(s);
                else if (topic === 'zigbee2mqtt/' + DEV + '/availability') avail = JSON.parse(s);
                else if (topic === 'zigbee2mqtt/bridge/devices') devices = JSON.parse(s);
            } catch (e) {}
        };
        client.on('message', h);
        (async () => {
            await client.subscribe(['zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/availability', 'zigbee2mqtt/bridge/devices']);
            await new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/get', JSON.stringify({state_relay: '', device_config_switch: '', update: ''}), {qos: 1}, res));
            await new Promise((r) => setTimeout(r, secs * 1000));
            client.removeListener('message', h);
            resolve({last, avail, devices});
        })();
    });
}

function logSourceSnapshot(tag) {
    const files = fs.readdirSync(LOGDIR).filter((f) => /^log.*\.log$/.test(f));
    const out = {tag, at: now(), files: []};
    for (const f of files) {
        const p = LOGDIR + f;
        const t = fs.readFileSync(p, 'utf8');
        const all = [...t.matchAll(/\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\]/g)];
        out.files.push({file: f, bytes: fs.statSync(p).size, first_ts: all.length ? all[0][1] : null, last_ts: all.length ? all[all.length - 1][1] : null});
    }
    return out;
}

const targetGate = (state) => {
    if (!state) fail('target', 'no device state received');
    const d = state.device || {};
    const errs = [];
    if (d.friendlyName !== DEV) errs.push('name');
    if (d.ieeeAddr !== IEEE) errs.push('ieee');
    if (d.manufacturerName !== TGT.mfr) errs.push('manufacturer:' + d.manufacturerName);
    if (d.model !== 'TS011F_plug_1_2' && d.model !== TGT.model) errs.push('model:' + d.model);
    if (d.type !== TGT.role) errs.push('type:' + d.type);
    if (state.device_config_switch !== TGT.deviceConfig) errs.push('device_config:' + state.device_config_switch);
    if (errs.length) fail('target', 'identity mismatch: ' + errs.join(','));
    logAction('target', 'gate', 'PASS', 'identity+device_config exact: ' + DEV + ' / ' + IEEE);
};

function unscheduleOnce(client) {
    return new Promise(async (resolve) => {
        let resp = null;
        const h = (topic, payload) => {
            if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/unschedule') {
                resp = payload.toString();
                fs.appendFileSync(OUT + '/mqtt/responses.jsonl', JSON.stringify({timestamp: now(), topic, data: resp}) + '\n');
            }
        };
        client.on('message', h);
        await client.subscribe('zigbee2mqtt/bridge/response/device/ota_update/unschedule');
        await new Promise((r) => setTimeout(r, 500));
        await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/unschedule', JSON.stringify({id: DEV}), {qos: 1}, res));
        logAction('unschedule', 'mutation', 'SENT', 'deterministic unschedule for ' + DEV);
        const t0 = Date.now();
        while (Date.now() - t0 < 20_000 && !(resp && JSON.parse(resp).status === 'ok')) await new Promise((r) => setTimeout(r, 1000));
        client.removeListener('message', h);
        const st = await collectState(client, 6);
        const sched = st.last && st.last.update && st.last.update.state;
        const ok = !!(resp && JSON.parse(resp).status === 'ok' && sched !== 'scheduled');
        logAction('unschedule', 'mutation', ok ? 'PASS' : 'FAIL', 'response=' + (resp || 'none') + ' update.state=' + sched);
        resolve({ok, resp, sched});
    });
}

if (MODE === 'preflight') {
    const art = verifyArtifact();
    connect(async (client, cfg) => {
        const st = await collectState(client, 9);
        targetGate(st.last);
        const target = (st.devices || []).find((d) => d.friendly_name === DEV);
        const preflight = {
            timestamp: now(), proposal: 'P004', authorization: 'issue#11 comment 5560609637 APPROVED / OTA-CANARY',
            artifact: {file_name: REQ.file_name, bytes: REQ.bytes, sha256: art.sha, header: art.hdr, source_SHA: REQ.sourceSHA},
            pr_head_reconfirmed: 'ded91a1fb1cdeb320d0858c8f4bcabab32bf5564',
            target: {friendly_name: DEV, ieee: IEEE, manufacturer: (st.last.device || {}).manufacturerName, model_id: target && target.model_id, software_build_id: target && target.software_build_id, update: st.last.update, device_config: st.last.device_config_switch, availability: st.avail, relay: st.last.state_relay, metering: {voltage: st.last.voltage, current: st.last.current, power: st.last.power, energy: st.last.energy, overload_alarm_switch: st.last.overload_alarm_switch}},
        };
        fs.writeFileSync(OUT + '/preflight.json', JSON.stringify(preflight, null, 1));
        const gates = {online: st.avail && st.avail.state === 'online', relay_off: st.last.state_relay === 'OFF', no_load: st.last.power === undefined || st.last.power <= 5, idle: !st.last.update || st.last.update.state === 'idle' || st.last.update.state === null};
        logAction('preflight', 'read', Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL', JSON.stringify(gates));
        console.log('PREFLIGHT-DONE ' + JSON.stringify(gates));
        client.end(true); process.exit(Object.values(gates).every(Boolean) ? 0 : 2);
    });
} else if (MODE === 'run') {
    const art = verifyArtifact();
    connect(async (client) => {
        const st0 = await collectState(client, 9);
        targetGate(st0.last);
        if (st0.last.state_relay !== 'OFF') fail('run', 'relay not OFF: ' + st0.last.state_relay);
        if (!(st0.avail && st0.avail.state === 'online')) fail('run', 'target not online');
        if (st0.last.power !== undefined && st0.last.power > 5) fail('run', 'load present: power=' + st0.last.power);
        const srcStart = logSourceSnapshot('before_schedule');
        fs.writeFileSync(OUT + '/z2m/log-source-start.json', JSON.stringify(srcStart, null, 1));
        logAction('log_source', 'read', 'PASS', 'files=' + srcStart.files.map((f) => f.file + ':' + f.first_ts + '..' + f.last_ts).join(' | '));
        let imageOffered = false, queryLike = null, firstBlock = false, maxProgress = 0, terminal = null, terminalAt = null;
        let lastState = null, lastAvail = null, rejoinAt = null, rejoinPayload = null;
        client.on('message', (topic, payload) => {
            try {
                const s = payload.toString();
                if (!/^zigbee2mqtt\/(bridge\/(logging|response)|WorkroomSocketCabinet)/.test(topic)) return;
                fs.appendFileSync(OUT + '/mqtt/capture.jsonl', JSON.stringify({timestamp: now(), topic, payload: s.length > 700 ? s.slice(0, 700) + '...[trunc]' : s}) + '\n');
                const msg = topic === 'zigbee2mqtt/bridge/logging' ? (JSON.parse(s).message || '') : '';
                if (topic === 'zigbee2mqtt/bridge/logging') {
                    if (/Updating 'WorkroomSocketCabinet'/i.test(msg) && !imageOffered) { imageOffered = true; queryLike = 'INFO_Updating_seen'; }
                    if (/requested OTA|Query Next Image|queryNextImage/i.test(msg) && !queryLike) queryLike = msg.slice(0, 120);
                    if (/was OTA updated from/i.test(msg)) { terminal = 'updated'; terminalAt = now(); }
                    if (/OTA update of 'WorkroomSocketCabinet' failed/i.test(msg)) { terminal = terminal || 'failed'; terminalAt = terminalAt || now(); }
                } else if (topic === 'zigbee2mqtt/' + DEV) {
                    const j = JSON.parse(s);
                    if (!rejoinAt && fs.existsSync(SENTINEL)) { rejoinAt = now(); rejoinPayload = {ieee: (j.device || {}).ieeeAddr, softwareBuildID: (j.device || {}).softwareBuildID, device_config: j.device_config_switch, relay: j.state_relay}; }
                    const u = j.update || {};
                    if (u.progress !== undefined && u.progress > 0) { if (u.progress > maxProgress) maxProgress = u.progress; firstBlock = true; }
                    if (u.state === 'updating') imageOffered = true;
                    lastState = j;
                } else if (topic === 'zigbee2mqtt/' + DEV + '/availability') {
                    const a = JSON.parse(s);
                    if (lastAvail && lastAvail.state !== a.state) fs.appendFileSync(OUT + '/mqtt/availability-flips.jsonl', JSON.stringify({timestamp: now(), from: lastAvail.state, to: a.state}) + '\n');
                    if (!rejoinAt && fs.existsSync(SENTINEL) && a.state === 'online') { rejoinAt = now(); rejoinPayload = {via: 'availability'}; }
                    lastAvail = a;
                }
            } catch (e) {}
        });
        await client.subscribe(['zigbee2mqtt/bridge/logging', 'zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/availability', 'zigbee2mqtt/bridge/response/device/ota_update/#']);
        await new Promise((r) => setTimeout(r, 1000));
        const req = {id: DEV, hex: {data: art.data.toString('hex').toUpperCase(), file_name: REQ.file_name}};
        let schedResp = null;
        const sh = (topic, payload) => { if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/schedule') { schedResp = payload.toString(); fs.appendFileSync(OUT + '/mqtt/responses.jsonl', JSON.stringify({timestamp: now(), topic, data: schedResp}) + '\n'); } };
        client.on('message', sh);
        await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/schedule', JSON.stringify(req), {qos: 1}, res));
        const scheduleSentAt = now();
        logAction('schedule', 'mutation', 'SENT', 'hex ' + REQ.bytes + 'B sha ' + art.sha.slice(0, 12) + '... at ' + scheduleSentAt);
        const t0 = Date.now();
        while (Date.now() - t0 < 30_000 && !(schedResp && JSON.parse(schedResp).status === 'ok')) await new Promise((r) => setTimeout(r, 1000));
        if (!schedResp || JSON.parse(schedResp).status !== 'ok') { const u = await unscheduleOnce(client); fail('schedule', 'schedule not ok: ' + schedResp + ' unschedule=' + JSON.stringify(u)); }
        const stS = await collectState(client, 6);
        const schedState = stS.last.update && stS.last.update.state;
        logAction('schedule', 'mutation', schedState === 'scheduled' ? 'PASS' : 'FAIL', 'status ok; update.state=' + schedState);
        if (schedState !== 'scheduled') { const u = await unscheduleOnce(client); fail('schedule', 'state not scheduled, unscheduled=' + JSON.stringify(u)); }
        console.log('SCHEDULED ' + scheduleSentAt + ' state=' + schedState);
        let powerCycled = false, sentinelAt = null;
        const tw = Date.now();
        while (Date.now() - tw < SENTINEL_TIMEOUT_MS) {
            if (fs.existsSync(SENTINEL)) { powerCycled = true; sentinelAt = now(); break; }
            await new Promise((r) => setTimeout(r, 3000));
        }
        fs.writeFileSync(OUT + '/power-cycle.json', JSON.stringify({requested_at: scheduleSentAt, performed: powerCycled, sentinel_at: sentinelAt}, null, 1));
        if (!powerCycled) {
            logAction('power_cycle', 'mutation', 'UNAVAILABLE', 'sentinel not seen within 45min');
            const u = await unscheduleOnce(client);
            fs.writeFileSync(OUT + '/result.json', JSON.stringify({result: 'P004_POWER_CYCLE_UNAVAILABLE', unschedule: u, finishedAt: now()}, null, 1));
            console.log('RESULT P004_POWER_CYCLE_UNAVAILABLE'); client.end(true); process.exit(13);
        }
        const tr = Date.now();
        let pollTries = 0;
        while (Date.now() - tr < REJOIN_TIMEOUT_MS && !rejoinAt) {
            pollTries++;
            const stp = await collectState(client, 6);
            if ((stp.last.device || {}).ieeeAddr === IEEE && stp.avail && stp.avail.state === 'online') {
                rejoinAt = now();
                rejoinPayload = {via: 'poll-get', pollTries, ieee: (stp.last.device || {}).ieeeAddr, softwareBuildID: (stp.last.device || {}).softwareBuildID, device_config: stp.last.device_config_switch, relay: stp.last.state_relay};
            } else {
                await new Promise((r) => setTimeout(r, 9000));
            }
        }
        if (!rejoinAt) {
            logAction('rejoin', 'read', 'FAIL', 'no device traffic within 10min after power cycle');
            const u = await unscheduleOnce(client);
            fs.writeFileSync(OUT + '/result.json', JSON.stringify({result: 'REJOIN_NOT_OBSERVED', unschedule: u, finishedAt: now()}, null, 1));
            console.log('RESULT REJOIN_NOT_OBSERVED'); client.end(true); process.exit(14);
        }
        logAction('rejoin', 'read', 'PASS', 'rejoinAt=' + rejoinAt + ' payload=' + JSON.stringify(rejoinPayload));
        const rejoinState = await collectState(client, 9);
        const rejoinCheck = {
            ieee: (rejoinState.last.device || {}).ieeeAddr === IEEE,
            device_config: rejoinState.last.device_config_switch === TGT.deviceConfig,
            relay_off: rejoinState.last.state_relay === 'OFF',
            online: rejoinState.avail && rejoinState.avail.state === 'online',
        };
        fs.writeFileSync(OUT + '/rejoin.json', JSON.stringify({rejoinAt, rejoinPayload, checks: rejoinCheck, measured: {update: rejoinState.last.update, energy: rejoinState.last.energy, power: rejoinState.last.power}}, null, 1));
        logAction('rejoin', 'read', Object.values(rejoinCheck).every(Boolean) ? 'PASS' : 'FAIL', JSON.stringify(rejoinCheck));
        const obsStart = now();
        console.log('OBSERVE-START ' + obsStart + ' for ' + OBSERVE_SECS + 's');
        const tobs = Date.now();
        while (Date.now() - tobs < OBSERVE_SECS * 1000) {
            await new Promise((r) => setTimeout(r, 5000));
            if (imageOffered && firstBlock) {
                console.log('TRANSFER-STARTED progress=' + maxProgress);
                const tt = Date.now();
                while (Date.now() - tt < TRANSFER_CAP_MS && !terminal) await new Promise((r) => setTimeout(r, 5000));
                break;
            }
            if (terminal && !imageOffered) { await new Promise((r) => setTimeout(r, 30_000)); break; }
        }
        const observeWindowEnd = now();
        let result, exitCode;
        if (terminal === 'updated') {
            result = {result: 'TRANSFER_COMPLETED', observe: {obsStart, observeWindowEnd, imageOffered, firstBlock, maxProgress, terminal, terminalAt}};
            exitCode = 10;
        } else if (imageOffered || queryLike) {
            const u = await unscheduleOnce(client);
            result = {result: 'IMAGE_REJECTED_OR_BLOCKS_NOT_STARTED', observe: {obsStart, observeWindowEnd, imageOffered, queryLike, firstBlock, maxProgress, terminal}, unschedule: u};
            exitCode = 11;
        } else {
            const u = await unscheduleOnce(client);
            result = {result: 'PREDECESSOR_0x12053000_OTA_CLIENT_NONFUNCTIONAL_AFTER_RESTART', observe: {obsStart, observeWindowEnd, imageOffered, queryLike, firstBlock, maxProgress, terminal}, unschedule: u};
            exitCode = 12;
        }
        result.finishedAt = now();
        fs.writeFileSync(OUT + '/result.json', JSON.stringify(result, null, 1));
        fs.writeFileSync(OUT + '/z2m/log-source-end.json', JSON.stringify(logSourceSnapshot('after_run'), null, 1));
        logAction('observe', 'read', 'DONE', JSON.stringify({imageOffered, firstBlock, maxProgress, terminal}));
        console.log('RESULT ' + result.result); client.end(true); process.exit(exitCode);
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
            energy_nondecreasing: st.last.energy >= 0.04 - 0.01,
            overload_alarm: st.last.overload_alarm_switch === 'none',
            no_load_power_near_zero: st.last.power === undefined || st.last.power <= 5,
        };
        const post = {timestamp: now(), checks, measured: {softwareBuildID: (st.last.device || {}).softwareBuildID, dateCode: (st.last.device || {}).dateCode, update: u, device_config: st.last.device_config_switch, relay: st.last.state_relay, metering: {voltage: st.last.voltage, current: st.last.current, power: st.last.power, energy: st.last.energy, overload_alarm_switch: st.last.overload_alarm_switch}, calibration: 'NOT_EXPOSED', availability: st.avail}};
        fs.writeFileSync(OUT + '/postcheck.json', JSON.stringify(post, null, 1));
        const ok = Object.values(checks).every(Boolean);
        logAction('postcheck', 'read', ok ? 'PASS' : 'FAIL', JSON.stringify(checks));
        console.log('POSTCHECK-DONE ok=' + ok + ' ' + JSON.stringify(checks));
        client.end(true); process.exit(ok ? 0 : 2);
    });
} else if (MODE === 'canary') {
    connect(async (client) => {
        const samples = {cycles: [], energyStart: null, energyEnd: null, overloadEvents: []};
        const push = (j, phase, cyc) => samples.cycles.push({at: now(), cycle: cyc, phase, relay: j.state_relay, voltage: j.voltage, current: j.current, power: j.power, energy: j.energy, overload_alarm_switch: j.overload_alarm_switch});
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
        console.log('CANARY-DONE ' + JSON.stringify({finalRelay: samples.finalRelay, energyStart: samples.energyStart, energyEnd: samples.energyEnd, overloadEvents: samples.overloadEvents.length}));
        client.end(true); process.exit(samples.finalRelay === 'OFF' ? 0 : 2);
    });
} else if (MODE === 'run2') {
    // Phase 5: schedule forced-V8 self-reinstall wrapper, power-cycle sentinel, observe until terminal.
    const data = fs.readFileSync('/tmp/p004-ota/selfreinstall.ota');
    const sha = crypto.createHash('sha256').update(data).digest('hex');
    if (data.length !== 195394 || sha !== '0a652e4568210610e3b427105631f0cedcd0213c9cf4737bf4920ea25b8291e1') fail('artifact2', 'self-reinstall wrapper mismatch: ' + data.length + ' ' + sha);
    logAction('artifact2', 'gate', 'PASS', 'selfreinstall wrapper bytes=195394 sha=0a652e45...');
    connect(async (client) => {
        const st0 = await collectState(client, 9);
        targetGate(st0.last);
        if (st0.last.state_relay !== 'OFF') fail('run2', 'relay not OFF');
        if (!(st0.avail && st0.avail.state === 'online')) fail('run2', 'target not online');
        fs.writeFileSync(OUT + '/z2m/log-source-start2.json', JSON.stringify(logSourceSnapshot('before_schedule2'), null, 1));
        let imageOffered = false, firstBlock = false, maxProgress = 0, terminal = null;
        let rejoinAt = null, rejoinPayload = null;
        client.on('message', (topic, payload) => {
            try {
                const s = payload.toString();
                if (!/^zigbee2mqtt\/(bridge\/(logging|response)|WorkroomSocketCabinet)/.test(topic)) return;
                fs.appendFileSync(OUT + '/mqtt/capture2.jsonl', JSON.stringify({timestamp: now(), topic, payload: s.length > 700 ? s.slice(0, 700) + '...[trunc]' : s}) + '\n');
                const msg = topic === 'zigbee2mqtt/bridge/logging' ? (JSON.parse(s).message || '') : '';
                if (topic === 'zigbee2mqtt/bridge/logging') {
                    if (/Updating 'WorkroomSocketCabinet'/i.test(msg)) imageOffered = true;
                    if (/was OTA updated from/i.test(msg)) terminal = 'updated';
                    if (/OTA update of 'WorkroomSocketCabinet' failed/i.test(msg)) terminal = terminal || 'failed';
                } else if (topic === 'zigbee2mqtt/' + DEV) {
                    const j = JSON.parse(s);
                    if (!rejoinAt && fs.existsSync(SENTINEL)) { rejoinAt = now(); rejoinPayload = {ieee: (j.device || {}).ieeeAddr, softwareBuildID: (j.device || {}).softwareBuildID, device_config: j.device_config_switch}; }
                    const u = j.update || {};
                    if (u.progress !== undefined && u.progress > 0) { if (u.progress > maxProgress) maxProgress = u.progress; firstBlock = true; }
                } else if (topic === 'zigbee2mqtt/' + DEV + '/availability') {
                    const a = JSON.parse(s);
                    if (!rejoinAt && fs.existsSync(SENTINEL) && a.state === 'online') { rejoinAt = now(); rejoinPayload = {via: 'availability'}; }
                }
            } catch (e) {}
        });
        await client.subscribe(['zigbee2mqtt/bridge/logging', 'zigbee2mqtt/' + DEV, 'zigbee2mqtt/' + DEV + '/availability', 'zigbee2mqtt/bridge/response/device/ota_update/#']);
        await new Promise((r) => setTimeout(r, 1000));
        let schedResp = null;
        const sh = (topic, payload) => { if (topic === 'zigbee2mqtt/bridge/response/device/ota_update/schedule') { schedResp = payload.toString(); fs.appendFileSync(OUT + '/mqtt/responses2.jsonl', JSON.stringify({timestamp: now(), topic, data: schedResp}) + '\n'); } };
        client.on('message', sh);
        const req = {id: DEV, hex: {data: data.toString('hex').toUpperCase(), file_name: 'bseed-ts011f-pm-v8-ded91a1-selfreinstall-forced.bin'}};
        await new Promise((res) => client.publish('zigbee2mqtt/bridge/request/device/ota_update/schedule', JSON.stringify(req), {qos: 1}, res));
        const scheduleSentAt = now();
        logAction('schedule2', 'mutation', 'SENT', 'forced self-reinstall at ' + scheduleSentAt);
        const t0 = Date.now();
        while (Date.now() - t0 < 30_000 && !(schedResp && JSON.parse(schedResp).status === 'ok')) await new Promise((r) => setTimeout(r, 1000));
        if (!schedResp || JSON.parse(schedResp).status !== 'ok') { const u = await unscheduleOnce(client); fail('schedule2', 'not ok: ' + schedResp + ' unsched=' + JSON.stringify(u)); }
        const stS = await collectState(client, 6);
        logAction('schedule2', 'mutation', stS.last.update && stS.last.update.state === 'scheduled' ? 'PASS' : 'FAIL', 'state=' + (stS.last.update || {}).state);
        console.log('SCHEDULED2 ' + scheduleSentAt);
        let powerCycled = false;
        const tw = Date.now();
        while (Date.now() - tw < 35 * 60 * 1000) {
            if (fs.existsSync(SENTINEL)) { powerCycled = true; break; }
            await new Promise((r) => setTimeout(r, 3000));
            if (imageOffered && firstBlock) break;
        }
        fs.writeFileSync(OUT + '/power-cycle2.json', JSON.stringify({performed: powerCycled, at: now()}, null, 1));
        if (powerCycled) {
            const tr = Date.now();
            while (Date.now() - tr < REJOIN_TIMEOUT_MS && !rejoinAt) await new Promise((r) => setTimeout(r, 2000));
        }
        const obsStart = now();
        const tobs = Date.now();
        while (Date.now() - tobs < TRANSFER_CAP_MS && !terminal) await new Promise((r) => setTimeout(r, 5000));
        const observeWindowEnd = now();
        let result, exitCode;
        if (terminal === 'updated') {
            result = {result: 'SELF_REINSTALL_COMPLETED', observe: {obsStart, observeWindowEnd, powerCycled, imageOffered, firstBlock, maxProgress, terminal}};
            exitCode = 20;
        } else {
            const u = await unscheduleOnce(client);
            result = {result: 'V8_SELF_REINSTALL_FAILED', observe: {obsStart, observeWindowEnd, powerCycled, rejoinAt, imageOffered, firstBlock, maxProgress, terminal}, unschedule: u};
            exitCode = 21;
        }
        result.finishedAt = now();
        fs.writeFileSync(OUT + '/result2.json', JSON.stringify(result, null, 1));
        logAction('run2', 'read', 'DONE', JSON.stringify({imageOffered, firstBlock, maxProgress, terminal}));
        console.log('RESULT2 ' + result.result); client.end(true); process.exit(exitCode);
    });
} else if (MODE === 'smoke') {

    connect(async (client) => {
        let last = null;
        client.on('message', (topic, payload) => { if (topic === 'zigbee2mqtt/' + DEV) { try { last = JSON.parse(payload.toString()); } catch (e) {} } });
        await client.subscribe('zigbee2mqtt/' + DEV);
        const set = (v) => new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/set', JSON.stringify({state_relay: v}), {qos: 1}, res));
        const refresh = () => new Promise((res) => client.publish('zigbee2mqtt/' + DEV + '/get', JSON.stringify({state_relay: '', voltage: '', current: '', power: '', energy: ''}), {qos: 1}, res));
        const waitS = (s) => new Promise((r) => setTimeout(r, s * 1000));
        await waitS(2); await refresh(); await waitS(5);
        const start = {relay: last && last.state_relay, energy: last && last.energy};
        await set('ON'); await waitS(8); await refresh(); await waitS(4);
        const onSample = {relay: last && last.state_relay, voltage: last && last.voltage, current: last && last.current, power: last && last.power, energy: last && last.energy};
        await set('OFF'); await waitS(8); await refresh(); await waitS(4);
        const offSample = {relay: last && last.state_relay, power: last && last.power, energy: last && last.energy};
        const ok = onSample.relay === 'ON' && offSample.relay === 'OFF';
        fs.writeFileSync(OUT + '/smoke.json', JSON.stringify({at: now(), start, onSample, offSample, ok}, null, 1));
        logAction('smoke', 'mutation', ok ? 'PASS' : 'FAIL', JSON.stringify({onSample, offSample}));
        console.log('SMOKE-DONE ok=' + ok); client.end(true); process.exit(ok ? 0 : 2);
    });
} else { console.error('usage: pm004.js preflight|run|postcheck|canary|run2|smoke'); process.exit(2); }
