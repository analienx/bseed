#!/usr/bin/env python3
"""Apply/verify the minimal BSEED metering overlay to the pinned downstream source.

The downstream fork already contains hardware-tested power metering for
_TZ3000_b28wrpvx.  The project canary deliberately keeps the *existing* BSEED
runtime config byte-for-byte:

    b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;

That is important because converted devices persist device_config in NVM; merely
changing the compiled default would not reliably activate metering after OTA and
would tempt us to write/reset NVM.  Instead this overlay adds an identity-scoped
fallback in config_parser.c: when the exact b28wrpvx / TS011F-BS-PM identity is
parsed without an explicit EP/EB meter token, firmware initializes the already
proven pulse backend on CF=PA1, CF1=PC2, SEL=PB1.

The default overlay suppresses downstream overload relay actuation for this
BSEED identity.  A separately gated protection descendant can opt into that
already-reviewed coupling with ``--enable-overload-relay``; no other overlay
surface changes.  Existing control GPIOs, NVM device_config, OTA identity and
normal relay/button/LED semantics remain unchanged.

The overlay is deliberately narrow and source-guarded.  It refuses an unexpected
source revision, an already-dirty checkout on apply, or a partial overlay.
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
CANDIDATE_CONFIG = "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;"


def _config_has_pwm_led_flag(config: str) -> bool:
    return any(token.endswith("p") for token in config.split(";") if token)

GLOBAL_NEEDLE = (
    "static uint8_t            energy_monitoring_enabled  = 0;\n"
    "static uint8_t            energy_monitoring_endpoint = 1;"
)
GLOBAL_REPLACEMENT = GLOBAL_NEEDLE + (
    "\n// The project BSEED canary measures power but must not gain a new relay-\n"
    "// actuation policy. Explicit meter configs on other devices retain the\n"
    "// downstream overload behavior.\n"
    "static uint8_t            energy_monitoring_protect_relay = 1;"
)

PARSE_START_NEEDLE = "void parse_config() {\n    device_config_read_from_nv();"
PARSE_START_REPLACEMENT = (
    "void parse_config() {\n"
    "    // parse_config can be invoked again after a runtime config update.\n"
    "    // Never leak the b28wrpvx canary's relay-protection policy into a\n"
    "    // subsequently parsed identity. The exact BSEED match below opts out\n"
    "    // again after the fresh config has been parsed.\n"
    "    energy_monitoring_protect_relay = 1;\n"
    "    device_config_read_from_nv();"
)

POST_PARSE_NEEDLE = """        }
    }

    peripherals_init();
"""
POST_PARSE_REPLACEMENT = """        }
    }

    // Project canary compatibility path for the exact hardware-verified BSEED
    // PM identity. Converted devices keep device_config in NVM, so an existing
    // socket can legitimately boot this firmware with the original config that
    // has no EP token. Do not mutate/reset that NVM merely to enable metering.
    // Instead initialise the proven BL0937-compatible pulse backend here.
    if (strcmp(zb_manufacturer, "b28wrpvx") == 0 &&
        strcmp(zb_model, "TS011F-BS-PM") == 0) {
        energy_monitoring_protect_relay = 0;

        if (!energy_monitoring_enabled) {
            hal_gpio_pin_t cf_pin  = hal_gpio_parse_pin("A1");
            hal_gpio_pin_t cf1_pin = hal_gpio_parse_pin("C2");
            hal_gpio_pin_t sel_pin = hal_gpio_parse_pin("B1");

            if (hlw8012_init(&hlw8012_device, cf_pin, cf1_pin, sel_pin) == 0) {
                // b28wrpvx hardware validation established the default SEL
                // polarity; calibration is seeded from this board's compiled
                // hlw8012_* multipliers in device_db.yaml.
                hlw8012_set_sel_inverted(&hlw8012_device, 0);
                energy_meter = hlw8012_as_energy_meter(&hlw8012_device);
                electrical_measurement_cluster_init(&elec_meas_cluster,
                                                    energy_meter);
                metering_cluster_init(&metering_cluster_inst, energy_meter);
                energy_monitoring_enabled  = 1;
                energy_monitoring_endpoint = 1;
                printf("Config: implicit b28wrpvx BL0937 metering "
                       "CF=%04x CF1=%04x SEL=%04x\\r\\n",
                       cf_pin, cf1_pin, sel_pin);
            }
        }
    }

    peripherals_init();
