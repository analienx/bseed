#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct, sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

OTA_MAGIC=0x0BEEF11E
BASE_FMT='<IHHHHHIH32sI'
BASE_SIZE=struct.calcsize(BASE_FMT)
FIELD_SECURITY_CREDENTIAL=0x0001
FIELD_UPGRADE_DESTINATION=0x0002
FIELD_HARDWARE_VERSIONS=0x0004

class OtaError(ValueError): pass

@dataclass(frozen=True)
class OtaHeader:
    path:str; sha256:str; file_size:int; magic:int; header_version:int; header_length:int
    field_control:int; manufacturer_code:int; image_type:int; file_version:int
    zigbee_stack_version:int; header_string:str; total_image_size:int
    security_credential_version:int|None=None; upgrade_file_destination:str|None=None
    minimum_hardware_version:int|None=None; maximum_hardware_version:int|None=None

def sha256_file(path:Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def parse_ota(path:Path)->OtaHeader:
    path=path.resolve(); data=path.read_bytes()
    if len(data)<BASE_SIZE: raise OtaError(f'file too small for Zigbee OTA header: {len(data)} bytes')
    vals=struct.unpack_from(BASE_FMT,data,0)
    magic,header_version,header_length,field_control,manufacturer_code,image_type,file_version,stack_version,raw_string,total_size=vals
    if magic!=OTA_MAGIC: raise OtaError(f'bad OTA magic 0x{magic:08X}; expected 0x{OTA_MAGIC:08X}')
    if header_length<BASE_SIZE: raise OtaError(f'header_length {header_length} < base header {BASE_SIZE}')
    if header_length>len(data): raise OtaError('header_length exceeds file size')
    if total_size!=len(data): raise OtaError(f'total_image_size {total_size} != actual file size {len(data)}')
    unknown=field_control & ~(FIELD_SECURITY_CREDENTIAL|FIELD_UPGRADE_DESTINATION|FIELD_HARDWARE_VERSIONS)
    if unknown: raise OtaError(f'unknown field_control bits 0x{unknown:04X}')
    pos=BASE_SIZE; security=destination=min_hw=max_hw=None
    if field_control&FIELD_SECURITY_CREDENTIAL:
        if pos+1>header_length: raise OtaError('truncated security credential field')
        security=data[pos]; pos+=1
    if field_control&FIELD_UPGRADE_DESTINATION:
        if pos+8>header_length: raise OtaError('truncated upgrade destination field')
        destination='0x'+data[pos:pos+8][::-1].hex(); pos+=8
    if field_control&FIELD_HARDWARE_VERSIONS:
        if pos+4>header_length: raise OtaError('truncated hardware version fields')
        min_hw,max_hw=struct.unpack_from('<HH',data,pos); pos+=4
    if pos!=header_length: raise OtaError(f'parsed header length {pos} != declared {header_length}')
    return OtaHeader(str(path),sha256_file(path),len(data),magic,header_version,header_length,field_control,
                     manufacturer_code,image_type,file_version,stack_version,raw_string.split(b'\0',1)[0].decode('utf-8','replace').rstrip(),
                     total_size,security,destination,min_hw,max_hw)

def load_json(path:Path)->dict[str,Any]: return json.loads(path.read_text(encoding='utf-8'))
def save_json(path:Path,obj:Any)->None:
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(obj,indent=2,sort_keys=True)+'\n',encoding='utf-8')

def baseline_manifest(image:Path,label:str)->dict[str,Any]:
    return {'schema_version':1,'kind':'ota_baseline','label':label,'header':asdict(parse_ota(image))}

def verify_candidate(candidate:Path,baseline:dict[str,Any],expected_manufacturer:int|None=None,expected_image_type:int|None=None)->dict[str,Any]:
    c=parse_ota(candidate)
    if 'header' not in baseline: raise OtaError('baseline manifest missing header')
    b=baseline['header']; errors=[]; warnings=[]
    for field in ('manufacturer_code','image_type','minimum_hardware_version','maximum_hardware_version','upgrade_file_destination'):
        cv=getattr(c,field); bv=b.get(field)
        if cv!=bv: errors.append(f'{field} changed: baseline={bv!r} candidate={cv!r}')
    if expected_manufacturer is not None and c.manufacturer_code!=expected_manufacturer:
        errors.append(f'manufacturer_code {c.manufacturer_code} != expected {expected_manufacturer}')
    if expected_image_type is not None and c.image_type!=expected_image_type:
        errors.append(f'image_type {c.image_type} != expected {expected_image_type}')
    bv=int(b.get('file_version',0))
    if c.file_version==bv: warnings.append('same file_version: normal Zigbee same-version update may be rejected; use only a proven forced/reinstall path')
    elif c.file_version<bv: warnings.append('candidate file_version is lower than baseline; rollback acceptance must be empirically proven')
    if c.header_version!=b.get('header_version'): warnings.append('OTA header_version changed')
    if c.zigbee_stack_version!=b.get('zigbee_stack_version'): warnings.append('zigbee_stack_version changed')
    if c.header_string!=b.get('header_string'): warnings.append('header_string changed')
    return {'schema_version':1,'kind':'ota_candidate_verification','status':'PASS' if not errors else 'FAIL',
            'candidate':asdict(c),'baseline_label':baseline.get('label'),'errors':errors,'warnings':warnings}

def main()->int:
    ap=argparse.ArgumentParser(description='Inspect and guard Zigbee OTA artifacts.'); sub=ap.add_subparsers(dest='cmd',required=True)
    p=sub.add_parser('inspect'); p.add_argument('image',type=Path); p.add_argument('--json-out',type=Path)
    p=sub.add_parser('make-baseline'); p.add_argument('image',type=Path); p.add_argument('--label',required=True); p.add_argument('--out',required=True,type=Path)
    p=sub.add_parser('verify-candidate'); p.add_argument('image',type=Path); p.add_argument('--baseline',required=True,type=Path); p.add_argument('--expected-manufacturer',type=lambda x:int(x,0)); p.add_argument('--expected-image-type',type=lambda x:int(x,0)); p.add_argument('--json-out',type=Path)
    sub.add_parser('self-test'); args=ap.parse_args()
    try:
        if args.cmd=='self-test':
            assert BASE_SIZE==56 and OTA_MAGIC==0x0BEEF11E; print('SELF_TEST=PASS'); return 0
        if args.cmd=='inspect': result=asdict(parse_ota(args.image))
        elif args.cmd=='make-baseline':
            result=baseline_manifest(args.image,args.label); save_json(args.out,result); print(f'BASELINE={args.out}'); return 0
        else: result=verify_candidate(args.image,load_json(args.baseline),args.expected_manufacturer,args.expected_image_type)
        if getattr(args,'json_out',None): save_json(args.json_out,result)
        print(json.dumps(result,indent=2,sort_keys=True)); return 0 if result.get('status','PASS')=='PASS' else 2
    except (OtaError,OSError,json.JSONDecodeError) as e:
        print(f'OTA_GUARD=FAIL\nERROR: {e}',file=sys.stderr); return 2
if __name__=='__main__': raise SystemExit(main())
