#!/usr/bin/env bash
# Poll the V8 validation run until a terminal marker appears, then summarize.
for i in $(seq 1 40); do
  if grep -qE "VALIDATOR_EXIT|STOP CONDITION|### DONE" /out/run.log 2>/dev/null; then break; fi
  sleep 15
done
echo "--- markers ---"
grep -nE "HEAD=|ancestor|VALIDATOR_EXIT|### DONE|STOP CONDITION" /out/run.log 2>/dev/null || echo "(none yet)"
echo "--- log tail ---"
tail -15 /out/run.log 2>/dev/null || echo "(no log)"
echo "--- files in /out ---"
ls -la /out
