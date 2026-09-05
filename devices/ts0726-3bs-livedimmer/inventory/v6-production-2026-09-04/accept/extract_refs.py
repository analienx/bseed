"""Extract every entity_id referenced by the HA-v2 delta blocks, for live existence testing."""
import re

TMP = r"C:\Users\jakub\OneDrive\Projects\bseed-dimmer\.qwen\tmp"
NEW_ON = "LR - LivingRoomMainDimmer Swapped Output Sync ON"
NEW = "LR - MainDimmer v5 Target State Reconciliation"

auto = open(f"{TMP}\\patched-automations.yaml", encoding="utf-8", newline="").read()
scr = open(f"{TMP}\\patched-scripts.yaml", encoding="utf-8", newline="").read()

lines = auto.split("\n")
start = next(i for i, l in enumerate(lines) if NEW in l)
# walk back to the '- id:' that opens this entry, forward to the next top-level entry
s0 = max(i for i in range(start) if lines[i].startswith("- id:"))
s1 = next(i for i in range(start + 1, len(lines)) if lines[i].startswith("- id:"))
block_a = "\n".join(lines[s0:s1])

sl = scr.split("\n")


def entry(name):
    i0 = next(i for i, l in enumerate(sl) if l.startswith(name + ":"))
    nxt = [i for i in range(i0 + 1, len(sl)) if re.match(r"^[A-Za-z0-9_\-]+:\s*$", sl[i])]
    i1 = nxt[0] if nxt else len(sl)
    return "\n".join(sl[i0:i1])


block_s = "\n".join([entry("main_dimmer_finalize_v5_indicators"), entry("voice_circle_light_on"), entry("voice_circle_light_off")])

pat = re.compile(r"\b(?:sensor|switch|light|select|number|text|binary_sensor|update|button|automation|script|scene)\.[a-z0-9_]+")
ids = sorted(set(pat.findall(block_a)) | set(pat.findall(block_s)))
print(f"delta block entity references: {len(ids)}")
with open(f"{TMP}\\delta-refs.txt", "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(ids) + "\n")
for i in ids:
    print(" ", i)
