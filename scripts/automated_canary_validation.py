#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

EXPECTED_SOURCE_MAPPING = {"cf": "PA1", "cf1": "PC2", "sel": "PB1"}
EXPECTED_RUNTIME = {
    "manufacturer_name": "b28wrpvx",
    "model_id": "TS011F-BS-PM",
    "device_type": "router",
    "mcu": "TLSR8258",
    "device_config": "b28wrpvx;TS011F-BS-PM;LC3;SB5u;RD2;IB4;M;",
}


class ValidationError(RuntimeError):
    pass


class SafetyAbort(ValidationError):
    pass


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def median(values: list[float]) -> float:
    if not values:
        raise ValidationError("median requested for empty sample set")
    return float(statistics.median(values))


def coeff_var(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = statistics.mean(values)
    if m == 0:
        return 0.0
    return abs(statistics.pstdev(values) / m)


def resolve_alias(state: dict[str, Any], aliases: list[str]) -> Any:
    for key in aliases:
        if key in state:
            return state[key]
    return None


def normalized_snapshot(state: dict[str, Any], aliases: dict[str, list[str]]) -> dict[str, Any]:
    out = {}
    for name, keys in aliases.items():
        out[name] = resolve_alias(state, keys)
    return out


def numeric(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)) and math.isfinite(float(v)):
        return float(v)
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def summarize_window(samples: list[dict[str, Any]]) -> dict[str, Any]:
    fields = ("voltage", "current", "power", "energy", "linkquality")
    result: dict[str, Any] = {"sample_count": len(samples)}
    for field_name in fields:
        vals = [numeric(s.get(field_name)) for s in samples]
        vals = [v for v in vals if v is not None]
        result[field_name] = {
            "count": len(vals),
            "median": median(vals) if vals else None,
            "min": min(vals) if vals else None,
            "max": max(vals) if vals else None,
        }
    states = [str(s.get("state", "")).upper() for s in samples if s.get("state") is not None]
    result["states"] = states
    return result


