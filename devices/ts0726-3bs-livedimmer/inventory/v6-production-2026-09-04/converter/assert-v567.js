'use strict';
// Explicit canary assertions for production head 71077dc7.
// Loads the FULL chain (base -> v567 overlay -> production wrapper) with the
// installed/npm ZHC and asserts the ruling's required properties.
const path = require('path');
const Module = require('module');
// resolve ZHC from /app or the host npm copy (NODE_PATH already set by caller)
const wrapperPath = process.argv[2];
const defs = require(wrapperPath);
if (!Array.isArray(defs) || defs.length !== 1) throw new Error('expected exactly one definition, got ' + defs.length);
const d = defs[0];

const fps = d.fingerprint.map((f) => f.softwareBuildID);
const has = (x) => fps.includes(x);
const dup = new Set(fps).size === fps.length;

// locate the action-mode extends and inspect their transport decision per build.
const actionNames = ['switch_left_action_mode', 'switch_middle_action_mode', 'switch_right_action_mode'];
const bindedNames = ['switch_left_binded_mode', 'switch_middle_binded_mode', 'switch_right_binded_mode'];
const findByProp = (prop) => (d.extend || []).find((ex) => (ex.exposes || []).some((e) => (e.property || e.name) === prop));
const actionExtends = actionNames.map(findByProp);
const bindedExtends = bindedNames.map(findByProp);

// capture the transport a build resolves to by running the fake identity gate:
// we can't call the closure directly, so exercise convertGet with a fake endpoint
// that records the read() attribute per reported swBuildId.
async function transportForBuild(build, prop) {
    const ex = findByProp(prop);
    const conv = ex.toZigbee.find((c) => (c.key || []).includes(prop));
    const reads = [];
    const writes = [];
    const epFor = (id) => ({
        ID: id,
        read: async (cluster, attrs) => {
            reads.push({cluster, attrs});
            if (cluster === 'genBasic') return {swBuildId: build};
            return {};
        },
        write: async (cluster, payload) => { writes.push({cluster, payload}); },
    });
    const endpoints = {1: epFor(1), 2: epFor(2), 3: epFor(3)};
    const meta = {device: {getEndpoint: (id) => endpoints[id]}, state: {}};
    let readErr = null;
    try { await conv.convertGet(null, prop, meta); } catch (e) { readErr = e.message; }
    const swRead = reads.find((r) => r.cluster === 'genBasic');
    const attrRead = reads.find((r) => r.cluster === 'genOnOffSwitchCfg');
    return {build, prop, identityReadFirst: !!swRead, switchCfgAttrs: attrRead ? attrRead.attrs : null, readErr};
}

(async () => {
    const report = {fingerprints: fps, checks: {}};
    report.checks.exactly_one_definition = true;
    report.checks.v5_present = has('1.1.5-bseedv5');
    report.checks.v6_present = has('1.1.6-bseedv6');
    report.checks.v7_present = has('1.1.7-bseedv7');
    report.checks.no_dup_fps = dup;
    report.checks.v7_transport = await transportForBuild('1.1.7-bseedv7', 'switch_right_action_mode');
    report.checks.v6_transport = await transportForBuild('1.1.6-bseedv6', 'switch_right_action_mode');
    report.checks.v5_transport = await transportForBuild('1.1.5-bseedv5', 'switch_right_action_mode');
    report.checks.unknown_transport = await transportForBuild('9.9.9-nope', 'switch_right_action_mode');
    const v7ok = report.checks.v7_transport.switchCfgAttrs
        && report.checks.v7_transport.switchCfgAttrs[0] === 0xff06;
    const v6ok = report.checks.v6_transport.switchCfgAttrs
        && report.checks.v6_transport.switchCfgAttrs[0] === 0xff06;
    const v5ok = report.checks.v5_transport.switchCfgAttrs
        && report.checks.v5_transport.switchCfgAttrs[0] === 'switchActions';
    const unknownOk = !!report.checks.unknown_transport.readErr;
    report.checks.binded_extends_present = bindedExtends.every(Boolean);
    report.checks.identity_read_first_v7 = report.checks.v7_transport.identityReadFirst;
    report.verdict = {
        fingerprints_v5v6v7_only: report.checks.v5_present && report.checks.v6_present && report.checks.v7_present && fps.length === 3,
        v7_0xff06_max4: v7ok, v6_unchanged_0xff06: v6ok, v5_still_switchActions: v5ok,
        unknown_failsclosed: unknownOk, binded_mode_override_present: report.checks.binded_extends_present,
        identity_read_first: report.checks.identity_read_first_v7,
    };
    report.verdict.ALL_PASS = Object.values(report.verdict).every((x) => x === true);
    console.log(JSON.stringify(report, null, 1));
    require('fs').writeFileSync('/tmp/v567-assertions.json', JSON.stringify(report, null, 1));
    process.exit(report.verdict.ALL_PASS ? 0 : 1);
})();
