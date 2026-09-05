#!/usr/bin/env bash
# Executor validation for issue #10 handoff: reproduce the frozen V8 build and run the
# repository's own one-command validator. BUILD/VALIDATE ONLY - no publish, no flash,
# no device contact, and NO SOURCE EDITS whatsoever.
#
# Environment is assembled with repository-normal tooling only:
#   apt packages mirroring .github/workflows/test.yml (+ build-essential, which ubuntu-latest
#   preinstalls and which the host-stub compile needs for libc headers),
#   `make -C src/telink tools/all` for SDK + TC32,
#   `make setup_venv` for the Python deps in requirements.txt (click is needed by make_ota.py).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
SHA=4684def3091225e12bbf3b28025c77ed60136b49

echo "### apt environment"
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  build-essential make gcc git python3 python3-venv python3-pip python3-pytest python3-yaml \
  unzip wget ca-certificates tar bzip2 file >/dev/null

echo "### clone + freeze to the handoff SHA"
mkdir -p /work
git clone --quiet https://github.com/analienx/tuya-zigbee-switch.git /work/fw
cd /work/fw
git checkout --quiet --detach "$SHA"
test "$(git rev-parse HEAD)" = "$SHA"
test -z "$(git status --porcelain)"
echo "HEAD=$(git rev-parse HEAD) porcelain=EMPTY (pre-toolchain)"
git log --oneline -1
git merge-base --is-ancestor 0f54303a52aed85f985b8c3b08bcf03aa88efc2a HEAD && echo "V7 base 0f54303a IS an ancestor of HEAD"

echo "### install Telink SDK + TC32 toolchain via repo tooling only"
make -C src/telink tools/all 2>&1 | tail -12
make -C src/telink tools/status 2>&1 | tail -20 > /out/telink-tools-status.txt
cat /out/telink-tools-status.txt

echo "### install repo python venv (requirements.txt) via repo tooling only"
make setup_venv 2>&1 | tail -6
# shellcheck disable=SC1091
. .venv/bin/activate

{
  echo "### toolchain/environment identification";
  echo "uname: $(uname -srm)";
  echo "distro: $(. /etc/os-release; echo "$PRETTY_NAME")";
  echo "python3 (venv): $(python3 -V 2>&1) @ $(command -v python3)";
  echo "make: $(make -v | head -1)";
  echo "gcc: $(gcc --version | head -1)";
  echo "git: $(git --version)";
  echo "bash: $(bash --version | head -1)";
  echo "tc32: $(telink_tools/toolchain/tc32/bin/tc32-elf-gcc --version | head -1)";
  echo "sdk: $(cat telink_tools/sdk/version 2>/dev/null || echo '3.7.2.0 per tools.mk')";
  echo "--- pip freeze (requirements.txt installed) ---";
  pip freeze 2>/dev/null | grep -Ei '^(click|pytest|PyYAML|Jinja2|MarkupSafe|pyserial)==' || pip list 2>/dev/null;
} | tee /out/environment.txt

echo "### run the repository's one-command V8 validator (inside the venv)"
set +e
python3 make_scripts/validate_bseed_ts0726_v8.py > /out/validator-stdout.json 2> /out/validator-stderr.txt
RC=$?
set -e
echo "VALIDATOR_EXIT=$RC"
echo "----- validator stdout -----"; cat /out/validator-stdout.json
echo "----- validator stderr -----"; cat /out/validator-stderr.txt

if [ "$RC" -ne 0 ]; then
  echo "STOP CONDITION: validator returned non-zero"
  cp -f build/bseed-ts0726-v8/manifest.json /out/manifest-if-any.json 2>/dev/null || echo "no manifest produced"
  exit "$RC"
fi

echo "### evidence capture"
cp build/bseed-ts0726-v8/manifest.json /out/manifest.json
cp build/bseed-ts0726-v8/forward.bin /out/forward.bin
cp build/bseed-ts0726-v8/forward.ota /out/forward.ota
git rev-parse HEAD > /out/HEAD-after.txt
git status --porcelain > /out/porcelain-after.txt
echo "porcelain-after lines: $(wc -l < /out/porcelain-after.txt)"
( cd build/bseed-ts0726-v8 && sha256sum forward.bin forward.ota ) | tee /out/sha256.txt
( cd build/bseed-ts0726-v8 && sha512sum forward.bin forward.ota ) | tee /out/sha512.txt
( cd /out && sha256sum forward.bin forward.ota ) | tee /out/sha256-copied-out.txt
echo "### DONE rc=$RC"
