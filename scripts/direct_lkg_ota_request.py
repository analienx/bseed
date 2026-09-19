#!/usr/bin/env python3
"""Build the one-device direct-firmware OTA request; dry-run is the default."""
from __future__ import annotations

import argparse
import json
import re
import sys
from urllib.parse import urlparse

DEVICE = "LivingRoomSocketWifiLeft"
CONFIG = "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;"
SHA256 = "ee5c6a6f758d3847442556db368d5589386c1b0b26ebf61e07670504d3a9766b"
SHA512 = "61f3c6e1ebb257115f49b3854f8ae24e62ed95ca51bd6503dd79e293ec1faf2ed98d1ff607c8252bd14955d4f7674aced223b3ac7ef9db22ac37e51c87676c48"
URL = (
    "https://raw.githubusercontent.com/romasku/tuya-zigbee-switch/"
    "a3c9c2a52ee8c2526cd029cdf7e0ed9eb0b5dc7c/bin/router/"
    "OUTLET_BSEED_PM_TS011F/tlc_switch-1.1.2-2289bf4d-forced.zigbee"
)
TOPIC = "zigbee2mqtt/bridge/request/device/ota_update/update"


def build_request(*, target: str, url: str, sha256: str, sha512: str,
                  manufacturer: str, model: str, role: str, config: str,
                  relay: str, load_disconnected: bool, authorization: str,
                  global_override: str) -> dict:
    errors: list[str] = []
    if target != DEVICE:
        errors.append("target must be the approved canary")
    if url != URL:
        errors.append("url must be the immutable approved direct firmware URL")
    parsed = urlparse(url)
    if parsed.scheme != "https" or "/main/" in parsed.path or parsed.path.endswith(".json"):
        errors.append("url must be immutable direct HTTPS firmware, never a moving ref or index")
    if sha256.lower() != SHA256 or sha512.lower() != SHA512:
        errors.append("artifact hashes do not match the approved LKG")
    if (manufacturer, model, role, config) != ("b28wrpvx", "TS011F-BS-PM", "Router", CONFIG):
        errors.append("runtime identity/config does not match the approved canary")
    if relay.lower() != "off":
        errors.append("relay must be positively OFF")
    if not load_disconnected:
        errors.append("load_disconnected confirmation is required")
    if not re.fullmatch(r"(?:https://github\.com/analienx/bseed/issues/1#)?issuecomment-\d+", authorization):
        errors.append("authorization must be the exact control-comment URL or issuecomment ID")
    if errors:
        raise ValueError("; ".join(errors))
    return {
        "kind": "direct_lkg_ota_request",
        "status": "DRY_RUN_PASS",
        "authorization_comment": authorization,
        "target": target,
        "topic": TOPIC,
        "payload": {"id": target, "url": url},
        "approved_sha256": SHA256,
        "approved_sha512": SHA512,
        "global_override_observed": global_override,
        "fallback_to_global_override": False,
        "runtime": {"manufacturer": manufacturer, "model": model, "role": role, "device_config": config, "relay": relay.lower()},
        "load_disconnected": load_disconnected,
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Validate and emit a direct-firmware LKG OTA request.")
    p.add_argument("--target", default=DEVICE)
    p.add_argument("--url", default=URL)
    p.add_argument("--sha256", default=SHA256)
    p.add_argument("--sha512", default=SHA512)
    p.add_argument("--manufacturer", default="b28wrpvx")
    p.add_argument("--model", default="TS011F-BS-PM")
    p.add_argument("--role", default="Router")
    p.add_argument("--device-config", default=CONFIG)
    p.add_argument("--relay", default="off")
    p.add_argument("--load-disconnected", action="store_true")
    p.add_argument("--authorization", required=True)
    p.add_argument("--global-override", default="")
    args = p.parse_args()
    try:
        result = build_request(target=args.target, url=args.url, sha256=args.sha256, sha512=args.sha512,
                               manufacturer=args.manufacturer, model=args.model, role=args.role,
                               config=args.device_config, relay=args.relay,
                               load_disconnected=args.load_disconnected,
                               authorization=args.authorization, global_override=args.global_override)
    except ValueError as exc:
        print(f"DIRECT_LKG_OTA_REQUEST=FAIL\nERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
