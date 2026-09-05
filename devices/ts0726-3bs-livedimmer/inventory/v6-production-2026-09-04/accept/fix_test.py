"""Apply the same V7 entity-id correction inside the contract test's asserted literals."""
import pathlib

p = pathlib.Path(r"C:\Users\jakub\OneDrive\Projects\ha-stack-wt-ha-v2-integration\tools\tests\test_main_dimmer_v5.py")
txt = p.read_text(encoding="utf-8", newline="")
subs = {
    "relay_left_indicator_mode_relay_left')": "relay_left_indicator_mode')",
    "relay_middle_indicator_mode_relay_middle')": "relay_middle_indicator_mode')",
    "relay_right_indicator_mode_relay_right')": "relay_right_indicator_mode')",
}
n = 0
for bad, good in subs.items():
    n += txt.count(bad)
    txt = txt.replace(bad, good)
p.write_text(txt, encoding="utf-8", newline="")
print("test literals corrected:", n)
assert "_indicator_mode_relay_" not in txt, "stale literal remains in test"
