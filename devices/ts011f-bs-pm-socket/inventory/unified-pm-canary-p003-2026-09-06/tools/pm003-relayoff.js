'use strict';
// pm003 helper: ensure relay OFF (safety precondition, ruling 5560609637 step 2). Target-only.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const DEV = 'LivingRoomSocketWifiLeft';
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'pm003-relayoff', username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10000});
client.on('connect', async () => {
    let last = null;
    client.on('message', (t, p) => { if (t === 'zigbee2mqtt/' + DEV) { try { last = JSON.parse(p.toString()); } catch (e) {} } });
    await client.subscribe('zigbee2mqtt/' + DEV);
    const pub = (t, j) => new Promise((res) => client.publish(t, JSON.stringify(j), {qos: 1}, res));
    await pub('zigbee2mqtt/' + DEV + '/get', {state_relay: ''});
    await new Promise((r) => setTimeout(r, 4000));
    console.log('BEFORE relay=' + (last && last.state_relay));
    if (last && last.state_relay !== 'OFF') {
        await pub('zigbee2mqtt/' + DEV + '/set', {state_relay: 'OFF'});
        await new Promise((r) => setTimeout(r, 5000));
        await pub('zigbee2mqtt/' + DEV + '/get', {state_relay: ''});
        await new Promise((r) => setTimeout(r, 4000));
    }
    console.log('AFTER relay=' + (last && last.state_relay));
    fs.appendFileSync('/tmp/pm003/actions.jsonl', JSON.stringify({timestamp: new Date().toISOString(), step: 'relay_off_precondition', action_class: 'mutation', result: (last && last.state_relay) === 'OFF' ? 'PASS' : 'FAIL', detail: 'relay=' + (last && last.state_relay)}) + '\n');
    client.end(true);
    process.exit((last && last.state_relay) === 'OFF' ? 0 : 2);
});
