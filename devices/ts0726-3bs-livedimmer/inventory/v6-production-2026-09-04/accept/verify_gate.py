"""Gate check before surgical substitution: are the live copies of the base entries
SEMANTICALLY identical to repo-main (i.e. only YAML style drift), and what are the
line endings? Also quantifies the live-vs-main drift in parsed terms."""
import hashlib
import sys

import yaml

TMP = r"C:\Users\jakub\OneDrive\Projects\bseed-dimmer\.qwen\tmp"


def raw(name):
    with open(f"{TMP}\\{name}", "rb") as fh:
        return fh.read()


for name in ["live-automations.yaml", "repo-main-automations.yaml", "repo-v2-automations.yaml",
             "live-scripts.yaml", "repo-main-scripts.yaml", "repo-v2-scripts.yaml"]:
    b = raw(name)
    print(f"{name}: bytes={len(b)} CRLF={b.count(b'\r\n')} LF_total={b.count(b'\n')} tabs={b.count(b'\t')}")

print("=" * 70)


def parse_list(name):
    return yaml.safe_load(raw(name).decode("utf-8"))


def parse_map(name):
    return yaml.safe_load(raw(name).decode("utf-8"))


def h(obj):
    return hashlib.sha256(repr(sorted(_norm(obj).items()) if isinstance(obj, dict) else obj).encode()).hexdigest()[:12]


def _norm(o):
    if isinstance(o, dict):
        return {k: _norm(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_norm(v) for v in o]
    return o


la, ba, va = parse_list("live-automations.yaml"), parse_list("repo-main-automations.yaml"), parse_list("repo-v2-automations.yaml")
ls, bs, vs = parse_map("live-scripts.yaml"), parse_map("repo-main-scripts.yaml"), parse_map("repo-v2-scripts.yaml")
print(f"parsed automations entries: live={len(la)} base={len(ba)} v2={len(va)}")
print(f"parsed scripts keys:        live={len(ls)} base={len(bs)} v2={len(vs)}")


def alias_of(e):
    return e.get("alias", e.get("id"))


la_map = {alias_of(e): e for e in la}
ba_map = {alias_of(e): e for e in ba}
va_map = {alias_of(e): e for e in va}
print("\n-- automation aliases in base but NOT live (would be added by a naive copy) --")
for a in ba_map:
    if a not in la_map:
        print("   ", a)
print("-- automation aliases in live but NOT base (live-only, must be preserved) --")
for a in la_map:
    if a not in ba_map:
        print("   ", a)

OLD = ["LR - LivingRoomMainDimmer Swapped Output Sync ON", "LR - LivingRoomMainDimmer Swapped Output Sync OFF"]
NEW = "LR - MainDimmer v5 Target State Reconciliation"
for a in OLD:
    same = _norm(la_map[a]) == _norm(ba_map[a])
    print(f"semantic live==base for {a!r}: {same}")
print(f"v5 reconcile already in live? {NEW in la_map}")

for k in ["voice_circle_light_on", "voice_circle_light_off"]:
    same = _norm(ls[k]) == _norm(bs[k])
    print(f"semantic live==base for script {k!r}: {same}")
    if not same:
        import difflib
        x = yaml.dump(_norm(bs[k]), sort_keys=True).split("\n")
        y = yaml.dump(_norm(ls[k]), sort_keys=True).split("\n")
        print("\n".join(list(difflib.unified_diff(x, y, "base", "live", lineterm="", n=0))[:30]))
print(f"finalize script in live? {'main_dimmer_finalize_v5_indicators' in ls} | in v2? {'main_dimmer_finalize_v5_indicators' in vs}")
