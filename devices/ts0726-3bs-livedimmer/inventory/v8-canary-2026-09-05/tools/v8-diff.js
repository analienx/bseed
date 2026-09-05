'use strict';
// Full pre/post machine diff for the target: endpoints/bindings/reportings/scenes/clusters.
const fs = require('fs');
const IEEE = '0xa4c13843a9d40f85';
function load(tag) {
    const dev = JSON.parse(fs.readFileSync(`/tmp/v8canary/${tag}/bridge-devices.json`, 'utf8'));
    const t = dev.find((x) => x.ieee_address === IEEE);
    const eps = {};
    for (const [k, v] of Object.entries(t.endpoints || {})) {
        eps[k] = {bindings: v.bindings, configured_reportings: v.configured_reportings, scenes: v.scenes, clusters: v.clusters};
    }
    return {sw: t.software_build_id, model: t.definition && t.definition.model, eps};
}
const pre = load('pre'), post = load('post');
const diff = {};
for (const k of new Set([...Object.keys(pre.eps), ...Object.keys(post.eps)])) {
    const a = JSON.stringify(pre.eps[k]), b = JSON.stringify(post.eps[k]);
    if (a !== b) diff[k] = {pre: JSON.parse(a), post: JSON.parse(b)};
}
const groupsPre = JSON.parse(fs.readFileSync('/tmp/v8canary/pre/bridge-groups.json', 'utf8'));
const groupsPost = JSON.parse(fs.readFileSync('/tmp/v8canary/post/bridge-groups.json', 'utf8'));
const gnorm = (g) => JSON.stringify({id: g.id, name: g.name, members: (g.members || []).slice().sort((x, y) => (x.ieee + x.endpoint) - (y.ieee + y.endpoint))});
const gdiff = [];
const gp = groupsPre.map(gnorm), gs = groupsPost.map(gnorm);
for (let i = 0; i < Math.max(gp.length, gs.length); i++) if (gp[i] !== gs[i]) gdiff.push({i, pre: gp[i] && JSON.parse(gp[i]), post: gs[i] && JSON.parse(gs[i])});
const fleetPre = JSON.parse(fs.readFileSync('/tmp/v8canary/pre/fleet-fingerprint.json', 'utf8'));
const fleetPost = JSON.parse(fs.readFileSync('/tmp/v8canary/post/fleet-fingerprint.json', 'utf8'));
const fdiff = [];
const map = new Map(fleetPost.devices.map((d) => [d.ieee, d]));
for (const d of fleetPre.devices) { const p = map.get(d.ieee); if (p && (p.sw !== d.sw || p.model !== d.model)) fdiff.push({ieee: d.ieee, pre: d, post: p}); }
const out = {at_utc: new Date().toISOString(), binding_total: {pre: Object.values(pre.eps).reduce((a, v) => a + v.bindings.length, 0), post: Object.values(post.eps).reduce((a, v) => a + v.bindings.length, 0)}, endpoint_diffs: Object.keys(diff), endpoint_diff_detail: diff, groups_count: {pre: groupsPre.length, post: groupsPost.length}, group_diffs: gdiff, fleet_count: {pre: fleetPre.count, post: fleetPost.count}, fleet_diffs: fdiff, identical: Object.keys(diff).length === 0 && gdiff.length === 0 && fdiff.length === 1 && fdiff[0].ieee === IEEE};
fs.writeFileSync('/tmp/v8canary/pre-post-diff.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({endpoint_diffs: Object.keys(diff), group_diffs: gdiff.length, fleet_diffs: fdiff, binding_total: out.binding_total}, null, 1));