"""

PROTECTED_RELAY_NEEDLE = (
    "    if (energy_monitoring_enabled && relay_clusters_cnt > 0) {"
)
PROTECTED_RELAY_REPLACEMENT = (
    "    if (energy_monitoring_enabled && energy_monitoring_protect_relay &&\n"
    "        relay_clusters_cnt > 0) {"
)

CALIBRATION_MARKERS = (
    "hlw8012_voltage_multiplier: 161460",
    "hlw8012_current_multiplier: 144679",
    "hlw8012_power_multiplier: 16989",
)

HLW8012_HEADER_NO_LOAD_NEEDLE = "    uint32_t energy_acc; // energy sub-unit remainder (pulses*MULT, < 1 Wh)\n"
HLW8012_HEADER_NO_LOAD_REPLACEMENT = HLW8012_HEADER_NO_LOAD_NEEDLE + (
    "    // Consecutive low samples prevent the calibrated no-load pulse floor from\n"
    "    // becoming phantom power/energy or an overload input.\n"
    "    uint8_t  no_load_samples;\n"
    "    uint8_t  no_load_suppressed;\n"
)

HLW8012_NO_LOAD_DEFINES_NEEDLE = "#define HLW8012_MAX_SANE_PULSES              30000\n"
HLW8012_NO_LOAD_DEFINES_REPLACEMENT = HLW8012_NO_LOAD_DEFINES_NEEDLE + (
    "// Exact-canary calibrated no-load envelope: observed residual was 1 W / 37 mA.\n"
    "#define HLW8012_NO_LOAD_POWER_W             2\n"
    "#define HLW8012_NO_LOAD_CURRENT_MA          50\n"
    "#define HLW8012_NO_LOAD_CONFIRM_SAMPLES     3\n"
)

HLW8012_POWER_NEEDLE = """    dev->data.power = (int16_t)(((uint32_t)cf_pulses * dev->cal.power_multiplier +
                                 HLW8012_FIXED_POINT_SCALE / 2) /
                                HLW8012_FIXED_POINT_SCALE);

    // Energy: accumulate pulses*MULT sub-units and carry whole Wh out by
"""
HLW8012_POWER_REPLACEMENT = """    dev->data.power = (int16_t)(((uint32_t)cf_pulses * dev->cal.power_multiplier +
                                 HLW8012_FIXED_POINT_SCALE / 2) /
                                HLW8012_FIXED_POINT_SCALE);

    // Energy: accumulate pulses*MULT sub-units and carry whole Wh out by
"""

HLW8012_ENERGY_NEEDLE = """    dev->data.energy_acc += (uint32_t)cf_pulses * dev->cal.power_multiplier;
    while (dev->data.energy_acc >= HLW8012_ENERGY_WH_SUBUNIT) {
        dev->data.energy_acc -= HLW8012_ENERGY_WH_SUBUNIT;
        dev->data.energy++;
    }
"""
HLW8012_ENERGY_REPLACEMENT = ""

HLW8012_POST_CF1_NEEDLE = """        }
    }

    dev->data.valid            = 1;
"""
HLW8012_POST_CF1_REPLACEMENT = """        }
    }

    // Suppress only a confirmed calibrated no-load floor. A real load exits on
    // its first sample; voltage and raw CF/CF1 diagnostics remain available.
    if (dev->data.power <= HLW8012_NO_LOAD_POWER_W &&
        dev->data.current <= HLW8012_NO_LOAD_CURRENT_MA) {
        if (dev->data.no_load_samples < HLW8012_NO_LOAD_CONFIRM_SAMPLES)
            dev->data.no_load_samples++;
        if (dev->data.no_load_samples == HLW8012_NO_LOAD_CONFIRM_SAMPLES) {
            dev->data.no_load_suppressed = 1;
            dev->data.current = 0;
            dev->data.power = 0;
        }
    } else {
        dev->data.no_load_samples = 0;
        dev->data.no_load_suppressed = 0;
    }

    if (!dev->data.no_load_suppressed) {
        dev->data.energy_acc += (uint32_t)cf_pulses * dev->cal.power_multiplier;
        while (dev->data.energy_acc >= HLW8012_ENERGY_WH_SUBUNIT) {
            dev->data.energy_acc -= HLW8012_ENERGY_WH_SUBUNIT;
            dev->data.energy++;
        }
    }

    dev->data.valid            = 1;
