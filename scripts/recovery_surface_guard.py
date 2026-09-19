#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

PINNED_UPSTREAM = "bf1059ee4c029e320a97fbfa6b07bd6ce4aa1702"

# Ordinary PM work must not touch these. If one ever truly needs a change,
# that work moves to a separate HIGH-RISK RECOVERY-INFRA issue and does not
# share a candidate with PM feature work.
PROTECTED_EXACT = {
    "device_db.yaml",
    "NVM_MIGRATIONS_VERSION",
    "src/telink/main.c",
    "src/telink/hal/zigbee_ota.c",
    "src/telink/hal/nvm.c",
    "src/telink/hal/zigbee.c",
    "src/telink/hal/zigbee_network.c",
    "src/device_config/config_nv.c",
    "src/device_config/config_parser.c",
    "src/device_config/nvm_items.h",
    "src/device_config/nvm_migrations.c",
    "src/device_config/reset.c",
}

PROTECTED_PREFIXES = (
    "src/telink/ota_reformating/",
)


def run_git(repo: Path, *args: str) -> str:
    p = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        capture_output=True,
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip() or "git failed")
    return p.stdout.strip()


def is_protected(path: str) -> bool:
    return path in PROTECTED_EXACT or any(path.startswith(p) for p in PROTECTED_PREFIXES)


def evaluate(repo: Path, baseline: str, head: str) -> dict:
    repo = repo.resolve()
    errors: list[str] = []
    warnings: list[str] = []

    if not (repo / ".git").exists():
        # Worktrees commonly have .git as a file.
        if not (repo / ".git").is_file():
            return {"status": "FAIL", "errors": [f"not a git checkout: {repo}"], "warnings": []}

    resolved_base = run_git(repo, "rev-parse", baseline)
    resolved_head = run_git(repo, "rev-parse", head)
    if len(resolved_base) != 40 or len(resolved_head) != 40:
        errors.append("baseline/head did not resolve to full commits")

    status = run_git(repo, "status", "--porcelain")
    if status:
        errors.append("firmware source checkout is not clean; candidate source must be an immutable commit")

    changed_raw = run_git(repo, "diff", "--name-only", f"{resolved_base}..{resolved_head}")
    changed = sorted(x for x in changed_raw.splitlines() if x)
    protected_changed = [x for x in changed if is_protected(x)]
    if protected_changed:
        errors.append("recovery-critical source changed: " + ", ".join(protected_changed))

    # Deletions/renames can be especially easy to miss in name-only output.
    status_raw = run_git(repo, "diff", "--name-status", f"{resolved_base}..{resolved_head}")
    destructive = []
    for line in status_raw.splitlines():
        cols = line.split("\t")
        if not cols:
            continue
        code = cols[0]
        paths = cols[1:]
        if code.startswith("D") or code.startswith("R"):
            if any(is_protected(p) for p in paths):
                destructive.append(line)
    if destructive:
        errors.append("protected deletion/rename detected: " + " | ".join(destructive))

    return {
        "schema_version": 1,
        "kind": "recovery_surface_guard",
        "status": "PASS" if not errors else "FAIL",
        "baseline": resolved_base,
        "head": resolved_head,
        "changed_files": changed,
        "protected_changed": protected_changed,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Reject ordinary PM candidates that touch recovery-critical upstream source.")
    ap.add_argument("--repo", type=Path, required=False)
    ap.add_argument("--baseline", default=PINNED_UPSTREAM)
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        assert is_protected("src/telink/main.c")
        assert is_protected("src/telink/ota_reformating/ensure_ota_scheme.c")
        assert is_protected("device_db.yaml")
        assert not is_protected("src/base_components/power_meter.c")
        print("SELF_TEST=PASS")
        return 0

    if args.repo is None:
        ap.error("--repo is required unless --self-test is used")

    try:
        result = evaluate(args.repo, args.baseline, args.head)
    except (RuntimeError, OSError) as exc:
        print(f"RECOVERY_SURFACE_GUARD=FAIL\nERROR: {exc}", file=sys.stderr)
        return 2

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
