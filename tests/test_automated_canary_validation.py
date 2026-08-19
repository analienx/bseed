import importlib.util
import json
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "automated_canary_validation.py"
spec = importlib.util.spec_from_file_location("bseed_canary_validation", SCRIPT)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
assert spec.loader is not None
spec.loader.exec_module(mod)


def fixture_cfg():
    return {
        "load": {"declared_w": 60},
        "test": {
            "cycles": 3,
            "max_off_power_w": 8,
            "max_off_current_a": 0.08,
            "min_on_power_w": 15,
            "min_on_current_a": 0.05,
            "voltage_min_v": 180,
            "voltage_max_v": 260,
            "max_voltage_step_fraction": 0.12,
            "min_power_step_ratio": 4.0,
            "max_cycle_power_cv": 0.25,
            "require_energy_increase": True,
        },
    }


def window(v, i, p, e):
    return {
        "sample_count": 10,
        "voltage": {"median": v},
        "current": {"median": i},
        "power": {"median": p},
        "energy": {"median": e},
    }


def good_cycles():
    return [
        {"off": window(231, 0.01, 0, 1.000), "on": window(230, 0.26, 59, 1.001)},
        {"off": window(231, 0.01, 0, 1.001), "on": window(230, 0.26, 60, 1.002)},
        {"off": window(231, 0.01, 0, 1.002), "on": window(230, 0.26, 59, 1.003)},
    ]


def test_good_mapping_confirmation_passes():
    result = mod.evaluate_cycles(good_cycles(), fixture_cfg())
    assert result["status"] == "PASS"
    assert result["mapping_confirmation"]["cf_pa1_confirmed"] is True
    assert result["mapping_confirmation"]["cf1_pc2_confirmed"] is True
    assert result["mapping_confirmation"]["sel_pb1_confirmed"] is True


def test_voltage_swapped_or_implausible_fails():
    cycles = json.loads(json.dumps(good_cycles()))
    cycles[1]["on"]["voltage"]["median"] = 90
    result = mod.evaluate_cycles(cycles, fixture_cfg())
    assert result["status"] == "FAIL"
    assert any("voltage" in e.lower() for e in result["errors"])


def test_missing_current_fails():
    cycles = json.loads(json.dumps(good_cycles()))
    cycles[0]["on"]["current"]["median"] = None
    result = mod.evaluate_cycles(cycles, fixture_cfg())
    assert result["status"] == "FAIL"


def test_non_monotonic_energy_fails():
    cycles = good_cycles()
    cycles[2]["on"]["energy"]["median"] = 0.999
    result = mod.evaluate_cycles(cycles, fixture_cfg())
    assert result["status"] == "FAIL"
    assert any("energy counter decreased" in e for e in result["errors"])


def test_repeatability_failure_is_detected():
    cycles = good_cycles()
    cycles[2]["on"]["power"]["median"] = 120
    result = mod.evaluate_cycles(cycles, fixture_cfg())
    assert result["status"] == "FAIL" or any("repeatability" in e for e in result["errors"])
