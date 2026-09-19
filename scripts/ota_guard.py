#!/usr/bin/env python3
from __future__ import annotations
import argparse, binascii, hashlib, json, struct, sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

OTA_MAGIC = 0x0BEEF11E
BASE_FMT = '<IHHHHHIH32sI'
BASE_SIZE = struct.calcsize(BASE_FMT)
FIELD_SECURITY_CREDENTIAL = 0x0001
FIELD_UPGRADE_DESTINATION = 0x0002
FIELD_HARDWARE_VERSIONS = 0x0004
SUBELEMENT_FMT = '<HI'
SUBELEMENT_SIZE = struct.calcsize(SUBELEMENT_FMT)
TELINK_OTA_MAGIC = b'\x5d\x02'
TELINK_MAGIC_OFFSET = 6
TELINK_STARTUP_FLAG_OFFSET = 8
TELINK_FIRMWARE_SIZE_OFFSET = 0x18
TELINK_MIN_PAYLOAD_SIZE = 0x1C + 4
TELINK_MAX_FIRMWARE_SIZE = 0x40000
FORCED_FILE_VERSION = 0xFFFFFFFF

class OtaError(ValueError):
    pass

@dataclass(frozen=True)
class OtaHeader:
    path: str
    sha256: str
    file_size: int
    magic: int
    header_version: int
    header_length: int
    field_control: int
    manufacturer_code: int
    image_type: int
    file_version: int
    zigbee_stack_version: int
    header_string: str
    total_image_size: int
    security_credential_version: int | None = None
    upgrade_file_destination: str | None = None
    minimum_hardware_version: int | None = None
    maximum_hardware_version: int | None = None

@dataclass(frozen=True)
class TelinkPayload:
    subelement_id: int
    subelement_length: int
    payload_size: int
    inner_file_version: int
    telink_magic_hex: str
    startup_flag: int
    declared_firmware_size: int
    stored_crc32: int
    computed_crc32: int
    crc_valid: bool
    required_ascii: str | None = None
    required_ascii_occurrences: int | None = None

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def _parse_outer(path: Path, data: bytes) -> OtaHeader:
    if len(data) < BASE_SIZE:
        raise OtaError(f'file too small for Zigbee OTA header: {len(data)} bytes')
    vals = struct.unpack_from(BASE_FMT, data, 0)
    (magic, header_version, header_length, field_control, manufacturer_code,
     image_type, file_version, stack_version, raw_string, total_size) = vals
    if magic != OTA_MAGIC:
        raise OtaError(f'bad OTA magic 0x{magic:08X}; expected 0x{OTA_MAGIC:08X}')
    if header_length < BASE_SIZE:
        raise OtaError(f'header_length {header_length} < base header {BASE_SIZE}')
    if header_length > len(data):
        raise OtaError('header_length exceeds file size')
    if total_size != len(data):
        raise OtaError(f'total_image_size {total_size} != actual file size {len(data)}')
    unknown = field_control & ~(FIELD_SECURITY_CREDENTIAL | FIELD_UPGRADE_DESTINATION | FIELD_HARDWARE_VERSIONS)
    if unknown:
        raise OtaError(f'unknown field_control bits 0x{unknown:04X}')
    pos = BASE_SIZE
    security = destination = min_hw = max_hw = None
    if field_control & FIELD_SECURITY_CREDENTIAL:
        if pos + 1 > header_length:
            raise OtaError('truncated security credential field')
        security = data[pos]
        pos += 1
    if field_control & FIELD_UPGRADE_DESTINATION:
        if pos + 8 > header_length:
            raise OtaError('truncated upgrade destination field')
        destination = '0x' + data[pos:pos + 8][::-1].hex()
        pos += 8
    if field_control & FIELD_HARDWARE_VERSIONS:
        if pos + 4 > header_length:
            raise OtaError('truncated hardware version fields')
        min_hw, max_hw = struct.unpack_from('<HH', data, pos)
        pos += 4
    if pos != header_length:
        raise OtaError(f'parsed header length {pos} != declared {header_length}')
    return OtaHeader(
        str(path.resolve()), sha256_file(path), len(data), magic, header_version,
        header_length, field_control, manufacturer_code, image_type, file_version,
        stack_version, raw_string.split(b'\0', 1)[0].decode('utf-8', 'replace').rstrip(),
        total_size, security, destination, min_hw, max_hw,
    )

