# V2 — Firmware revalidation evidence (2026-09-02)

Executor revalidation per supervisor comment 5500044572. Branch
`analienx/tuya-zigbee-switch` `supervisor/ts0726-redesign-v4`
@ `f1c0631a819d44190f855b5fe31f9001924ef1f3` ("Add reproducible stub-first
BSEED v4 validation").

Fresh Linux (WSL Ubuntu) checkout of the pinned commit (core.autocrlf=false ->
LF working tree; `.gitattributes` honored). `telink_tools` (SDK, tc32
toolchain `4.5.1.tc32-elf-1.5`, tlsrpgm) copied from the local fork working
copy and verified (`tc32-elf-gcc --version` runs, `cc1` present).

## Results

| check | result |
|---|---|
| `python3 make_scripts/validate_bseed_ts0726_v4.py` | **FAIL** — focused migration pytest step (see FAIL-2); the validator stops there by design |
| focused migration pytest `test_device_migration.py test_cross_image_migration.py -q` (stubs built by validator) | **45 passed, 1 failed** |
| full `pytest -q` (stubs built) | **281 passed, 1 failed** |
| failing test in isolation | reproduces deterministically (1 failed in 3.49 s) |
| `bash -n make_scripts/build_bseed_ts0726_v4.sh` | **PASS** — LF-only (0 CR), valid bash |
| `bash make_scripts/build_bseed_ts0726_v4.sh /home/.../bseed-ts0726-v4-build` | **PASS** — see firmware-build-manifest.json |

## FAIL-2 — completed-state boot does not restore indicator state to ON

`tests/test_device_migration.py::test_forward_complete_preserves_user_indicator_mode`
at line 510:

```python
def test_forward_complete_preserves_user_indicator_mode(forward_stub: None) -> None:
    run_forward_migration()
    seed_relay_record(
        0,
        indicator_mode=INDICATOR_MODE_SAME,   # user switched LEFT to SAME after proof
        indicator_on=0,
    )
    build_forward_image()
    with booted() as device:
        assert (
            read_indicator_mode(device, RELAY_LEFT_ENDPOINT)
            == INDICATOR_MODE_SAME
        )                                    # PASS
        assert (
            read_indicator_state(device, RELAY_LEFT_ENDPOINT) == INDICATOR_ON
        )                                    # FAIL: read 0, expected 1
        assert read_marker() == MIG_FORWARD_COMPLETE
```

Exact assertion output:

```
E           assert 0 == 1
E            +  where 0 = read_indicator_state(<tests.conftest.Device object ...>, 4)
```

Read of the source (`src/device_config/device_migration.c`): a
`MARKER_VALID + MIG_STATE_FORWARD_COMPLETE + canonical config` boot validates
physical-mode slots (`ensure_valid_or_default_power_relay_modes()`) and returns
`SAFE_TO_CONTINUE` without touching the indicator record — so the SAME mode
**is** preserved (assertion 1 passes). The boot then leaves the persisted
indicator record as seeded (`indicator_led_on = 0`), so the 0xff02 indicator
state reads 0, while the test asserts the completed-state boot drives the
indicator state to ON (1) for the user-selected SAME mode.

Supervisor ownership note: whether the correct semantic is (a) firmware should
drive 0xff02 to ON for a SAME-mode record whose relay is DETACHED_ON, or (b)
the test fixture should seed `on_off=1`/adjust the expectation, is a
firmware-surface decision for the Supervisor. Not patched by executor (protected
invariant surface; supervisor "will patch it").

## Required build manifest identity (produced, matches exactly)

```
board                  SWITCH_BSEED_TS0726_3GANG
canonicalConfig        iedhxgyi;TS0726-3-BS;LC4;SB1u;RC2;IC0;SB7u;RC3;ID7;SB4u;RD2;IB5;M;
migrationFromConfig    iedhxgyi;TS0726-3-BS;LC4;SB1u;RC0;IC2;SB7u;RD7;IC3;SB4u;RD2;IB5;M;
forward  swBuildId     1.1.4-bseedv4      fileVersion 285356035
recovery swBuildId     1.1.4-bseedv4r     fileVersion 285356036
manufacturerCode       4417               imageType 45577
sourceCommit           f1c0631a819d44190f855b5fe31f9001924ef1f3
```

Artifacts (BUILD ONLY — no publication, no OTA, no flash):

| file | bytes | sha256 |
|---|---|---|
| forward.bin | 183753 | 4a2e444ee11e0393bfd5310ec71e5e49e3cd0eddafbbe565bf19aae3ad2f68ba |
| forward.ota | 183826 | db2328b1e86f58ff66c5863c2b969b9ffb90e5fbbca5e5be263fb9d246060aa8 |
| recovery.bin | 183117 | 6ebd25f473e5d98f8be2f145313b0c8c2d3d3582c2b337d5b044bd2d8047ebf8 |
| recovery.ota | 183186 | bac0b9ba1b5ac3b8ad8862d994619bf3bc8eb771fb217dbf9c4ecdcd834231a2 |

Both images compiled from source in the run (124 Telink SDK objects each,
forward and recovery). Behavioral invariants covered by the 45 passing focused
tests: forward full transaction, one-shot semantics, blocked/fail-closed paths
(corrupt marker, indicator-safety write failure, canonical mode write failure,
foreign config), forced DETACHED_ON pre-seed, revert re-proof of DETACHED_ON,
revert MANUAL+ON restore before swapped config, revert removal of physical-mode
slots, plain-generic preservation. The one failing invariant is FAIL-2 above.
