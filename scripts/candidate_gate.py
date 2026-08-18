#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
from typing import Any

RECOVERY_CRITICAL_SURFACES={'bootloader','flash_layout','ota_client','ota_identity','zigbee_network_init','critical_nvm_layout','watchdog_early_boot','recovery_path'}
REQUIRED_OFFLINE_CHECKS={'build','unit_tests','policy_tests'}

def sha256_file(path:Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
def load(path:Path)->dict[str,Any]: return json.loads(path.read_text(encoding='utf-8'))
def resolve(base:Path,raw:str)->Path:
    p=Path(raw); return p if p.is_absolute() else (base/p).resolve()

def validate_manifest(path:Path)->dict[str,Any]:
    m=load(path); base=path.parent.resolve(); errors=[]; warnings=[]
    required=['schema_version','candidate_id','source_commit','candidate_ota','candidate_sha256','baseline_manifest','rollback_ota','rollback_sha256','pm_default_enabled','recovery_critical_changes','offline_checks']
    for k in required:
        if k not in m: errors.append(f'missing required field: {k}')
    if errors: return {'status':'FAIL','errors':errors,'warnings':warnings}
    if not isinstance(m['source_commit'],str) or len(m['source_commit'])!=40: errors.append('source_commit must be a full 40-character Git commit SHA')
    if m['pm_default_enabled'] is not False: errors.append('pm_default_enabled must be false for experimental candidates')
    forbidden=set(m['recovery_critical_changes']) & RECOVERY_CRITICAL_SURFACES
    if forbidden: errors.append('candidate changes recovery-critical surfaces: '+', '.join(sorted(forbidden)))
    candidate=resolve(base,m['candidate_ota']); rollback=resolve(base,m['rollback_ota']); baseline=resolve(base,m['baseline_manifest'])
    for label,p in [('candidate_ota',candidate),('rollback_ota',rollback),('baseline_manifest',baseline)]:
        if not p.is_file(): errors.append(f'{label} does not exist: {p}')
    if candidate.is_file() and sha256_file(candidate).lower()!=str(m['candidate_sha256']).lower(): errors.append('candidate_sha256 mismatch')
    if rollback.is_file() and sha256_file(rollback).lower()!=str(m['rollback_sha256']).lower(): errors.append('rollback_sha256 mismatch')
    checks=m['offline_checks']; missing=sorted(REQUIRED_OFFLINE_CHECKS-set(checks))
    if missing: errors.append('offline_checks missing: '+', '.join(missing))
    for name in REQUIRED_OFFLINE_CHECKS & set(checks):
        if checks[name]!='PASS': errors.append(f'offline check {name} is not PASS: {checks[name]!r}')
    if candidate.is_file() and baseline.is_file():
        cmd=[sys.executable,str(Path(__file__).with_name('ota_guard.py')),'verify-candidate',str(candidate),'--baseline',str(baseline),'--expected-manufacturer','4417','--expected-image-type','43556']
        proc=subprocess.run(cmd,text=True,capture_output=True)
        if proc.returncode!=0:
            errors.append('ota_guard candidate verification failed')
            if proc.stderr.strip(): warnings.append(proc.stderr.strip())
    if candidate.exists() and rollback.exists() and candidate.resolve()==rollback.resolve(): warnings.append('candidate and rollback point to same file; verify this is intentional')
    return {'status':'PASS' if not errors else 'FAIL','candidate_id':m.get('candidate_id'),'errors':errors,'warnings':warnings,
            'next_gate':'SUPERVISOR_REVIEW_FOR_OTA_CANARY' if not errors else 'BLOCKED'}

def main()->int:
    ap=argparse.ArgumentParser(description='Hard gate for BSEED experimental OTA candidates.'); ap.add_argument('manifest',nargs='?',type=Path); ap.add_argument('--self-test',action='store_true'); ap.add_argument('--json-out',type=Path); args=ap.parse_args()
    if args.self_test:
        assert 'ota_client' in RECOVERY_CRITICAL_SURFACES and 'build' in REQUIRED_OFFLINE_CHECKS; print('SELF_TEST=PASS'); return 0
    if args.manifest is None: ap.error('manifest is required unless --self-test is used')
    try: result=validate_manifest(args.manifest)
    except (OSError,json.JSONDecodeError) as e: print(f'CANDIDATE_GATE=FAIL\nERROR: {e}',file=sys.stderr); return 2
    if args.json_out:
        args.json_out.parent.mkdir(parents=True,exist_ok=True); args.json_out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2,sort_keys=True)); return 0 if result['status']=='PASS' else 2
if __name__=='__main__': raise SystemExit(main())
