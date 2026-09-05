"""Prove the live binding table is exactly the accepted-18 set banked at 3b596f3."""
import json
import re

TMP = r"C:\Users\jakub\OneDrive\Projects\bseed-dimmer\.qwen\tmp"
ACC = r"C:\Users\jakub\OneDrive\Projects\bseed-dimmer\devices\ts0726-3bs-livedimmer\inventory\v6-production-2026-09-04\accept\raw-logs"


def canon(ep, b):
    t = b["target"]
    if t.get("type") == "group":
        return f"{ep}:{b['cluster']}->grp{t.get('id', t.get('group_id'))}"
    return f"{ep}:{b['cluster']}->{t['ieee_address']}/{t['endpoint']}"


_txt = open(f"{TMP}\\bnd-post-hav2.txt", encoding="utf-8").read()
now, _ = json.JSONDecoder().raw_decode(_txt)  # bnd.js appends a human section after the JSON
live = {canon(ep, b) for ep, e in now["endpoints"].items() for b in e.get("bindings", [])}
print("live bindings:", len(live), "| definition:", now["definition_model"], "| nwk:", now["nwk"])

acc = json.load(open(f"{ACC}\\unbind-result.json", encoding="utf-8"))
step = acc[4]
print("accepted stage:", step["stage"], "| total:", step["total"], "| len:", len(step["bindings"]))
print("sample accepted entry:", step["bindings"][0])
accepted = {str(b) if not isinstance(b, dict) else canon(str(b["endpoint"]), b) for b in step["bindings"]}
print("accepted bindings:", len(accepted))
print("missing now (should be empty):", sorted(accepted - live))
print("extra now  (should be empty):", sorted(live - accepted))
print("EXACT MATCH:", accepted == live)
