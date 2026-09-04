'use strict';
// BOUNDED DIAGNOSTIC TRACE per Supervisor ruling 5542185070 (steps 4-7).
// Exactly ONE public SET (switch_right_binded_mode=Never (disabled)).
// Debug window opened and closed around it; prior log level recorded + restored + proven.
// No binds, no raw writes, no mains changes, no re-interview, no OTA.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomMainDimmer';
const CFG = '/config/zigbee2mqtt/configuration.yaml';
const LOGROOT = '/config/zigbee2mqtt/log';
const OUTDIR = '/tmp/v9/capture';
fs.mkdirSync(OUTDIR, {recursive: true});

const cfg = yaml.load(fs.readFileSync(CFG, 'utf8'));
const priorLevel = (cfg.advanced && cfg.advanced.log_level) || 'info';
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'bseed-trace-' + Math.random().toString(16).slice(2, 8), username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10_000});

function currentLogFile() {
    const win = fs.readdirSync(LOGROOT).filter((d) => fs.statSync(path.join(LOGROOT, d)).isDirectory()).sort().reverse()[0];
    const f = path.join(LOGROOT, win, 'log.log');
    return fs.existsSync(f) ? f : null;
}

const ev = {started_utc: new Date().toISOString(), prior_log_level: priorLevel, steps: [], state_publishes: [], options_responses: []};
const t = () => new Date().toISOString().slice(11, 23);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const pub = (topic, payload) => new Promise((res) => client.publish(topic, JSON.stringify(payload), {qos: 1}, res));

let transaction = 1000;
function optionsRequest(options) {
    return new Promise((resolve) => {
        const id = ++transaction;
        const onData = (topic, payload) => {
            if (topic !== 'zigbee2mqtt/bridge/response/options') return;
            let j; try { j = JSON.parse(payload.toString()); } catch (e) { return; }
            if (typeof j.status === 'undefined') return;
            client.removeListener('message', onData);
            ev.options_responses.push({at: t(), requested: options, status: j.status, restart_required: (j.data || {}).restart_required ?? null});
            resolve(j);
        };
        client.on('message', onData);
        client.publish('zigbee2mqtt/bridge/request/options', JSON.stringify({options, transaction: 'trc' + id}), {qos: 1});
    });
}

client.on('message', (topic, payload) => {
    if (topic !== `zigbee2mqtt/${DEV}`) return;
    try {
        const j = JSON.parse(payload.toString());
        if ('switch_right_binded_mode' in j || 'switch_right_binded_mode_switch_right' in j) {
            ev.state_publishes.push({at: t(), base: j.switch_right_binded_mode ?? null, ep: j.switch_right_binded_mode_switch_right ?? null});
        }
    } catch (e) {}
});

(async () => {
    await new Promise((res) => client.on('connect', res));
    await new Promise((res) => client.subscribe([`zigbee2mqtt/${DEV}`, 'zigbee2mqtt/bridge/response/options'], res));
    await wait(1500);

    // STEP A: open debug window
    await optionsRequest({advanced: {log_level: 'debug'}});
    const logFile = currentLogFile();
    ev.log_file = logFile;
    ev.debug_response = ev.options_responses[ev.options_responses.length - 1] ?? null;
    await wait(1500);

    // STEP B: mark offset, perform the ONE SET
    const offset = fs.statSync(logFile).size;
    ev.set_issued_at = t();
    await pub(`zigbee2mqtt/${DEV}/set`, {switch_right_binded_mode: 'Never (disabled)'});
    await wait(15_000); // write + converter readback + publishes
    const after = fs.statSync(logFile).size;
    const fd = fs.openSync(logFile, 'r');
    const buf = Buffer.alloc(Math.max(0, after - offset));
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    ev.debug_log_bytes = buf.length;
    fs.writeFileSync(OUTDIR + '/debug-segment.log', buf.toString('utf8'));

    // STEP C: restore prior log level + prove
    await optionsRequest({advanced: {log_level: priorLevel}});
    await wait(1000);
    const cfgAfter = yaml.load(fs.readFileSync(CFG, 'utf8'));
    ev.restored_log_level = (cfgAfter.advanced && cfgAfter.advanced.log_level) ?? null;
    ev.restore_proven = ev.restored_log_level === priorLevel;

    // STEP D: post-SET authoritative state (the converter's own readback should have corrected cache)
    await pub(`zigbee2mqtt/${DEV}/get`, {switch_right_binded_mode: ''});
    await wait(8000);

    ev.sets_performed = 1;
    ev.finished_utc = new Date().toISOString();
    fs.writeFileSync(OUTDIR + '/trace-result.json', JSON.stringify(ev, null, 1));
    console.log(JSON.stringify({
        debug_response: ev.debug_response,
        set_issued_at: ev.set_issued_at,
        debug_log_bytes: ev.debug_log_bytes,
        restored: ev.restored_log_level, restore_proven: ev.restore_proven,
        state_publishes_during: ev.state_publishes,
    }, null, 1));
    client.end(true);
    process.exit(0);
})().catch((e) => {
    ev.fatal = String(e && e.stack || e);
    try { fs.writeFileSync(OUTDIR + '/trace-result.json', JSON.stringify(ev, null, 1)); } catch (x) {}
    console.error('FATAL', ev.fatal);
    process.exit(1);
});
setTimeout(() => {
    ev.hard_timeout = true;
    // SAFETY: attempt restore before dying
    optionsRequest({advanced: {log_level: priorLevel}}).then(() => {
        fs.writeFileSync(OUTDIR + '/trace-result.json', JSON.stringify(ev, null, 1));
        process.exit(1);
    });
}, 120_000);
