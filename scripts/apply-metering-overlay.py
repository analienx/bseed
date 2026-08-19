#!/usr/bin/env python3
"""Apply/verify the minimal BSEED metering overlay to the pinned downstream source.

The downstream fork already contains hardware-tested power metering for
_TZ3000_b28wrpvx.  The project canary intentionally removes two unrelated
behaviour changes from that release:

* LED PWM flags are removed so PC3/PB4 keep the existing on/off semantics.
* overload relay actuation is disabled explicitly with a NOOL config token.

The overlay is deliberately narrow and guarded.  It refuses to touch an
unexpected source revision or an already-dirty checkout.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Tuple

PINNED_SOURCE_COMMIT = "8b8cc4924a353b35880666f7b48f0afbee89eb17"
DEVICE_KEY = "OUTLET_BSEED_PM_TS011F_b28wrpvx"
ORIGINAL_CONFIG = (
    "b28wrpvx;TS011F-BS-PM;LC3p;SB5u;RD2;IB4p;EPA1C2B1;M;"
)
CANDIDATE_CONFIG = (
    "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;EPA1C2B1;NOOL;M;"
)

GLOBAL_NEEDLE = (
    "static uint8_t            energy_monitoring_enabled  = 0;\n"
    "static uint8_t            energy_monitoring_endpoint = 1;"
)
GLOBAL_REPLACEMENT = GLOBAL_NEEDLE + (
    "\nstatic uint8_t            overload_protection_enabled = 1;"
)

PARSE_START_NEEDLE = "void parse_config() {\n    device_config_read_from_nv();"
PARSE_START_REPLACEMENT = (
    "void parse_config() {\n"
    "    // Config may be reparsed at runtime; never carry a previous NOOL state.\n"
    "    overload_protection_enabled = 1;\n"
    "    device_config_read_from_nv();"
)

OL_NEEDLE = "        } else if (entry[0] == 'O' && entry[1] == 'L') {"
OL_REPLACEMENT = (
    "        } else if (strcmp(entry, \"NOOL\") == 0) {\n"
    "            // Project canary safety token: keep energy measurement active\n"
    "            // while preventing the downstream overload state machine from\n"
    "            // actuating the socket relay. This is intentionally opt-out and\n"
    "            // local to configs that carry NOOL.\n"
    "            overload_protection_enabled = 0;\n"
    + OL_NEEDLE
)

PROTECTED_RELAY_NEEDLE = (
    "    if (energy_monitoring_enabled && relay_clusters_cnt > 0) {"
)
PROTECTED_RELAY_REPLACEMENT = (
    "    if (energy_monitoring_enabled && overload_protection_enabled &&\n"
    "        relay_clusters_cnt > 0) {"
)

CALIBRATION_MARKERS = (
    "hlw8012_voltage_multiplier: 161460",
    "hlw8012_current_multiplier: 144679",
    "hlw8012_power_multiplier: 16989",
)


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one source match, found {count}")
    return text.replace(old, new, 1)


def overlay_device_db(text: str) -> Tuple[str, bool]:
    """Return (new_text, changed). Supports original or already-overlaid text."""
    if CANDIDATE_CONFIG in text:
        if ORIGINAL_CONFIG in text:
            raise RuntimeError("device_db contains both original and candidate config")
        return text, False

    if DEVICE_KEY not in text:
        raise RuntimeError(f"device_db missing target key {DEVICE_KEY}")
    if ORIGINAL_CONFIG not in text:
        raise RuntimeError("device_db target config does not match pinned downstream source")

    # Require the known downstream calibration to exist before adopting it.
    for marker in CALIBRATION_MARKERS:
        if marker not in text:
            raise RuntimeError(f"device_db missing expected calibration marker: {marker}")

    return _replace_once(text, ORIGINAL_CONFIG, CANDIDATE_CONFIG, "device config"), True


def overlay_config_parser(text: str) -> Tuple[str, bool]:
    """Apply the NOOL parser/relay gate, or validate an already-overlaid parser."""
    post_markers = (
        "overload_protection_enabled = 1;",
        'strcmp(entry, "NOOL") == 0',
        "energy_monitoring_enabled && overload_protection_enabled &&",
    )
    if all(marker in text for marker in post_markers):
        return text, False
    if any(marker in text for marker in post_markers):
        raise RuntimeError("config_parser has a partial/inconsistent metering overlay")

    text = _replace_once(text, GLOBAL_NEEDLE, GLOBAL_REPLACEMENT, "overload global")
    text = _replace_once(text, PARSE_START_NEEDLE, PARSE_START_REPLACEMENT, "parse reset")
    text = _replace_once(text, OL_NEEDLE, OL_REPLACEMENT, "NOOL parser token")
    text = _replace_once(
        text,
        PROTECTED_RELAY_NEEDLE,
        PROTECTED_RELAY_REPLACEMENT,
        "protected relay gate",
    )
    return text, True


def _git(root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(root), *args],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed ({proc.returncode}): {proc.stderr.strip()}"
        )
    return proc.stdout.strip()


def verify_checkout(root: Path, allow_dirty: bool) -> None:
    if not (root / ".git").exists():
        raise RuntimeError(f"not a git checkout: {root}")
    head = _git(root, "rev-parse", "HEAD")
    if head != PINNED_SOURCE_COMMIT:
        raise RuntimeError(
            f"unexpected source commit: expected {PINNED_SOURCE_COMMIT}, got {head}"
        )
    status = _git(root, "status", "--porcelain")
    if status and not allow_dirty:
        raise RuntimeError(
            "source checkout is not clean; refusing to overlay unrelated changes:\n" + status
        )


def verify_post_state(root: Path) -> dict:
    db = (root / "device_db.yaml").read_text(encoding="utf-8")
    parser = (root / "src/device_config/config_parser.c").read_text(encoding="utf-8")

    if CANDIDATE_CONFIG not in db or ORIGINAL_CONFIG in db:
        raise RuntimeError("candidate device config is not in the expected post-overlay state")
    for marker in CALIBRATION_MARKERS:
        if marker not in db:
            raise RuntimeError(f"post-overlay calibration marker missing: {marker}")
    for marker in (
        "static uint8_t            overload_protection_enabled = 1;",
        'strcmp(entry, "NOOL") == 0',
        "energy_monitoring_enabled && overload_protection_enabled &&",
    ):
        if marker not in parser:
            raise RuntimeError(f"post-overlay parser marker missing: {marker}")

    # The candidate must preserve all established control GPIOs and add only the
    # already hardware-verified meter GPIOs.
    required_tokens = ("LC3", "SB5u", "RD2", "IB4", "EPA1C2B1", "NOOL", "M")
    for token in required_tokens:
        if f";{token};" not in f";{CANDIDATE_CONFIG}":
            raise RuntimeError(f"internal candidate config invariant failed for token {token}")

    return {
        "source_commit": PINNED_SOURCE_COMMIT,
        "device_key": DEVICE_KEY,
        "candidate_config": CANDIDATE_CONFIG,
        "control_gpio": {"network_led": "PC3", "button": "PB5", "relay": "PD2", "indicator": "PB4"},
        "meter_gpio": {"cf": "PA1", "cf1": "PC2", "sel": "PB1"},
        "overload_relay_actuation": False,
        "calibration": {
            "voltage_multiplier": 161460,
            "current_multiplier": 144679,
            "power_multiplier": 16989,
        },
    }


def apply_overlay(root: Path) -> dict:
    verify_checkout(root, allow_dirty=False)

    db_path = root / "device_db.yaml"
    parser_path = root / "src/device_config/config_parser.c"
    db = db_path.read_text(encoding="utf-8")
    parser = parser_path.read_text(encoding="utf-8")

    db_new, db_changed = overlay_device_db(db)
    parser_new, parser_changed = overlay_config_parser(parser)
    if not db_changed and not parser_changed:
        raise RuntimeError("overlay already applied; use --verify for an existing overlay")

    db_path.write_text(db_new, encoding="utf-8", newline="")
    parser_path.write_text(parser_new, encoding="utf-8", newline="")

    manifest = verify_post_state(root)
    manifest["changed_files"] = [
        str(path)
        for path, changed in ((db_path, db_changed), (parser_path, parser_changed))
        if changed
    ]
    manifest_path = root / ".bseed-metering-overlay.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true")
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    root = args.source.resolve()
    if args.apply:
        manifest = apply_overlay(root)
    else:
        verify_checkout(root, allow_dirty=True)
        manifest = verify_post_state(root)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
