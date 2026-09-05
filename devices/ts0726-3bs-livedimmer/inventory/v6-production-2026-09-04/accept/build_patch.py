"""Build the deployable LIVE files = live + ONLY the reviewed HA-v2 delta.

Substitution is at YAML-entry granularity; inserted text is the byte-exact reviewed repo-v2
block (line endings normalized to the target file's convention). Every other live entry must
come out byte-identical, which is asserted before anything is written.
"""
import re
import sys

import yaml

TMP = r"C:\Users\jakub\OneDrive\Projects\bseed-dimmer\.qwen\tmp"
OLD_ON = "LR - LivingRoomMainDimmer Swapped Output Sync ON"
OLD_OFF = "LR - LivingRoomMainDimmer Swapped Output Sync OFF"
NEW = "LR - MainDimmer v5 Target State Reconciliation"


def read(name):
    with open(f"{TMP}\\{name}", encoding="utf-8", newline="") as fh:
        return fh.read()


def split(text, start_re):
    lines = text.split("\n")
    idx = [i for i, ln in enumerate(lines) if re.match(start_re, ln)]
    pre = "\n".join(lines[: idx[0]])
    blocks = ["\n".join(lines[i:j]) for i, j in zip(idx, idx[1:] + [len(lines)])]
    assert (pre + "\n" if pre else "") + "\n".join(blocks) == text, "splitter lossy"
    return pre, blocks


def join(pre, blocks):
    body = "\n".join(blocks)
    return ((pre + "\n" + body) if pre else body)


def norm(o):
    if isinstance(o, dict):
        return {k: norm(v) for k, v in o.items()}
    if isinstance(o, list):
        return [norm(v) for v in o]
    return o


def block_containing(blocks, pred):
    hits = [i for i, b in enumerate(blocks) if pred(b)]
    if len(hits) != 1:
        sys.exit(f"anchor not unique: {hits}")
    return hits[0]


# ---------------- automations (live is LF) ----------------
pre_a, blk_a = split(read("live-automations.yaml"), r"^- id:")
pre_v, blk_v = split(read("repo-v2-automations.yaml"), r"^- id:")
i_on = block_containing(blk_a, lambda b: OLD_ON in b)
i_off = block_containing(blk_a, lambda b: OLD_OFF in b)
i_new = block_containing(blk_v, lambda b: NEW in b)
assert abs(i_on - i_off) == 1, "old automations not adjacent in live"
new_block_a = blk_v[i_new]
out_a_blocks = blk_a[:i_on] + [new_block_a] + blk_a[i_off + 1:]
patched_a = join(pre_a, out_a_blocks)

# ---------------- scripts (live is CRLF) ----------------
pre_s, blk_s = split(read("live-scripts.yaml"), r"^[A-Za-z0-9_\-]+:\s*$")
pre_v2, blk_v2 = split(read("repo-v2-scripts.yaml"), r"^[A-Za-z0-9_\-]+:\s*$")
crlf = lambda s: s.replace("\r\n", "\n").replace("\n", "\r\n")
idx_map = {}
for key in ["voice_circle_light_on", "voice_circle_light_off"]:
    li = block_containing(blk_s, lambda b, k=key: b.startswith(k + ":"))
    vi = block_containing(blk_v2, lambda b, k=key: b.startswith(k + ":"))
    idx_map[li] = crlf(blk_v2[vi])
i_fin_v = block_containing(blk_v2, lambda b: b.startswith("main_dimmer_finalize_v5_indicators:"))
out_s_blocks = [idx_map.get(i, b) for i, b in enumerate(blk_s)]
tail = blk_s[-1].rstrip("\r\n")
out_s_blocks[-1] = tail + "\r\n\r\n\r\n" + crlf(blk_v2[i_fin_v])
patched_s = join(pre_s, out_s_blocks)

# ---------------- verification ----------------
print("AUTOMATIONS")
print("  inserted block byte-identical to reviewed v2:", new_block_a == blk_v[i_new])
la_p = yaml.safe_load(patched_a)
la = yaml.safe_load(read("live-automations.yaml"))
va = yaml.safe_load(read("repo-v2-automations.yaml"))
al = [e.get("alias") for e in la]
ap = [e.get("alias") for e in la_p]
print(f"  entries live={len(la)} patched={len(la_p)}")
print(f"  removed: {[a for a in al if a not in ap]}")
print(f"  added:   {[a for a in ap if a not in al]}")
assert not [a for a in al if a not in ap and a not in (OLD_ON, OLD_OFF)], "unexpected removal"
assert [a for a in ap if a not in al] == [NEW], "unexpected addition"
lm = {e.get("alias"): norm(e) for e in la}
pm = {e.get("alias"): norm(e) for e in la_p}
vm = {e.get("alias"): norm(e) for e in va}
untouched = [a for a in lm if a in pm and a not in (OLD_ON, OLD_OFF)]
bad = [a for a in untouched if lm[a] != pm[a]]
print(f"  other {len(untouched)} entries semantically untouched: {not bad}{'' if not bad else ' -> ' + str(bad)}")
print("  reconcile entry == reviewed v2 entry:", pm[NEW] == vm[NEW])

print("SCRIPTS")
ls_p = yaml.safe_load(patched_s)
ls = yaml.safe_load(read("live-scripts.yaml"))
vs = yaml.safe_load(read("repo-v2-scripts.yaml"))
print("  inserted circle blocks == reviewed v2:",
      all(norm(ls_p[k]) == norm(vs[k]) for k in ["voice_circle_light_on", "voice_circle_light_off"]))
print("  finalize block == reviewed v2:", norm(ls_p["main_dimmer_finalize_v5_indicators"]) == norm(vs["main_dimmer_finalize_v5_indicators"]))
others = [k for k in ls if k not in ("voice_circle_light_on", "voice_circle_light_off")]
bad_s = [k for k in others if norm(ls[k]) != norm(ls_p[k])]
print(f"  other {len(others)} scripts semantically untouched: {not bad_s}{'' if not bad_s else ' -> ' + str(bad_s)}")

# RIGHT-channel write prohibition: the reviewed contract forbids ANY write to the RIGHT relay.
# (RIGHT may still appear as a read-only gate entity, which is intended.)
sr_right = "state_relay_right"
rr_switch = "switch.livingroommaindimmer_relay_right"
print("  no state_relay_right write in patched automations:", sr_right not in patched_a)
print("  no state_relay_right write in patched scripts:", sr_right not in patched_s)
for k, v in ls_p.items():
    d = yaml.dump(norm(v))
    if rr_switch in d and k in ("voice_circle_light_on", "voice_circle_light_off"):
        sys.exit(f"RIGHT relay action survived in {k}")
print("  circle scripts contain no RIGHT relay action:",
      all(rr_switch not in yaml.dump(norm(ls_p[k])) for k in ["voice_circle_light_on", "voice_circle_light_off"]))
assert sr_right not in patched_a and sr_right not in patched_s

with open(f"{TMP}\\patched-automations.yaml", "w", encoding="utf-8", newline="") as fh:
    fh.write(patched_a)
with open(f"{TMP}\\patched-scripts.yaml", "w", encoding="utf-8", newline="") as fh:
    fh.write(patched_s)
import hashlib
for n, t in [("patched-automations.yaml", patched_a), ("patched-scripts.yaml", patched_s)]:
    print(n, "sha256", hashlib.sha256(t.encode()).hexdigest())
print("wrote patched files")
