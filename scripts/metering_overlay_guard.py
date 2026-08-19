#!/usr/bin/env python3
"""Prove that a metering worktree is exactly PINNED_SOURCE + our reviewed overlay.

Unlike the legacy recovery_surface_guard, this guard intentionally permits the
two files that the canary must change (`device_db.yaml` and
`src/device_config/config_parser.c`). It does not merely allow-list their names:
it regenerates the expected contents from the pinned Git blobs using
apply-metering-overlay.py and requires byte-for-byte equality.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

SCRIPT = Path(__file__).with_name("apply-metering-overlay.py")
spec = importlib.util.spec_from_file_location("bseed_metering_overlay", SCRIPT)
overlay = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(overlay)

EXPECTED_CHANGED = {
    "device_db.yaml",
    "src/device_config/config_parser.c",
}


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
    return proc.stdout


def _base_text(root: Path, path: str) -> str:
    return _git(root, "show", f"{overlay.PINNED_SOURCE_COMMIT}:{path}")


def evaluate(root: Path) -> dict[str, Any]:
    root = root.resolve()
    errors: list[str] = []
    warnings: list[str] = []

    if not (root / ".git").exists():
        return {
            "schema_version": 1,
            "kind": "metering_overlay_guard",
            "status": "FAIL",
            "errors": [f"not a git checkout: {root}"],
            "warnings": [],
        }

    head = _git(root, "rev-parse", "HEAD").strip()
    if head != overlay.PINNED_SOURCE_COMMIT:
        errors.append(
            f"source HEAD mismatch: expected {overlay.PINNED_SOURCE_COMMIT}, got {head}"
        )

    changed = {
        p for p in _git(root, "diff", "--name-only", "HEAD").splitlines() if p
    }
    if changed != EXPECTED_CHANGED:
        errors.append(
            "tracked overlay changes must be exactly "
            f"{sorted(EXPECTED_CHANGED)}, got {sorted(changed)}"
        )

    expected: dict[str, str] = {}
    try:
        base_db = _base_text(root, "device_db.yaml")
        base_parser = _base_text(root, "src/device_config/config_parser.c")
        expected["device_db.yaml"] = overlay.overlay_device_db(base_db)[0]
        expected["src/device_config/config_parser.c"] = (
            overlay.overlay_config_parser(base_parser)[0]
        )
    except (RuntimeError, OSError) as exc:
        errors.append(f"could not regenerate expected overlay: {exc}")

    for path, expected_text in expected.items():
        actual = (root / path).read_text(encoding="utf-8")
        if actual != expected_text:
            errors.append(f"{path} is not byte-for-byte the reviewed overlay")

    try:
        post = overlay.verify_post_state(root)
    except (RuntimeError, OSError) as exc:
        errors.append(f"overlay semantic verification failed: {exc}")
        post = None

    # Ignore untracked/ignored SDK/toolchain material, but surface unexpected
    # tracked staging because a build from staged-but-different data is hard to
    # reason about.
    staged = {
        p for p in _git(root, "diff", "--cached", "--name-only").splitlines() if p
    }
    if staged:
        errors.append(f"overlay worktree must not contain staged changes: {sorted(staged)}")

    return {
        "schema_version": 1,
        "kind": "metering_overlay_guard",
        "status": "PASS" if not errors else "FAIL",
        "baseline": overlay.PINNED_SOURCE_COMMIT,
        "changed_files": sorted(changed),
        "exact_overlay_match": not errors,
        "overlay": post,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Verify exact pinned downstream + BSEED metering overlay source."
    )
    ap.add_argument("--source", type=Path)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        assert overlay.PINNED_SOURCE_COMMIT == "8b8cc4924a353b35880666f7b48f0afbee89eb17"
        assert overlay.CANDIDATE_CONFIG == "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;"
        assert EXPECTED_CHANGED == {
            "device_db.yaml",
            "src/device_config/config_parser.c",
        }
        print("SELF_TEST=PASS")
        return 0

    if args.source is None:
        ap.error("--source is required unless --self-test is used")

    try:
        result = evaluate(args.source)
    except (RuntimeError, OSError) as exc:
        print(f"METERING_OVERLAY_GUARD=FAIL\nERROR: {exc}", file=sys.stderr)
        return 2

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
