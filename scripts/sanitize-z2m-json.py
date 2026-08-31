#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

SENSITIVE_KEY_PARTS = (
    'ieee', 'network_address', 'networkaddress', 'mac', 'email',
    'password', 'passwd', 'token', 'secret', 'api_key', 'apikey',
    'private_key', 'privatekey', 'credential'
)
IEEE_RE = re.compile(r'\b0x[0-9a-f]{16}\b', re.I)
MAC_RE = re.compile(r'\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b', re.I)
EMAIL_RE = re.compile(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', re.I)


def sensitive_key(key: str) -> bool:
    k = key.lower().replace('-', '_')
    return any(part in k for part in SENSITIVE_KEY_PARTS)


def scrub_string(value: str) -> str:
    value = IEEE_RE.sub('<REDACTED_IEEE>', value)
    value = MAC_RE.sub('<REDACTED_MAC>', value)
    value = EMAIL_RE.sub('<REDACTED_EMAIL>', value)
    return value


def scrub(value: Any) -> Any:
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if sensitive_key(str(k)):
                out[k] = '<REDACTED>'
            else:
                out[k] = scrub(v)
        return out
    if isinstance(value, list):
        return [scrub(v) for v in value]
    if isinstance(value, str):
        return scrub_string(value)
    return value


def main() -> int:
    ap = argparse.ArgumentParser(description='Sanitize a Zigbee2MQTT/device JSON export before committing evidence.')
    ap.add_argument('input', type=Path)
    ap.add_argument('output', type=Path)
    args = ap.parse_args()

    if args.input.resolve() == args.output.resolve():
        raise SystemExit('Refusing to overwrite the raw input file.')

    raw = json.loads(args.input.read_text(encoding='utf-8-sig'))
    clean = scrub(raw)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(clean, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(f'SANITIZED={args.output}')
    print('Run scripts/validate-evidence.py before committing the sanitized output.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
