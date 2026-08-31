#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

EXPECTED_HEADERS = {
    'hardware_mapping.csv': ['device_id','pcb_front_marking','pcb_rear_marking','signal','bl0937_pin','ztu_physical_pin','telink_gpio','resistance_ohms','intermediate_components','evidence_photo','status','notes'],
    'diagnostic_tests.csv': ['test_id','device_id','firmware_commit','condition','duration_s','reference_voltage_v','reference_current_a','reference_active_power_w','reference_pf','cf_count_start','cf_count_end','cf_frequency_hz','cf1_sel0_count_start','cf1_sel0_count_end','cf1_sel0_frequency_hz','cf1_sel1_count_start','cf1_sel1_count_end','cf1_sel1_frequency_hz','status','notes'],
    'calibration.csv': ['point_id','device_id','load_description','reference_voltage_v','reference_current_a','reference_active_power_w','reference_pf','cf_frequency_hz','cf1_current_frequency_hz','cf1_voltage_frequency_hz','power_coefficient_w_per_hz','current_coefficient_a_per_hz','voltage_coefficient_v_per_hz','include_in_fit','notes'],
    'energy_test.csv': ['test_id','device_id','firmware_commit','test_type','start_timestamp','end_timestamp','reference_start_wh','reference_end_wh','firmware_start_wh','firmware_end_wh','error_percent','status','notes'],
}

SENSITIVE = {
    'email': re.compile(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', re.I),
    'mac': re.compile(r'\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b', re.I),
    'zigbee_ieee': re.compile(r'\b0x[0-9A-F]{16}\b', re.I),
    'secret_assignment': re.compile(r'(?i)\b(password|passwd|token|secret|api[_-]?key|private[_-]?key)\s*[:=]\s*[^\s<][^\r\n]*'),
}

TEXT_SUFFIXES = {'.md','.txt','.log','.csv','.json','.yaml','.yml','.ps1','.py'}


def check_csv(path: Path) -> list[str]:
    errors: list[str] = []
    expected = EXPECTED_HEADERS.get(path.name)
    if not expected:
        return errors
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f)
        try:
            actual = next(reader)
        except StopIteration:
            return [f'{path}: empty CSV']
    if actual != expected:
        errors.append(f'{path}: header mismatch\n expected={expected}\n actual={actual}')
    return errors


def scan_text(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding='utf-8-sig')
    except UnicodeDecodeError:
        return [f'{path}: not valid UTF-8 text; do not commit unsanitized/binary evidence here']
    errors: list[str] = []
    for label, rx in SENSITIVE.items():
        if rx.search(text):
            errors.append(f'{path}: possible sensitive value matched rule {label}')
    return errors


def validate(root: Path) -> list[str]:
    if not root.exists():
        return []
    errors: list[str] = []
    for p in root.rglob('*'):
        if not p.is_file():
            continue
        if p.suffix.lower() not in TEXT_SUFFIXES:
            errors.append(f'{p}: binary/non-text evidence is not allowed in runs/ without supervisor review')
            continue
        errors.extend(scan_text(p))
        errors.extend(check_csv(p))
    return errors


def self_test() -> int:
    safe = 'DEVICE_ID=DEV-001\nTELINK_GPIO=PB6\n'
    unsafe = 'ieee=0x00124b0012345678\n'
    assert not any(rx.search(safe) for rx in SENSITIVE.values())
    assert SENSITIVE['zigbee_ieee'].search(unsafe)
    print('SELF_TEST=PASS')
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('root', nargs='?', default='runs')
    ap.add_argument('--self-test', action='store_true')
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    errors = validate(Path(args.root))
    if errors:
        print('VALIDATION=FAIL')
        for e in errors:
            print(f'ERROR: {e}')
        return 2
    print('VALIDATION=PASS')
    return 0

if __name__ == '__main__':
    sys.exit(main())