"""

HLW8012_INSTANT_POWER_NEEDLE = """    return (int32_t)((pulses_full * dev->cal.power_multiplier +
                      HLW8012_FIXED_POINT_SCALE / 2) /
                     HLW8012_FIXED_POINT_SCALE);
"""
HLW8012_INSTANT_POWER_REPLACEMENT = """    int32_t power = (int32_t)((pulses_full * dev->cal.power_multiplier +
                             HLW8012_FIXED_POINT_SCALE / 2) /
                            HLW8012_FIXED_POINT_SCALE);
    if (dev->data.no_load_suppressed && power <= HLW8012_NO_LOAD_POWER_W)
        return 0;
    return power;
"""


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one source match, found {count}")
    return text.replace(old, new, 1)


def overlay_device_db(text: str) -> Tuple[str, bool]:
    """Restore the project's established BSEED default config, preserving calibration."""
    if CANDIDATE_CONFIG in text:
        if ORIGINAL_CONFIG in text:
            raise RuntimeError("device_db contains both downstream and canary configs")
        for marker in CALIBRATION_MARKERS:
            if marker not in text:
                raise RuntimeError(f"device_db missing expected calibration marker: {marker}")
        return text, False

    if DEVICE_KEY not in text:
        raise RuntimeError(f"device_db missing target key {DEVICE_KEY}")
    if ORIGINAL_CONFIG not in text:
        raise RuntimeError("device_db target config does not match pinned downstream source")

    for marker in CALIBRATION_MARKERS:
        if marker not in text:
            raise RuntimeError(f"device_db missing expected calibration marker: {marker}")

    return _replace_once(text, ORIGINAL_CONFIG, CANDIDATE_CONFIG, "device config"), True


def overlay_config_parser(
    text: str, enable_overload_relay: bool = False
) -> Tuple[str, bool]:
    """Add the identity-scoped implicit meter and selected relay policy."""
    policy_line = f"energy_monitoring_protect_relay = {int(enable_overload_relay)};"
    post_markers = (
        "static uint8_t            energy_monitoring_protect_relay = 1;",
        "void parse_config() {\n    // parse_config can be invoked again after a runtime config update.",
        "    energy_monitoring_protect_relay = 1;\n    device_config_read_from_nv();",
        'strcmp(zb_manufacturer, "b28wrpvx") == 0',
        'hal_gpio_parse_pin("A1")',
        'hal_gpio_parse_pin("C2")',
        'hal_gpio_parse_pin("B1")',
        "energy_monitoring_enabled && energy_monitoring_protect_relay &&",
        policy_line,
    )
    if all(marker in text for marker in post_markers):
        return text, False
    if any(marker in text for marker in post_markers):
        raise RuntimeError("config_parser has a partial/inconsistent BSEED metering overlay")

    text = _replace_once(text, GLOBAL_NEEDLE, GLOBAL_REPLACEMENT, "meter policy global")
    text = _replace_once(text, PARSE_START_NEEDLE, PARSE_START_REPLACEMENT, "policy reset")
    post_replacement = POST_PARSE_REPLACEMENT.replace(
        "energy_monitoring_protect_relay = 0;", policy_line
    )
    text = _replace_once(text, POST_PARSE_NEEDLE, post_replacement, "implicit meter hook")
    text = _replace_once(
        text,
        PROTECTED_RELAY_NEEDLE,
        PROTECTED_RELAY_REPLACEMENT,
        "protected relay gate",
    )
    return text, True


