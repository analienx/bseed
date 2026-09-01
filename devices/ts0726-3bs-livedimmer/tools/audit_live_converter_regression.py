#!/usr/bin/env python3
"""Fleet-wide regression audit for the TS0726 canary converter rollout.

This compares retained Zigbee2MQTT bridge/devices + bridge/groups snapshots and
fails closed on behavioral API drift outside the explicitly targeted device.

Default evidence comes from:
  inventory/pre-ota-v3-2026-09-01/

The audit intentionally distinguishes:
- live Zigbee/device state (bindings/reporting/scenes/clusters)
- converter/API contract (properties, access, enum values, endpoint routing)
- presentation-only UX metadata (labels/descriptions/units/categories)

It is a reviewer gate, not a generator unit test.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

TARGET_IEEE = "0xa4c13843a9d40f85"
TARGET_EXPECTED_MODEL_BEFORE = "EC-SL-FK86ZPCS31"
TARGET_EXPECTED_MODEL_AFTER = "EC-GL86ZPCS31"
TARGET_NEW_PHYSICAL = {
    "relay_left_physical_mode",
    "relay_middle_physical_mode",
    "relay_right_physical_mode",
}
# The historical converter exposed a stale relay-index value "all". Current
# firmware only accepts indices 1..relay_count, so removal is intentional.
INTENTIONAL_TARGET_ENUM_REMOVAL = "all"

BEHAVIOR_FIELDS = ("type", "access", "values", "value_on", "value_off", "endpoint")
UX_FIELDS = ("label", "description", "unit", "category")


def load_snapshot(path: Path) -> list[dict[str, Any]]:
    obj = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(obj, list):
        return obj
    for key in ("snapshot", "data", "devices"):
        value = obj.get(key) if isinstance(obj, dict) else None
        if isinstance(value, list):
            return value
    raise ValueError(f"{path}: cannot find device snapshot array")


def load_groups(path: Path) -> Any:
    obj = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(obj, dict) and "snapshot" in obj:
        return obj["snapshot"]
    return obj


def flatten_exposes(exposes: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def walk(expose: dict[str, Any]) -> None:
        if expose.get("property"):
            out.append(
                {
                    "property": expose.get("property"),
                    "name": expose.get("name"),
                    "label": expose.get("label"),
                    "type": expose.get("type"),
                    "access": expose.get("access"),
                    "values": expose.get("values"),
                    "value_on": expose.get("value_on"),
                    "value_off": expose.get("value_off"),
                    "unit": expose.get("unit"),
                    "category": expose.get("category"),
                    "endpoint": expose.get("endpoint"),
                    "description": expose.get("description"),
                }
            )
        for feature in expose.get("features") or []:
            walk(feature)

    for expose in exposes or []:
        walk(expose)
    return out


def normalized_endpoint_state(device: dict[str, Any]) -> Any:
    """Everything except converter definition; this must not drift during F."""
    return {
        "date_code": device.get("date_code"),
        "disabled": device.get("disabled"),
        "friendly_name": device.get("friendly_name"),
        "ieee_address": device.get("ieee_address"),
        "interview_completed": device.get("interview_completed"),
        "interview_state": device.get("interview_state"),
        "manufacturer": device.get("manufacturer"),
        "model_id": device.get("model_id"),
        "network_address": device.get("network_address"),
        "power_source": device.get("power_source"),
        "software_build_id": device.get("software_build_id"),
        "supported": device.get("supported"),
        "type": device.get("type"),
        "endpoints": device.get("endpoints"),
    }


def compare(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> dict[str, Any]:
    bmap = {d["ieee_address"]: d for d in before}
    amap = {d["ieee_address"]: d for d in after}

    report: dict[str, Any] = {
        "device_count_before": len(before),
        "device_count_after": len(after),
        "missing_devices": sorted(set(bmap) - set(amap)),
        "added_devices": sorted(set(amap) - set(bmap)),
        "device_state_drift": [],
        "definition_rematches": [],
        "behavior_api_changes": [],
        "ux_changes": [],
    }

    for ieee in sorted(set(bmap) & set(amap)):
        b = bmap[ieee]
        a = amap[ieee]
        if normalized_endpoint_state(b) != normalized_endpoint_state(a):
            report["device_state_drift"].append(
                {"ieee": ieee, "friendly_name": b.get("friendly_name")}
            )

        bd = b.get("definition") or {}
        ad = a.get("definition") or {}
        if any(bd.get(k) != ad.get(k) for k in ("model", "vendor", "source", "supports_ota")):
            report["definition_rematches"].append(
                {
                    "ieee": ieee,
                    "friendly_name": b.get("friendly_name"),
                    "before": {k: bd.get(k) for k in ("model", "vendor", "source", "supports_ota")},
                    "after": {k: ad.get(k) for k in ("model", "vendor", "source", "supports_ota")},
                }
            )

        bflat = {x["property"]: x for x in flatten_exposes(bd.get("exposes"))}
        aflat = {x["property"]: x for x in flatten_exposes(ad.get("exposes"))}
        removed = sorted(set(bflat) - set(aflat))
        added = sorted(set(aflat) - set(bflat))
        behavior = []
        ux = []
        for prop in sorted(set(bflat) & set(aflat)):
            bx, ax = bflat[prop], aflat[prop]
            bdiff = {
                field: [bx.get(field), ax.get(field)]
                for field in BEHAVIOR_FIELDS
                if bx.get(field) != ax.get(field)
            }
            if bdiff:
                behavior.append({"property": prop, "changes": bdiff})
            udiff = {
                field: [bx.get(field), ax.get(field)]
                for field in UX_FIELDS
                if bx.get(field) != ax.get(field)
            }
            if udiff:
                ux.append({"property": prop, "changes": udiff})

        if removed or added or behavior:
            report["behavior_api_changes"].append(
                {
                    "ieee": ieee,
                    "friendly_name": b.get("friendly_name"),
                    "model_before": bd.get("model"),
                    "model_after": ad.get("model"),
                    "removed_properties": removed,
                    "added_properties": added,
                    "changed_properties": behavior,
                }
            )
        if ux:
            report["ux_changes"].append(
                {
                    "ieee": ieee,
                    "friendly_name": b.get("friendly_name"),
                    "changes": ux,
                }
            )
    return report


def target_ux_findings(after: list[dict[str, Any]]) -> list[str]:
    dev = next((d for d in after if d.get("ieee_address") == TARGET_IEEE), None)
    if not dev:
        return ["target missing from post-F snapshot"]
    exposes = flatten_exposes((dev.get("definition") or {}).get("exposes"))
    by_prop = {e["property"]: e for e in exposes}
    findings: list[str] = []

    for prop in sorted(TARGET_NEW_PHYSICAL):
        e = by_prop.get(prop)
        if not e:
            findings.append(f"missing {prop}")
            continue
        if e.get("label") != "Physical relay behavior":
            findings.append(f"{prop}: unexpected label {e.get('label')!r}")
        if e.get("values") != ["follow_state", "always_on", "always_off"]:
            findings.append(f"{prop}: unexpected values {e.get('values')!r}")
        desc = e.get("description") or ""
        for marker in ("smart bulbs", "immediately", "mains"):
            if marker not in desc:
                findings.append(f"{prop}: description missing {marker!r}")

    # The new physical-policy design makes the stock relay State/Power-on
    # labels ambiguous: logical Zigbee state can diverge from electrical mains.
    for prop in ("state_relay_left", "state_relay_middle"):
        e = by_prop.get(prop)
        if e and e.get("label") == "State":
            findings.append(
                f"{prop}: stock label 'State' is ambiguous with Always on; "
                "must identify logical/virtual relay state"
            )
    for prop in ("power_on_behavior_relay_left", "power_on_behavior_relay_middle"):
        e = by_prop.get(prop)
        if e and "physical" not in (e.get("description") or "").lower():
            findings.append(
                f"{prop}: description does not explain interaction with Physical relay behavior"
            )

    for prop in (
        "switch_left_relay_index_switch_left",
        "switch_middle_relay_index_switch_middle",
        "switch_right_relay_index_switch_right",
    ):
        e = by_prop.get(prop)
        if e and "Left" not in (e.get("description") or ""):
            findings.append(
                f"{prop}: description does not map relay_1/2/3 to Left/Middle/Right"
            )

    # Device config should not conceptually lead the page.
    ordered = flatten_exposes((dev.get("definition") or {}).get("exposes"))
    props = [x["property"] for x in ordered]
    if props and props[0].startswith("device_config"):
        findings.append("Advanced hardware configuration is the first expose; move it to the advanced/end section")
    return findings


def classify_failures(report: dict[str, Any], ux_findings: list[str]) -> list[str]:
    failures: list[str] = []
    if report["device_count_before"] != report["device_count_after"]:
        failures.append("fleet device count changed")
    if report["missing_devices"] or report["added_devices"]:
        failures.append("fleet membership changed")
    if report["device_state_drift"]:
        failures.append("non-definition Zigbee/device state drift detected")

    for rematch in report["definition_rematches"]:
        if rematch["ieee"] != TARGET_IEEE:
            failures.append(f"unexpected definition rematch: {rematch['friendly_name']}")
        elif (
            rematch["before"]["model"] != TARGET_EXPECTED_MODEL_BEFORE
            or rematch["after"]["model"] != TARGET_EXPECTED_MODEL_AFTER
        ):
            failures.append("target rematched to unexpected model")

    for change in report["behavior_api_changes"]:
        ieee = change["ieee"]
        if ieee != TARGET_IEEE:
            failures.append(
                f"non-target API changed: {change['friendly_name']} "
                f"removed={change['removed_properties']} added={change['added_properties']}"
            )
            continue

        removed = set(change["removed_properties"])
        added = set(change["added_properties"])
        if "action" in removed:
            failures.append("target legacy action property removed; compatibility proof/restore required")
        unexpected_added = added - TARGET_NEW_PHYSICAL
        if unexpected_added:
            failures.append(f"target unexpected added properties: {sorted(unexpected_added)}")
        for item in change["changed_properties"]:
            values = item["changes"].get("values")
            if not values:
                failures.append(f"target unexpected behavioral change: {item}")
                continue
            before_values, after_values = values
            if (
                isinstance(before_values, list)
                and isinstance(after_values, list)
                and INTENTIONAL_TARGET_ENUM_REMOVAL in before_values
                and INTENTIONAL_TARGET_ENUM_REMOVAL not in after_values
                and [x for x in before_values if x != INTENTIONAL_TARGET_ENUM_REMOVAL] == after_values
            ):
                continue
            failures.append(f"target unexpected enum/API change: {item}")

    failures.extend(f"UX: {x}" for x in ux_findings)
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--before-devices", type=Path)
    parser.add_argument("--after-devices", type=Path)
    parser.add_argument("--before-groups", type=Path)
    parser.add_argument("--after-groups", type=Path)
    args = parser.parse_args()

    here = Path(__file__).resolve().parent
    evidence = here.parent / "inventory" / "pre-ota-v3-2026-09-01"
    before_devices = args.before_devices or evidence / "bridge-devices-before-f.json"
    after_devices = args.after_devices or evidence / "bridge-devices-after-f.json"
    before_groups = args.before_groups or evidence / "bridge-groups-before-f.json"
    after_groups = args.after_groups or evidence / "bridge-groups-after-f.json"

    before = load_snapshot(before_devices)
    after = load_snapshot(after_devices)
    report = compare(before, after)
    groups_equal = load_groups(before_groups) == load_groups(after_groups)
    ux_findings = target_ux_findings(after)
    failures = classify_failures(report, ux_findings)
    if not groups_equal:
        failures.append("bridge/groups snapshot changed")

    output = {
        "status": "PASS" if not failures else "FAIL",
        "groups_equal": groups_equal,
        "failures": failures,
        "summary": {
            "device_count_before": report["device_count_before"],
            "device_count_after": report["device_count_after"],
            "definition_rematches": len(report["definition_rematches"]),
            "behavior_api_changed_devices": len(report["behavior_api_changes"]),
            "ux_changed_devices": len(report["ux_changes"]),
            "device_state_drift": len(report["device_state_drift"]),
        },
        "definition_rematches": report["definition_rematches"],
        "behavior_api_changes": report["behavior_api_changes"],
        "target_ux_findings": ux_findings,
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