def _parse_telink(data: bytes, header: OtaHeader, required_ascii: str | None = None) -> TelinkPayload:
    pos = header.header_length
    if len(data) < pos + SUBELEMENT_SIZE:
        raise OtaError('OTA image missing sub-element header')
    sub_id, sub_len = struct.unpack_from(SUBELEMENT_FMT, data, pos)
    if sub_id != 0:
        raise OtaError(f'unsupported OTA sub-element id {sub_id}; expected 0')
    payload = data[pos + SUBELEMENT_SIZE:]
    if sub_len != len(payload):
        raise OtaError(f'sub-element length {sub_len} != actual payload length {len(payload)}')
    if len(payload) < TELINK_MIN_PAYLOAD_SIZE:
        raise OtaError(f'Telink payload too small: {len(payload)} bytes')
    if len(payload) > TELINK_MAX_FIRMWARE_SIZE:
        raise OtaError(f'Telink payload {len(payload)} exceeds 0x{TELINK_MAX_FIRMWARE_SIZE:X} OTA slot')
    telink_magic = payload[TELINK_MAGIC_OFFSET:TELINK_MAGIC_OFFSET + 2]
    if telink_magic != TELINK_OTA_MAGIC:
        raise OtaError(f'bad Telink OTA magic {telink_magic.hex()}; expected {TELINK_OTA_MAGIC.hex()}')
    inner_version = int.from_bytes(payload[2:6], 'little')
    startup_flag = int.from_bytes(payload[TELINK_STARTUP_FLAG_OFFSET:TELINK_STARTUP_FLAG_OFFSET + 4], 'little')
    declared_size = int.from_bytes(payload[TELINK_FIRMWARE_SIZE_OFFSET:TELINK_FIRMWARE_SIZE_OFFSET + 4], 'little')
    if declared_size != len(payload):
        raise OtaError(f'Telink declared firmware size {declared_size} != payload length {len(payload)}')
    stored_crc = int.from_bytes(payload[-4:], 'little')
    computed_crc = (binascii.crc32(payload[:-4]) ^ 0xFFFFFFFF) & 0xFFFFFFFF
    if stored_crc != computed_crc:
        raise OtaError(f'Telink CRC mismatch: stored=0x{stored_crc:08X} computed=0x{computed_crc:08X}')
    if header.file_version not in (inner_version, FORCED_FILE_VERSION):
        raise OtaError(
            f'outer file_version 0x{header.file_version:08X} is neither inner version '
            f'0x{inner_version:08X} nor forced 0xFFFFFFFF'
        )
    occurrences = None
    if required_ascii is not None:
        needle = required_ascii.encode('utf-8')
        occurrences = payload.count(needle)
        if occurrences != 1:
            raise OtaError(f'required ASCII config occurs {occurrences} times; expected exactly 1: {required_ascii!r}')
    return TelinkPayload(
        sub_id, sub_len, len(payload), inner_version, telink_magic.hex(), startup_flag,
        declared_size, stored_crc, computed_crc, True, required_ascii, occurrences,
    )

def parse_image(path: Path, required_ascii: str | None = None) -> tuple[OtaHeader, TelinkPayload]:
    path = path.resolve()
    data = path.read_bytes()
    header = _parse_outer(path, data)
    telink = _parse_telink(data, header, required_ascii)
    return header, telink

def parse_ota(path: Path) -> OtaHeader:
    return parse_image(path)[0]

def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding='utf-8'))

def save_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True) + '\n', encoding='utf-8')

def inspect_image(path: Path, required_ascii: str | None = None) -> dict[str, Any]:
    header, telink = parse_image(path, required_ascii)
    return {'header': asdict(header), 'telink': asdict(telink)}

def baseline_manifest(image: Path, label: str, required_ascii: str | None = None) -> dict[str, Any]:
    inspected = inspect_image(image, required_ascii)
    return {'schema_version': 2, 'kind': 'ota_baseline', 'label': label, **inspected}