def overlay_hlw8012_header(text: str) -> Tuple[str, bool]:
    """Add exact-canary no-load state without changing calibration storage."""
    markers = (
        "HLW8012_NO_LOAD_POWER_W",
        "no_load_samples;",
        "no_load_suppressed;",
    )
    if all(marker in text for marker in markers):
        return text, False
    if any(marker in text for marker in markers):
        raise RuntimeError("hlw8012.h has a partial/inconsistent no-load overlay")
    text = _replace_once(text, HLW8012_NO_LOAD_DEFINES_NEEDLE,
                         HLW8012_NO_LOAD_DEFINES_REPLACEMENT, "no-load constants")
    return _replace_once(text, HLW8012_HEADER_NO_LOAD_NEEDLE,
                         HLW8012_HEADER_NO_LOAD_REPLACEMENT, "no-load state"), True


def overlay_hlw8012_source(text: str) -> Tuple[str, bool]:
    """Suppress only the confirmed calibrated no-load pulse floor at its source."""
    markers = (
        "HLW8012_NO_LOAD_CONFIRM_SAMPLES",
        "dev->data.no_load_suppressed = 1;",
        "if (!dev->data.no_load_suppressed) {",
        "dev->data.no_load_suppressed && power <= HLW8012_NO_LOAD_POWER_W",
    )
    if all(marker in text for marker in markers):
        return text, False
    if any(marker in text for marker in markers):
        raise RuntimeError("hlw8012.c has a partial/inconsistent no-load overlay")
    text = _replace_once(text, HLW8012_POWER_NEEDLE,
                         HLW8012_POWER_REPLACEMENT, "no-load power filter")
    text = _replace_once(text, HLW8012_ENERGY_NEEDLE,
                         HLW8012_ENERGY_REPLACEMENT, "no-load energy filter")
    text = _replace_once(text, HLW8012_POST_CF1_NEEDLE,
                         HLW8012_POST_CF1_REPLACEMENT, "no-load confirmation")
    return _replace_once(text, HLW8012_INSTANT_POWER_NEEDLE,
                         HLW8012_INSTANT_POWER_REPLACEMENT,
                         "no-load overload filter"), True


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


def verify_post_state(root: Path, enable_overload_relay: bool = False) -> dict:
    db = (root / "device_db.yaml").read_text(encoding="utf-8")
    parser = (root / "src/device_config/config_parser.c").read_text(encoding="utf-8")
    hlw_header = (root / "src/base_components/energy_measurement/hlw8012.h").read_text(encoding="utf-8")
    hlw_source = (root / "src/base_components/energy_measurement/hlw8012.c").read_text(encoding="utf-8")

    if CANDIDATE_CONFIG not in db or ORIGINAL_CONFIG in db:
        raise RuntimeError("candidate device config is not in the expected post-overlay state")
    for marker in CALIBRATION_MARKERS:
        if marker not in db:
            raise RuntimeError(f"post-overlay calibration marker missing: {marker}")
    policy_line = f"energy_monitoring_protect_relay = {int(enable_overload_relay)};"
    for marker in (
        "static uint8_t            energy_monitoring_protect_relay = 1;",
        "void parse_config() {\n    // parse_config can be invoked again after a runtime config update.",
        "    energy_monitoring_protect_relay = 1;\n    device_config_read_from_nv();",
        'strcmp(zb_manufacturer, "b28wrpvx") == 0',
        'strcmp(zb_model, "TS011F-BS-PM") == 0',
        'hal_gpio_parse_pin("A1")',
        'hal_gpio_parse_pin("C2")',
        'hal_gpio_parse_pin("B1")',
        "hlw8012_set_sel_inverted(&hlw8012_device, 0);",
        "energy_monitoring_enabled && energy_monitoring_protect_relay &&",
        policy_line,
    ):
        if marker not in parser:
            raise RuntimeError(f"post-overlay parser marker missing: {marker}")

    required_control_tokens = ("LC3", "SB5u", "RD2", "IB4", "M")
    for token in required_control_tokens:
        if f";{token};" not in f";{CANDIDATE_CONFIG}":
            raise RuntimeError(f"control config invariant failed for token {token}")
    if "EP" in CANDIDATE_CONFIG or "EB" in CANDIDATE_CONFIG:
        raise RuntimeError("candidate config must not require a meter token/NVM rewrite")
    if _config_has_pwm_led_flag(CANDIDATE_CONFIG):
        raise RuntimeError("candidate config must not opt into downstream PWM LED behavior")
    for marker in ("HLW8012_NO_LOAD_POWER_W", "HLW8012_NO_LOAD_CURRENT_MA",
                   "HLW8012_NO_LOAD_CONFIRM_SAMPLES", "no_load_samples;",
                   "no_load_suppressed;"):
        if marker not in hlw_header:
            raise RuntimeError(f"post-overlay no-load header marker missing: {marker}")
    for marker in ("dev->data.no_load_suppressed = 1;",
                   "if (!dev->data.no_load_suppressed) {",
                   "dev->data.no_load_suppressed && power <= HLW8012_NO_LOAD_POWER_W"):
        if marker not in hlw_source:
            raise RuntimeError(f"post-overlay no-load source marker missing: {marker}")

    return {
        "source_commit": PINNED_SOURCE_COMMIT,
        "device_key": DEVICE_KEY,
        "candidate_config": CANDIDATE_CONFIG,
        "nvm_device_config_write_required": False,
        "control_gpio": {
            "network_led": "PC3",
            "button": "PB5",
            "relay": "PD2",
            "indicator": "PB4",
        },
        "meter_gpio": {"cf": "PA1", "cf1": "PC2", "sel": "PB1"},
        "meter_activation": "identity_scoped_implicit_fallback",
        "overload_relay_actuation": enable_overload_relay,
        "no_load_floor": {
            "power_w_max": 2,
            "current_ma_max": 50,
            "confirmation_samples": 3,
            "suppresses_energy_and_overload_input": True,
        },
        "calibration": {
            "voltage_multiplier": 161460,
            "current_multiplier": 144679,
            "power_multiplier": 16989,
        },
    }