def evaluate_cycles(cycles: list[dict[str, Any]], cfg: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    t = cfg["test"]
    if len(cycles) < int(t["cycles"]):
        errors.append(f"expected {t['cycles']} cycles, got {len(cycles)}")

    on_powers: list[float] = []
    on_currents: list[float] = []
    on_voltages: list[float] = []
    off_powers: list[float] = []
    off_currents: list[float] = []
    off_voltages: list[float] = []
    energy_points: list[float] = []

    for i, cycle in enumerate(cycles, start=1):
        off = cycle.get("off") or {}
        on = cycle.get("on") or {}
        off_p = numeric((off.get("power") or {}).get("median"))
        off_i = numeric((off.get("current") or {}).get("median"))
        off_v = numeric((off.get("voltage") or {}).get("median"))
        on_p = numeric((on.get("power") or {}).get("median"))
        on_i = numeric((on.get("current") or {}).get("median"))
        on_v = numeric((on.get("voltage") or {}).get("median"))

        for label, value in (("off power", off_p), ("off current", off_i), ("off voltage", off_v),
                             ("on power", on_p), ("on current", on_i), ("on voltage", on_v)):
            if value is None:
                errors.append(f"cycle {i}: missing {label}")

        if None in (off_p, off_i, off_v, on_p, on_i, on_v):
            continue

        off_powers.append(off_p)
        off_currents.append(off_i)
        off_voltages.append(off_v)
        on_powers.append(on_p)
        on_currents.append(on_i)
        on_voltages.append(on_v)

        if off_p > float(t["max_off_power_w"]):
            errors.append(f"cycle {i}: OFF power {off_p:.2f} W exceeds {t['max_off_power_w']} W")
        if off_i > float(t["max_off_current_a"]):
            errors.append(f"cycle {i}: OFF current {off_i:.3f} A exceeds {t['max_off_current_a']} A")
        if on_p < float(t["min_on_power_w"]):
            errors.append(f"cycle {i}: ON power {on_p:.2f} W below {t['min_on_power_w']} W")
        if on_i < float(t["min_on_current_a"]):
            errors.append(f"cycle {i}: ON current {on_i:.3f} A below {t['min_on_current_a']} A")
        if not float(t["voltage_min_v"]) <= off_v <= float(t["voltage_max_v"]):
            errors.append(f"cycle {i}: OFF voltage {off_v:.2f} V outside plausible mains range")
        if not float(t["voltage_min_v"]) <= on_v <= float(t["voltage_max_v"]):
            errors.append(f"cycle {i}: ON voltage {on_v:.2f} V outside plausible mains range")

        voltage_step = abs(on_v - off_v) / max(off_v, 1.0)
        if voltage_step > float(t["max_voltage_step_fraction"]):
            errors.append(f"cycle {i}: voltage changes {voltage_step:.1%} with load; CF1/SEL behavior is suspect")

        ratio = on_p / max(off_p, 0.5)
        if ratio < float(t["min_power_step_ratio"]):
            errors.append(f"cycle {i}: power step ratio {ratio:.2f} below {t['min_power_step_ratio']}")

        apparent = on_v * on_i
        if apparent > 5:
            pf = on_p / apparent
            if not 0.55 <= pf <= 1.25:
                errors.append(f"cycle {i}: P/(V*I)={pf:.2f} implausible for declared resistive test load")

        for phase in (off, on):
            e = numeric((phase.get("energy") or {}).get("median"))
            if e is not None:
                energy_points.append(e)

    if on_powers and coeff_var(on_powers) > float(t["max_cycle_power_cv"]):
        errors.append(f"ON power repeatability CV={coeff_var(on_powers):.1%} exceeds {t['max_cycle_power_cv']:.0%}")

    if energy_points:
        for a, b in zip(energy_points, energy_points[1:]):
            if b + 1e-9 < a:
                errors.append("energy counter decreased during validation")
        if bool(t.get("require_energy_increase", True)) and energy_points[-1] <= energy_points[0]:
            errors.append("energy did not increase during repeated ON windows")
    elif bool(t.get("require_energy_increase", True)):
        warnings.append("energy values were unavailable; energy-increase check could not run")

    declared_w = float(cfg["load"]["declared_w"])
    if on_powers:
        p = statistics.median(on_powers)
        if not declared_w * 0.35 <= p <= declared_w * 1.75:
            warnings.append(
                f"median ON power {p:.1f} W is far from declared {declared_w:.1f} W; mapping may still be valid but calibration/load declaration needs review"
            )

    mapping_confirmed = not errors and len(on_powers) >= int(t["cycles"])
    return {
        "status": "PASS" if not errors else "FAIL",
        "mapping_confirmation": {
            "source_mapping": EXPECTED_SOURCE_MAPPING,
            "cf_pa1_confirmed": mapping_confirmed,
            "cf1_pc2_confirmed": mapping_confirmed,
            "sel_pb1_confirmed": mapping_confirmed,
            "reason": (
                "Repeated load steps produced active-power response while mains voltage remained stable and current tracked load; with the pinned hardware-verified source map this functionally confirms CF/CF1/SEL on the exact canary."
                if mapping_confirmed else
                "Functional behavior did not satisfy all confirmation criteria."
            ),
        },
        "errors": errors,
        "warnings": warnings,
        "aggregates": {
            "on_power_median_w": median(on_powers) if on_powers else None,
            "off_power_median_w": median(off_powers) if off_powers else None,
            "on_current_median_a": median(on_currents) if on_currents else None,
            "off_current_median_a": median(off_currents) if off_currents else None,
            "on_voltage_median_v": median(on_voltages) if on_voltages else None,
            "off_voltage_median_v": median(off_voltages) if off_voltages else None,
            "on_power_cv": coeff_var(on_powers) if on_powers else None,
        },
    }


@dataclass
class StateCache:
    state: dict[str, Any] = field(default_factory=dict)
    updated: dict[str, float] = field(default_factory=dict)
    last_message: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def merge(self, payload: dict[str, Any]) -> None:
        ts = time.monotonic()
        with self.lock:
            for k, v in payload.items():
                self.state[k] = v
                self.updated[k] = ts
            self.last_message = ts

    def copy(self) -> tuple[dict[str, Any], dict[str, float], float]:
        with self.lock:
            return dict(self.state), dict(self.updated), self.last_message


class MqttCanaryHarness:
    def __init__(self, cfg: dict[str, Any], output: Path):
        try:
            import paho.mqtt.client as mqtt
        except ImportError as exc:
            raise ValidationError(
                "paho-mqtt is required. Run scripts/run-canary-validation.ps1, which installs the pinned dependency."
            ) from exc
        self.mqtt_mod = mqtt
        self.cfg = cfg
        self.output = output
        self.output.mkdir(parents=True, exist_ok=True)
        self.events_path = output / "events.jsonl"
        self.cache = StateCache()
        self.responses: dict[str, dict[str, Any]] = {}
        self.response_cv = threading.Condition()
        self.bridge_online = True
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"bseed-canary-{uuid.uuid4().hex[:8]}")
        user = os.getenv(cfg["mqtt"].get("username_env", ""), "")
        password = os.getenv(cfg["mqtt"].get("password_env", ""), "")
        if user:
            self.client.username_pw_set(user, password or None)
        if cfg["mqtt"].get("tls"):
            self.client.tls_set()
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.connected = threading.Event()
        self.start_monotonic = time.monotonic()
        self.expected_relay_state = "OFF"
        self.safety_abort_reason: str | None = None

    @property
    def base(self) -> str:
        return self.cfg["mqtt"].get("base_topic", "zigbee2mqtt").rstrip("/")

    @property
    def device_topic(self) -> str:
        return f"{self.base}/{self.cfg['device']['friendly_name']}"

    def log(self, event: str, **data: Any) -> None:
        row = {"timestamp": now_iso(), "monotonic_s": round(time.monotonic() - self.start_monotonic, 3), "event": event, **data}
        with self.events_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, sort_keys=True) + "\n")

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if int(reason_code) != 0:
            return
        client.subscribe(self.device_topic, qos=1)
        client.subscribe(f"{self.base}/bridge/state", qos=1)
        client.subscribe(f"{self.base}/bridge/response/#", qos=1)
        self.connected.set()

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8")) if msg.payload else {}
        except Exception:
            self.log("mqtt_non_json", topic=msg.topic)
            return
        if msg.topic == self.device_topic and isinstance(payload, dict):
            self.cache.merge(payload)
            self._monitor_safety(payload)
        elif msg.topic == f"{self.base}/bridge/state":
            value = payload.get("state") if isinstance(payload, dict) else payload
            self.bridge_online = str(value).lower() != "offline"
            if not self.bridge_online:
                self.safety_abort_reason = "Zigbee2MQTT bridge reported offline"
        elif msg.topic.startswith(f"{self.base}/bridge/response/") and isinstance(payload, dict):
            tx = str(payload.get("transaction", ""))
            if tx:
                with self.response_cv:
                    self.responses[tx] = payload
                    self.response_cv.notify_all()

    def _monitor_safety(self, payload: dict[str, Any]) -> None:
        aliases = self.cfg["device"]["property_aliases"]
        snap = normalized_snapshot(self.cache.copy()[0], aliases)
        power = numeric(snap.get("power"))
        current = numeric(snap.get("current"))
        t = self.cfg["test"]
        if power is not None and power > float(t["max_power_w"]):
            self.safety_abort_reason = f"reported power {power:.1f} W exceeds hard test limit {t['max_power_w']} W"
        if current is not None and current > float(t["max_current_a"]):
            self.safety_abort_reason = f"reported current {current:.3f} A exceeds hard test limit {t['max_current_a']} A"

    def connect(self) -> None:
        m = self.cfg["mqtt"]
        self.client.connect(m["host"], int(m.get("port", 1883)), keepalive=30)
        self.client.loop_start()
        if not self.connected.wait(float(m.get("connect_timeout_s", 15))):
            raise ValidationError("MQTT connection timeout")
        self.log("mqtt_connected", host=m["host"], port=m.get("port", 1883))

    def disconnect(self) -> None:
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass

    def publish(self, topic: str, payload: Any, qos: int = 1) -> None:
        raw = payload if isinstance(payload, str) else json.dumps(payload, separators=(",", ":"))
        info = self.client.publish(topic, raw, qos=qos, retain=False)
        info.wait_for_publish(timeout=5)
        self.log("mqtt_publish", topic=topic, payload=payload)

    def bridge_request(self, request: str, payload: dict[str, Any] | None = None, timeout: float = 20) -> dict[str, Any]:
        tx = uuid.uuid4().hex
        body = dict(payload or {})
        body["transaction"] = tx
        topic = f"{self.base}/bridge/request/{request}"
        self.publish(topic, body)
        deadline = time.monotonic() + timeout
        with self.response_cv:
            while tx not in self.responses and time.monotonic() < deadline:
                self.response_cv.wait(timeout=max(0.1, deadline - time.monotonic()))
            response = self.responses.pop(tx, None)
        if response is None:
            raise ValidationError(f"timeout waiting for bridge response to {request}")
        if response.get("status") != "ok":
            raise ValidationError(f"bridge request {request} failed: {response}")
        self.log("bridge_response", request=request, response=response)
        return response

    def hard_kill(self, reason: str) -> None:
        hk = self.cfg.get("hard_kill") or {}
        if not hk.get("enabled"):
            self.log("hard_kill_unavailable", reason=reason)
            return
        try:
            self.publish(hk["topic"], hk["safe_payload"], int(hk.get("qos", 1)))
            self.log("hard_kill_issued", reason=reason)
        except Exception as exc:
            self.log("hard_kill_failed", reason=reason, error=str(exc))

    def current_snapshot(self) -> dict[str, Any]:
        state, _, _ = self.cache.copy()
        return normalized_snapshot(state, self.cfg["device"]["property_aliases"])

    def relay_command(self, desired: str) -> None:
        desired = desired.upper()
        prop = self.cfg["device"].get("relay_property", "state_relay")
        self.expected_relay_state = desired
        self.publish(f"{self.device_topic}/set", {prop: desired})
        deadline = time.monotonic() + float(self.cfg["test"]["command_timeout_s"])
        aliases = self.cfg["device"]["property_aliases"]["state"]
        while time.monotonic() < deadline:
            if self.safety_abort_reason:
                raise SafetyAbort(self.safety_abort_reason)
            state, _, _ = self.cache.copy()
            actual = resolve_alias(state, aliases)
            if str(actual).upper() == desired:
                self.log("relay_ack", desired=desired)
                return
            time.sleep(0.2)
        raise SafetyAbort(f"relay did not acknowledge {desired} within timeout")

    def force_safe_off(self, reason: str) -> None:
        self.log("safe_off_begin", reason=reason)
        prop = self.cfg["device"].get("relay_property", "state_relay")
        for attempt in range(1, 4):
            try:
                self.publish(f"{self.device_topic}/set", {prop: "OFF"})
                deadline = time.monotonic() + 4
                while time.monotonic() < deadline:
                    snap = self.current_snapshot()
                    if str(snap.get("state", "")).upper() == "OFF":
                        self.log("safe_off_confirmed", attempt=attempt)
                        return
                    time.sleep(0.25)
            except Exception as exc:
                self.log("safe_off_attempt_failed", attempt=attempt, error=str(exc))
        self.hard_kill(reason)
        self.log("safe_off_not_confirmed", reason=reason)

    def wait_checked(self, seconds: float, require_messages: bool = True) -> None:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if self.safety_abort_reason:
                raise SafetyAbort(self.safety_abort_reason)
            if time.monotonic() - self.start_monotonic > float(self.cfg["test"]["max_runtime_s"]):
                raise SafetyAbort("maximum test runtime exceeded")
            _, _, last = self.cache.copy()
            if require_messages and last and time.monotonic() - last > float(self.cfg["test"]["max_state_stale_s"]):
                raise SafetyAbort("device state stream became stale")
            if not self.bridge_online:
                raise SafetyAbort("Zigbee2MQTT bridge offline")
            time.sleep(0.25)

    def collect_window(self, label: str, seconds: float) -> list[dict[str, Any]]:
        samples: list[dict[str, Any]] = []
        period = float(self.cfg["test"]["sample_period_s"])
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.wait_checked(min(period, max(0.0, deadline - time.monotonic())))
            snap = self.current_snapshot()
            snap["captured_at"] = now_iso()
            samples.append(snap)
            self.log("sample", phase=label, sample=snap)
        return samples

    def preflight(self) -> None:
        if self.cfg["load"].get("operator_setup_ack") is not True:
            raise ValidationError("load.operator_setup_ack must be true after the one-time physical setup is checked")
        if self.cfg["load"].get("type") != "resistive":
            raise ValidationError("first confirmation run requires a known resistive load")
        declared = float(self.cfg["load"]["declared_w"])
        if declared <= 0 or declared > float(self.cfg["load"]["max_allowed_declared_w"]):
            raise ValidationError("declared test load is outside the permitted low-power range")
        if not self.cfg["device"].get("friendly_name"):
            raise ValidationError("device.friendly_name is required")

        self.bridge_request("health_check", {})
        if self.cfg["test"].get("auto_interview"):
            self.bridge_request("device/interview", {"id": self.cfg["device"]["friendly_name"]}, timeout=60)
        if self.cfg["test"].get("auto_configure"):
            self.bridge_request("device/configure", {"id": self.cfg["device"]["friendly_name"]}, timeout=60)
        self.relay_command("OFF")
        self.wait_checked(5, require_messages=False)
        self.log("preflight_pass")

    def ota_health(self, phase: str) -> None:
        if not self.cfg["test"].get("ota_health_check"):
            return
        self.bridge_request(
            "device/ota_update/check",
            {"id": self.cfg["device"]["friendly_name"]},
            timeout=90,
        )
        self.log("ota_health_pass", phase=phase)

    def run(self) -> dict[str, Any]:
        cycles: list[dict[str, Any]] = []
        self.connect()
        try:
            self.preflight()
            self.ota_health("before_functional_test")
            for idx in range(1, int(self.cfg["test"]["cycles"]) + 1):
                self.log("cycle_begin", cycle=idx)
                self.relay_command("OFF")
                self.wait_checked(float(self.cfg["test"]["off_settle_s"]))
                off_samples = self.collect_window(f"cycle_{idx}_off", float(self.cfg["test"]["sample_window_s"]))

                self.relay_command("ON")
                self.wait_checked(float(self.cfg["test"]["on_settle_s"]))
                on_samples = self.collect_window(f"cycle_{idx}_on", float(self.cfg["test"]["sample_window_s"]))

                self.relay_command("OFF")
                self.wait_checked(3)
                cycle = {"cycle": idx, "off": summarize_window(off_samples), "on": summarize_window(on_samples)}
                cycles.append(cycle)
                partial = evaluate_cycles(cycles, {**self.cfg, "test": {**self.cfg["test"], "cycles": len(cycles), "require_energy_increase": False}})
                if partial["status"] != "PASS":
                    raise SafetyAbort("cycle-level functional plausibility failed: " + "; ".join(partial["errors"]))
                self.log("cycle_pass", cycle=idx, summary=cycle)

            self.ota_health("after_functional_test")
            evaluation = evaluate_cycles(cycles, self.cfg)
            result = {
                "schema_version": 1,
                "kind": "automated_canary_validation",
                "status": evaluation["status"],
                "started_at": now_iso(),
                "device_id": self.cfg["device_id"],
                "pcb_revision": self.cfg["pcb_revision"],
                "friendly_name": self.cfg["device"]["friendly_name"],
                "safety_mode": "SAFE_DUAL_LAYER" if (self.cfg.get("hard_kill") or {}).get("enabled") else "SAFE_SINGLE_LAYER_LOW_POWER",
                "source_mapping": EXPECTED_SOURCE_MAPPING,
                "cycles": cycles,
                "evaluation": evaluation,
                "final_relay_state": "OFF",
                "device_config_write_performed": False,
                "factory_reset_performed": False,
                "calibration_write_performed": False,
                "ota_update_performed_by_harness": False,
                "events_file": str(self.events_path),
            }
            self.force_safe_off("normal completion")
            return result
        except Exception as exc:
            self.force_safe_off(str(exc))
            return {
                "schema_version": 1,
                "kind": "automated_canary_validation",
                "status": "BLOCKED" if isinstance(exc, SafetyAbort) else "FAIL",
                "device_id": self.cfg.get("device_id"),
                "pcb_revision": self.cfg.get("pcb_revision"),
                "friendly_name": (self.cfg.get("device") or {}).get("friendly_name"),
                "source_mapping": EXPECTED_SOURCE_MAPPING,
                "error": str(exc),
                "cycles": cycles,
                "final_relay_state": self.current_snapshot().get("state"),
                "device_config_write_performed": False,
                "factory_reset_performed": False,
                "calibration_write_performed": False,
                "ota_update_performed_by_harness": False,
                "events_file": str(self.events_path),
            }
        finally:
            self.disconnect()