def verify_candidate(
    candidate: Path,
    baseline: dict[str, Any],
    expected_manufacturer: int | None = None,
    expected_image_type: int | None = None,
    required_ascii: str | None = None,
) -> dict[str, Any]:
    c_header, c_telink = parse_image(candidate, required_ascii)
    if 'header' not in baseline or 'telink' not in baseline:
        raise OtaError('baseline manifest must contain header and telink sections; regenerate with current ota_guard')
    b_header = baseline['header']
    b_telink = baseline['telink']
    errors: list[str] = []
    warnings: list[str] = []

    for field in (
        'header_version', 'field_control', 'manufacturer_code', 'image_type',
        'zigbee_stack_version', 'security_credential_version',
        'upgrade_file_destination', 'minimum_hardware_version', 'maximum_hardware_version',
    ):
        cv = getattr(c_header, field)
        bv = b_header.get(field)
        if cv != bv:
            errors.append(f'{field} changed: baseline={bv!r} candidate={cv!r}')

    if expected_manufacturer is not None and c_header.manufacturer_code != expected_manufacturer:
        errors.append(f'manufacturer_code {c_header.manufacturer_code} != expected {expected_manufacturer}')
    if expected_image_type is not None and c_header.image_type != expected_image_type:
        errors.append(f'image_type {c_header.image_type} != expected {expected_image_type}')

    if c_telink.subelement_id != b_telink.get('subelement_id'):
        errors.append('Telink sub-element ID changed')
    if c_telink.startup_flag != b_telink.get('startup_flag'):
        errors.append(
            f'Telink startup flag changed: baseline={b_telink.get("startup_flag")!r} '
            f'candidate={c_telink.startup_flag!r}'
        )
    if c_telink.telink_magic_hex != b_telink.get('telink_magic_hex'):
        errors.append('Telink inner magic changed')

    baseline_inner = int(b_telink.get('inner_file_version', 0))
    if c_telink.inner_file_version == baseline_inner:
        warnings.append('inner firmware version is unchanged; candidate should normally be installed with a proven forced/reinstall path')
    elif c_telink.inner_file_version < baseline_inner:
        warnings.append('candidate inner firmware version is lower than baseline; downgrade acceptance must be empirically proven')

    if c_header.header_string != b_header.get('header_string'):
        warnings.append('OTA header_string changed')
    if c_header.file_version == FORCED_FILE_VERSION:
        warnings.append('candidate uses forced outer file version 0xFFFFFFFF; use only on the isolated canary index')

    return {
        'schema_version': 2,
        'kind': 'ota_candidate_verification',
        'status': 'PASS' if not errors else 'FAIL',
        'candidate': {'header': asdict(c_header), 'telink': asdict(c_telink)},
        'baseline_label': baseline.get('label'),
        'errors': errors,
        'warnings': warnings,
    }

def main() -> int:
    ap = argparse.ArgumentParser(description='Inspect and hard-gate Zigbee/Telink OTA artifacts.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('inspect')
    p.add_argument('image', type=Path)
    p.add_argument('--required-ascii')
    p.add_argument('--json-out', type=Path)
    p = sub.add_parser('make-baseline')
    p.add_argument('image', type=Path)
    p.add_argument('--label', required=True)
    p.add_argument('--required-ascii')
    p.add_argument('--out', required=True, type=Path)
    p = sub.add_parser('verify-candidate')
    p.add_argument('image', type=Path)
    p.add_argument('--baseline', required=True, type=Path)
    p.add_argument('--expected-manufacturer', type=lambda x: int(x, 0))
    p.add_argument('--expected-image-type', type=lambda x: int(x, 0))
    p.add_argument('--required-ascii')
    p.add_argument('--json-out', type=Path)
    sub.add_parser('self-test')
    args = ap.parse_args()
    try:
        if args.cmd == 'self-test':
            assert BASE_SIZE == 56
            assert OTA_MAGIC == 0x0BEEF11E
            assert SUBELEMENT_SIZE == 6
            assert TELINK_MAX_FIRMWARE_SIZE == 0x40000
            print('SELF_TEST=PASS')
            return 0
        if args.cmd == 'inspect':
            result = inspect_image(args.image, args.required_ascii)
        elif args.cmd == 'make-baseline':
            result = baseline_manifest(args.image, args.label, args.required_ascii)
            save_json(args.out, result)
            print(f'BASELINE={args.out}')
            return 0
        else:
            result = verify_candidate(
                args.image, load_json(args.baseline), args.expected_manufacturer,
                args.expected_image_type, args.required_ascii,
            )
        if getattr(args, 'json_out', None):
            save_json(args.json_out, result)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0 if result.get('status', 'PASS') == 'PASS' else 2
    except (OtaError, OSError, json.JSONDecodeError) as e:
        print(f'OTA_GUARD=FAIL\nERROR: {e}', file=sys.stderr)
        return 2

if __name__ == '__main__':
    raise SystemExit(main())
