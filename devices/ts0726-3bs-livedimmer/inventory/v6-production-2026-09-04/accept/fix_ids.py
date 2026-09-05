"""Correct the V7 entity-id defect in the staged HA v2 branch content (local worktree only)."""
import pathlib
import re

WT = pathlib.Path(r"C:\Users\jakub\OneDrive\Projects\ha-stack-wt-ha-v2-integration")
targets = {
    "select.livingroommaindimmer_relay_left_indicator_mode_relay_left": "select.livingroommaindimmer_relay_left_indicator_mode",
    "select.livingroommaindimmer_relay_middle_indicator_mode_relay_middle": "select.livingroommaindimmer_relay_middle_indicator_mode",
    "select.livingroommaindimmer_relay_right_indicator_mode_relay_right": "select.livingroommaindimmer_relay_right_indicator_mode",
}
files = ["home-assistant/automations.yaml", "home-assistant/scripts.yaml", "tools/tests/test_main_dimmer_v5.py"]
total = 0
for f in files:
    p = WT / f
    txt = p.read_text(encoding="utf-8", newline="")
    n = 0
    for bad, good in targets.items():
        n += txt.count(bad)
        txt = txt.replace(bad, good)
    p.write_text(txt, encoding="utf-8", newline="")
    left = sum(len(re.findall(re.escape(good), txt)) for good in targets.values())
    print(f"{f}: replaced={n} now-unsuffixed-occurrences={left}")
    total += n
print("total replacements:", total)