def apply_overlay(root: Path, enable_overload_relay: bool = False) -> dict:
    verify_checkout(root, allow_dirty=False)

    db_path = root / "device_db.yaml"
    parser_path = root / "src/device_config/config_parser.c"
    hlw_header_path = root / "src/base_components/energy_measurement/hlw8012.h"
    hlw_source_path = root / "src/base_components/energy_measurement/hlw8012.c"
    db = db_path.read_text(encoding="utf-8")
    parser = parser_path.read_text(encoding="utf-8")
    hlw_header = hlw_header_path.read_text(encoding="utf-8")
    hlw_source = hlw_source_path.read_text(encoding="utf-8")

    db_new, db_changed = overlay_device_db(db)
    parser_new, parser_changed = overlay_config_parser(parser, enable_overload_relay)
    hlw_header_new, hlw_header_changed = overlay_hlw8012_header(hlw_header)
    hlw_source_new, hlw_source_changed = overlay_hlw8012_source(hlw_source)
    if not any((db_changed, parser_changed, hlw_header_changed, hlw_source_changed)):
        raise RuntimeError("overlay already applied; use --verify for an existing overlay")

    db_path.write_text(db_new, encoding="utf-8", newline="")
    parser_path.write_text(parser_new, encoding="utf-8", newline="")
    hlw_header_path.write_text(hlw_header_new, encoding="utf-8", newline="")
    hlw_source_path.write_text(hlw_source_new, encoding="utf-8", newline="")

    manifest = verify_post_state(root, enable_overload_relay)
    manifest["changed_files"] = [
        str(path.relative_to(root)).replace("\\", "/")
        for path, changed in ((db_path, db_changed), (parser_path, parser_changed),
                              (hlw_header_path, hlw_header_changed),
                              (hlw_source_path, hlw_source_changed))
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
    parser.add_argument(
        "--enable-overload-relay",
        action="store_true",
        help="enable the reviewed exact-target overload-to-relay coupling",
    )
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    root = args.source.resolve()
    if args.apply:
        manifest = apply_overlay(root, args.enable_overload_relay)
    else:
        verify_checkout(root, allow_dirty=True)
        manifest = verify_post_state(root, args.enable_overload_relay)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