def load_config(path: Path) -> dict[str, Any]:
    cfg = json.loads(path.read_text(encoding="utf-8"))
    if cfg.get("schema_version") != 1:
        raise ValidationError("config schema_version must be 1")
    return cfg


def main() -> int:
    ap = argparse.ArgumentParser(description="Fully automated, bounded BSEED BL0937 functional confirmation over Zigbee2MQTT MQTT.")
    ap.add_argument("config", type=Path)
    ap.add_argument("--evaluate", type=Path, help="Offline: evaluate a saved result/cycle fixture without MQTT")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        fixture = {
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
        def w(v, i, p, e):
            return {"sample_count": 10, "voltage": {"median": v}, "current": {"median": i}, "power": {"median": p}, "energy": {"median": e}}
        cycles = [
            {"off": w(231, .01, 0, 1.000), "on": w(230, .26, 59, 1.001)},
            {"off": w(231, .01, 0, 1.001), "on": w(230, .26, 60, 1.002)},
            {"off": w(231, .01, 0, 1.002), "on": w(230, .26, 59, 1.003)},
        ]
        assert evaluate_cycles(cycles, fixture)["status"] == "PASS"
        bad = json.loads(json.dumps(cycles))
        bad[1]["on"]["voltage"]["median"] = 90
        assert evaluate_cycles(bad, fixture)["status"] == "FAIL"
        print("SELF_TEST=PASS")
        return 0

    cfg = load_config(args.config)
    if args.evaluate:
        saved = json.loads(args.evaluate.read_text(encoding="utf-8"))
        result = evaluate_cycles(saved["cycles"], cfg)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0 if result["status"] == "PASS" else 2

    run_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out = Path(cfg.get("output_dir", ".local/canary-validation")) / run_id
    harness = MqttCanaryHarness(cfg, out)
    result = harness.run()
    summary = out / "summary.json"
    summary.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    print(f"SUMMARY={summary}")
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
