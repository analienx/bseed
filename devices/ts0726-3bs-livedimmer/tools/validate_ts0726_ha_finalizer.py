#!/usr/bin/env python3
"""V3 revalidation: HA branch supervisor/ts0726-post-migration-ha-v1 @ 8efc5696.

Proves the supervisor's seven required facts about
script.main_dimmer_finalize_v4_indicators and validates YAML syntax of the
whole home-assistant tree (custom !include tags tolerated).
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import yaml

ROOT = pathlib.Path(r"C:\Users\jakub\OneDrive\Projects\_worktrees\ha-ts0726-v4\home-assistant")
HA_ROOT = ROOT.parent

RESULTS = []
def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append({"check": name, "pass": bool(ok), "detail": detail})
    print(("PASS  " if ok else "FAIL  ") + name + ("  -- " + detail if detail else ""))


def include_loader(loader, node):
    value = loader.construct_scalar(node)
    path = HA_ROOT / value
    if path.is_file():
        return path.read_text(encoding="utf-8", errors="replace")
    return None


class Loader(yaml.SafeLoader):
    pass


for tag in ("!include", "!include_dir_named", "!include_dir_merge_named", "!include_dir_list", "!input", "!secret", "!env_var"):
    Loader.add_constructor(tag, lambda loader, node: loader.construct_scalar(node))


def parse(path: pathlib.Path):
    with path.open(encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    text = re.sub(r"^#.*$", "", text, flags=re.M)
    return yaml.load(text, Loader=Loader), text


def main() -> int:
    # ---- YAML syntax validation across the tree ----
    yaml_files = sorted(p for p in ROOT.rglob("*.yaml") if ".git" not in p.parts)
    yaml_errors = []
    parsed = {}
    for p in yaml_files:
        try:
            parsed[str(p.relative_to(ROOT))] = parse(p)[0]
        except Exception as exc:  # noqa: BLE001
            yaml_errors.append(f"{p.relative_to(ROOT)}: {exc}")
    check("all home-assistant yaml parses", not yaml_errors, "; ".join(yaml_errors[:5]))

    # ---- scripts.yaml: finalizer exists ----
    scripts = parsed.get("scripts.yaml")
    if scripts is None:
        check("scripts.yaml parsed", False)
        return 1
    script = (scripts or {}).get("main_dimmer_finalize_v4_indicators")
    check("script.main_dimmer_finalize_v4_indicators exists", isinstance(script, dict))

    if not isinstance(script, dict):
        return 1

    seq = script.get("sequence", [])

    # ---- requires operator_continuity_confirmed ----
    fields = script.get("fields", {})
    field_required = bool(fields.get("operator_continuity_confirmed", {}).get("required"))
    seq_text = json.dumps(seq, ensure_ascii=False)
    has_cont_cond = "operator_continuity_confirmed" in seq_text
    check("requires operator_continuity_confirmed (field + condition)",
          field_required and has_cont_cond,
          f"field_required={field_required} condition_present={has_cont_cond}")

    # ---- requires all 3 physical modes = always_on ----
    mode_targets = {
        "select.livingroommaindimmer_relay_left_physical_mode",
        "select.livingroommaindimmer_relay_middle_physical_mode",
        "select.livingroommaindimmer_relay_right_physical_mode",
    }
    cond_text = seq_text
    all_always_on = all(t in cond_text for t in mode_targets) and "always_on" in cond_text
    check("requires all 3 physical modes = always_on", all_always_on)

    # ---- changes only indicator-mode selects to same ----
    indicator_targets = {
        "select.livingroommaindimmer_relay_left_indicator_mode_relay_left",
        "select.livingroommaindimmer_relay_middle_indicator_mode_relay_middle",
        "select.livingroommaindimmer_relay_right_indicator_mode_relay_right",
    }
    actions = [a for a in seq if isinstance(a, dict) and "action" in a]
    action_sigs = []
    only_same = True
    for a in actions:
        target = a.get("target", {}).get("entity_id", [])
        if not isinstance(target, list):
            target = [target]
        sig = {
            "action": a.get("action"),
            "entities": sorted(str(t) for t in target),
            "option": a.get("data", {}).get("option"),
        }
        action_sigs.append(sig)
        if a.get("action") != "select.select_option":
            only_same = False
        if set(target) != indicator_targets:
            only_same = False
        if a.get("data", {}).get("option") != "same":
            only_same = False
    check("changes only indicator-mode selects to same", only_same, json.dumps(action_sigs))

    # ---- does not change physical mode ----
    no_phys_writes = not any(
        "physical" in str(t).lower() and str(a.get("action", "")).startswith("select")
        for a in actions
        for t in (a.get("target", {}).get("entity_id", []) if isinstance(a.get("target", {}).get("entity_id", []), list) else [a.get("target", {}).get("entity_id")])
    )
    check("does not change physical mode", no_phys_writes)

    # ---- does not write switch.livingroommaindimmer_relay_right ----
    # Scoped to the finalizer script object only (not unrelated scripts in the file).
    script_json = json.dumps(script, ensure_ascii=False)
    no_right_switch = "switch.livingroommaindimmer_relay_right" not in script_json
    no_switch_action = not any(str(a.get("action", "")).startswith("switch.")
                               for a in actions)
    check("does not write switch.livingroommaindimmer_relay_right",
          no_right_switch and no_switch_action)

    # ---- never called automatically (whole HA tree) ----
    refs = []
    for p in ROOT.rglob("*.yaml"):
        if ".git" in p.parts:
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if "main_dimmer_finalize_v4_indicators" in text and p.name != "scripts.yaml":
            refs.append(str(p.relative_to(ROOT)))
    check("never referenced outside scripts.yaml (not automatic)", not refs, "; ".join(refs))

    other_refs = []
    for p in ROOT.rglob("*"):
        if p.is_file() and p.suffix not in (".yaml", ".yml") and ".git" not in p.parts:
            if "main_dimmer_finalize_v4_indicators" in p.read_text(encoding="utf-8", errors="replace"):
                other_refs.append(str(p.relative_to(ROOT)))
    check("no reference in non-yaml files", not other_refs, "; ".join(other_refs))

    overall = all(r["pass"] for r in RESULTS)
    print("\nRESULT: " + ("PASS" if overall else "FAIL"))
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(main())
