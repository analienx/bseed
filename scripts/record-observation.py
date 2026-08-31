#!/usr/bin/env python3
from __future__ import annotations
import argparse, csv
from datetime import datetime, timezone
from pathlib import Path

FIELDS=['timestamp_utc','experiment_id','candidate_id','device_id','phase','stimulus','pm_enabled','relay_state','uptime_s','reset_count','cf_count','cf_delta','cf_period_us','cf_frequency_hz','cf1_count','cf1_delta','cf1_period_us','cf1_frequency_hz','sel_state','reference_voltage_v','reference_current_a','reference_active_power_w','reference_pf','result','notes']

def main()->int:
    ap=argparse.ArgumentParser(description='Append a structured empirical BSEED observation.')
    ap.add_argument('output',type=Path); ap.add_argument('--experiment-id',required=True); ap.add_argument('--candidate-id',required=True); ap.add_argument('--device-id',required=True); ap.add_argument('--phase',required=True); ap.add_argument('--stimulus',required=True)
    ap.add_argument('--pm-enabled',choices=['true','false'],required=True); ap.add_argument('--relay-state',choices=['on','off','unknown'],default='unknown')
    for name in ['uptime-s','reset-count','cf-count','cf-delta','cf-period-us','cf-frequency-hz','cf1-count','cf1-delta','cf1-period-us','cf1-frequency-hz','sel-state','reference-voltage-v','reference-current-a','reference-active-power-w','reference-pf']:
        ap.add_argument('--'+name,default='')
    ap.add_argument('--result',choices=['PASS','FAIL','INCONCLUSIVE','OBSERVED'],required=True); ap.add_argument('--notes',default='')
    args=ap.parse_args(); raw=vars(args); row={k:raw.get(k,'') for k in FIELDS}; row['timestamp_utc']=datetime.now(timezone.utc).isoformat()
    args.output.parent.mkdir(parents=True,exist_ok=True); exists=args.output.exists()
    with args.output.open('a',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=FIELDS)
        if not exists: w.writeheader()
        w.writerow(row)
    print(f'OBSERVATION_APPENDED={args.output}'); return 0
if __name__=='__main__': raise SystemExit(main())
