'use strict';
// Composition matcher scan against the ACTUAL installed ZHC.
// Runs inside the Z2M container with NODE_PATH including /app/node_modules.
// Zero Zigbee traffic: fleet entries are plain descriptor objects.
//
// Cases:
//   NOBSEED: live externals without any bseed_* file -> records broad fallback
//   LIVE:    current auto-load set (hardened transition included)
//   PROD:    transition removed, staged production wrapper added
//
// Output: /tmp/v6prod-20260904/capture/composition-scan.json
const fs = require('fs');
const path = require('path');
const Module = require('module');

const CAP = process.argv[2] || '/tmp/v6prod-20260904/capture';
const STAGE = '/tmp/v6prod-20260904/stage';
const LIVE_EXT = '/config/zigbee2mqtt/external_converters';
const TARGET_IEEE = '0xa4c13843a9d40f85';
const BSEED_LIVE_FILES = new Set(['bseed_ts0726_v4.js', 'bseed_ts0726_v5.js']);

function ensureAppModules() {
    const p = require.resolve('zigbee-herdsman-converters/lib/modernExtend', {paths: ['/app']});
    let cursor = path.dirname(p);
    let root;
    while (cursor !== path.dirname(cursor)) {
        if (path.basename(cursor) === 'node_modules') { root = cursor; break; }
        cursor = path.dirname(cursor);
    }
    if (!root) throw new Error('cannot find installed ZHC under /app');
    process.env.NODE_PATH = [root, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
    Module._initPaths();
    return {version: require(path.join(root, 'zigbee-herdsman-converters/package.json')).version, root};
}

const {version: ZHC_VERSION, root: NM} = ensureAppModules();
const zhc = require('zigbee-herdsman-converters');

function applySet(filePaths) {
    const names = filePaths.map((f) => path.basename(f));
    const union = new Set([...names, ...ALL_EXT_NAMES]);
    for (const n of union) zhc.removeExternalDefinitions(n);
    const counts = {};
    for (const f of filePaths) {
        const mod = require(f);
        const defs = Array.isArray(mod) ? mod : [mod];
        for (const d of defs) {
            d.externalConverterName = path.basename(f);
            zhc.addExternalDefinition(d);
        }
        counts[path.basename(f)] = defs.length;
    }
    return counts;
}

function spyOf(d, swOverride) {
    return {
        type: d.type,
        ieeeAddr: d.ieee,
        modelID: d.modelID,
        manufacturerName: d.manufacturerName,
        softwareBuildID: swOverride ?? d.swBuildId ?? undefined,
        interviewCompleted: true,
        powerSource: 'Mains (single phase)',
        endpoints: (d.endpoints || []).map((ep) => ({
            ID: ep.ID,
            inputClusters: ep.input_clusters,
            outputClusters: ep.output_clusters,
        })),
    };
}

function brief(def) {
    return def ? {
        model: def.model, vendor: def.vendor, description: def.description,
        externalConverterName: def.externalConverterName ?? null,
    } : null;
}

async function resolveAll(devices) {
    const out = {};
    for (const d of devices) {
        try { out[d.ieee] = brief(await zhc.findByDevice(spyOf(d))); }
        catch (e) { out[d.ieee] = {error: String(e && e.message)}; }
    }
    return out;
}

const descriptors = JSON.parse(fs.readFileSync(path.join(CAP, 'descriptors-merged.json'), 'utf8'));
const routed = descriptors.filter((d) => d.ieee);
const target = routed.find((d) => d.ieee === TARGET_IEEE);
if (!target) { console.error('TARGET_NOT_IN_CAPTURE'); process.exit(1); }

const liveJsFiles = fs.readdirSync(LIVE_EXT).filter((n) => n.endsWith('.js')).map((n) => path.join(LIVE_EXT, n));
const prodWrapper = path.join(STAGE, 'zigbee2mqtt', 'converters', 'bseed_ts0726_v6_production.js');
if (!fs.existsSync(prodWrapper)) { console.error('STAGED_PRODUCTION_MISSING'); process.exit(1); }
const liveSet = liveJsFiles;
const prodSet = liveJsFiles.filter((f) => path.basename(f) !== 'bseed_ts0726_v5.js').concat([prodWrapper]);
const noBseedSet = liveJsFiles.filter((f) => !BSEED_LIVE_FILES.has(path.basename(f)));
const ALL_EXT_NAMES = [...new Set([...liveSet, ...prodSet].map((f) => path.basename(f)))];

async function resolveWith(files, spySw) {
    applySet(files);
    try { return brief(await zhc.findByDevice(spyOf(target, spySw))); } catch (e) { return {error: String(e && e.message)}; }
}

async function main() {

const report = {
    captured_utc: new Date().toISOString(),
    installedZhc: {version: ZHC_VERSION, nodeModulesRoot: NM},
    targetDescriptor: {
        modelID: target.modelID, manufacturerName: target.manufacturerName,
        swBuildId: target.swBuildId, type: target.type,
        endpoints: (target.endpoints || []).map((ep) => ep.ID),
    },
    externalCounts: {},
    fleetResolution: {},
    targetCases: {},
};

for (const [name, files] of [['NOBSEED', noBseedSet], ['LIVE', liveSet], ['PROD', prodSet]]) {
    report.externalCounts[name] = applySet(files);
    report.fleetResolution[name] = await resolveAll(routed);
}
report.targetCases = {
    LIVE: {
        actual: await resolveWith(liveSet, undefined),
        spy_1_1_6_bseedv6: await resolveWith(liveSet, '1.1.6-bseedv6'),
        spy_1_1_5_bseedv5_recovery: await resolveWith(liveSet, '1.1.5-bseedv5'),
        spy_1_1_4_bseedv4: await resolveWith(liveSet, '1.1.4-bseedv4'),
    },
    PROD: {
        actual: await resolveWith(prodSet, undefined),
        spy_1_1_6_bseedv6: await resolveWith(prodSet, '1.1.6-bseedv6'),
        spy_1_1_5_bseedv5_recovery: await resolveWith(prodSet, '1.1.5-bseedv5'),
        spy_1_1_4_bseedv4: await resolveWith(prodSet, '1.1.4-bseedv4'),
    },
    NOBSEED: {actual: await resolveWith(noBseedSet, undefined)},
};

const live = report.fleetResolution.LIVE;
const prod = report.fleetResolution.PROD;
const fleetDeltas = [];
for (const d of routed) {
    if (JSON.stringify(live[d.ieee]) !== JSON.stringify(prod[d.ieee])) {
        fleetDeltas.push({ieee: d.ieee, friendly: d.friendly_name, live: live[d.ieee], prod: prod[d.ieee]});
    }
}

const isBseed = (r) => !!r && (BSEED_LIVE_FILES.has(r.externalConverterName) || r.externalConverterName === 'bseed_ts0726_v6_production.js');
const targetRes = report.targetCases.PROD.spy_1_1_6_bseedv6;

report.checks = {
    v6_target_matches_exactly_one_transition_definition: !!targetRes && targetRes.model === 'EC-GL86ZPCS31' &&
        targetRes.externalConverterName === 'bseed_ts0726_v6_production.js',
    no_broad_ts0726_fallback_collision: (() => {
        const nb = report.targetCases.NOBSEED.actual;
        return {
            what_matches_target_without_bseed: nb && (nb.model ?? null),
            prod_resolution_is_bseed_not_fallback: isBseed(targetRes),
        };
    })(),
    fleet_delta_live_to_prod_total: fleetDeltas.length,
    fleet_delta_live_to_prod_outside_target: fleetDeltas.filter((x) => x.ieee !== TARGET_IEEE).length,
    no_other_fleet_device_resolves_to_bseed_under_prod: Object.entries(prod)
        .filter(([ieee, r]) => ieee !== TARGET_IEEE && isBseed(r))
        .map(([ieee, r]) => ({ieee, model: r.model, converter: r.externalConverterName})),
    recovery_fingerprint_under_prod: report.targetCases.PROD.spy_1_1_5_bseedv5_recovery,
    v4_overlay_isolation_under_prod: {
        spy_1_1_4: report.targetCases.PROD.spy_1_1_4_bseedv4,
        note: '1.1.4-bseedv4 must resolve to v4 overlay (unchanged behavior); 1.1.6 to production wrapper',
    },
};

fs.writeFileSync(path.join(CAP, 'composition-scan.json'), JSON.stringify({...report, fleetDeltas}, null, 2));
console.log(JSON.stringify({status: 'DONE', zhc: ZHC_VERSION, devices: routed.length, checks: report.checks}, null, 2));
}

main().catch((e) => { console.error(e && e.stack || String(e)); process.exit(2); });
