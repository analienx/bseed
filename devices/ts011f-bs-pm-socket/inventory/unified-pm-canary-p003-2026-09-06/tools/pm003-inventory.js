'use strict';
// P003 fallback A (read-only): inventory all TS011F/b28wrpvx family devices from live bridge state.
const fs = require('fs');
const yaml = require('js-yaml');
const mqtt = require('mqtt');
const cfg = yaml.load(fs.readFileSync('/config/zigbee2mqtt/configuration.yaml', 'utf8'));
const m = cfg.mqtt;
const client = mqtt.connect(m.server, {clientId: 'pm003-inv', username: m.user, password: m.password, reconnectPeriod: 0, connectTimeout: 10000});
client.on('connect', async () => {
    let devices = null, states = {};
    client.on('message', (t, p) => {
        try {
            if (t === 'zigbee2mqtt/bridge/devices') devices = JSON.parse(p.toString());
            else if (t.startsWith('zigbee2mqtt/') && !/bridge|availability/.test(t)) states[t.slice('zigbee2mqtt/'.length)] = JSON.parse(p.toString());
        } catch (e) {}
    });
    await client.subscribe(['zigbee2mqtt/bridge/devices', 'zigbee2mqtt/#']);
    await new Promise((r) => setTimeout(r, 9000));
    const out = {at: new Date().toISOString(), family: []};
    for (const d of (devices || [])) {
        const mn = d.manufacturer || '', md = d.model_id || '';
        if (!/b28wrpvx/i.test(mn) && !/TS011F/i.test(md)) continue;
        const st = states[d.friendly_name] || {};
        out.family.push({
            friendly_name: d.friendly_name, ieee: d.ieee_address || d.ieeeAddr, manufacturer: mn, model_id: md,
            definition_model: (d.definition || {}).model || null, supported: (d.definition || {}).supported !== false,
            type: d.type, software_build_id: d.software_build_id || null, date_code: d.date_code || null,
            interviews_done: d.interview_completed !== false,
            relay_state: st.state_relay !== undefined ? st.state_relay : null,
            power: st.power !== undefined ? st.power : null, energy: st.energy !== undefined ? st.energy : null,
            update_state: (st.update || {}).state || null,
            custom_vs_stock: /bseed|custom/i.test(String((d.definition || {}).model)) ? 'custom-converter' : 'stock-or-unknown',
        });
    }
    fs.writeFileSync('/tmp/pm003/fallback/inventory.json', JSON.stringify(out, null, 1));
    console.log('INVENTORY ' + out.family.length + ' family devices');
    for (const f of out.family) console.log(JSON.stringify(f));
    client.end(true); process.exit(0);
});
