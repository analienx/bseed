import hashlib, json, struct, tempfile, unittest
from pathlib import Path

from scripts.ota_guard import BASE_FMT, BASE_SIZE, OTA_MAGIC, OtaError, baseline_manifest, parse_ota, verify_candidate
from scripts.candidate_gate import validate_manifest


def build_ota(path, manufacturer=4417, image_type=43556, version=10, field_control=0, min_hw=None, max_hw=None, payload=b'PAYLOAD'):
    optional=b''
    if field_control&1: optional+=b'\x01'
    if field_control&2: optional+=bytes.fromhex('8877665544332211')
    if field_control&4: optional+=struct.pack('<HH', min_hw or 1, max_hw or 2)
    hlen=BASE_SIZE+len(optional); total=hlen+len(payload)
    header=struct.pack(BASE_FMT, OTA_MAGIC, 0x0100, hlen, field_control, manufacturer, image_type, version, 2, b'BSEED TEST'.ljust(32,b'\0'), total)
    path.write_bytes(header+optional+payload)


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def make_candidate_case(root):
    candidate=root/'candidate.zigbee'; rollback=root/'rollback.zigbee'
    build_ota(candidate,version=11); build_ota(rollback,version=10)
    baseline=root/'baseline.json'; baseline.write_text(json.dumps(baseline_manifest(rollback,'LKG')),encoding='utf-8')
    manifest={'schema_version':1,'candidate_id':'CAND-001','source_commit':'a'*40,
              'candidate_ota':candidate.name,'candidate_sha256':sha(candidate),
              'baseline_manifest':baseline.name,'rollback_ota':rollback.name,'rollback_sha256':sha(rollback),
              'pm_default_enabled':False,'recovery_critical_changes':[],
              'offline_checks':{'build':'PASS','unit_tests':'PASS','policy_tests':'PASS'}}
    mp=root/'candidate_manifest.json'; mp.write_text(json.dumps(manifest),encoding='utf-8')
    return mp,manifest


class OtaGuardTests(unittest.TestCase):
    def test_valid_header(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'x.zigbee'; build_ota(p); h=parse_ota(p)
            self.assertEqual((h.manufacturer_code,h.image_type),(4417,43556))
    def test_bad_magic_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'x.zigbee'; build_ota(p); d=bytearray(p.read_bytes()); d[:4]=b'BAD!'; p.write_bytes(d)
            with self.assertRaises(OtaError): parse_ota(p)
    def test_size_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'x.zigbee'; build_ota(p); p.write_bytes(p.read_bytes()+b'x')
            with self.assertRaises(OtaError): parse_ota(p)
    def test_image_identity_change_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            b=Path(td)/'b.zigbee'; c=Path(td)/'c.zigbee'; build_ota(b); build_ota(c,image_type=1234,version=11)
            self.assertEqual(verify_candidate(c,baseline_manifest(b,'LKG'),4417,43556)['status'],'FAIL')
    def test_hardware_constraint_change_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            b=Path(td)/'b.zigbee'; c=Path(td)/'c.zigbee'
            build_ota(b,field_control=4,min_hw=1,max_hw=2); build_ota(c,version=11,field_control=4,min_hw=1,max_hw=3)
            self.assertEqual(verify_candidate(c,baseline_manifest(b,'LKG'),4417,43556)['status'],'FAIL')


class CandidateGateTests(unittest.TestCase):
    def test_valid_candidate(self):
        with tempfile.TemporaryDirectory() as td: self.assertEqual(validate_manifest(make_candidate_case(Path(td))[0])['status'],'PASS')
    def test_pm_default_enabled_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p,m=make_candidate_case(Path(td)); m['pm_default_enabled']=True; p.write_text(json.dumps(m),encoding='utf-8')
            self.assertEqual(validate_manifest(p)['status'],'FAIL')
    def test_recovery_surface_change_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p,m=make_candidate_case(Path(td)); m['recovery_critical_changes']=['ota_client']; p.write_text(json.dumps(m),encoding='utf-8')
            self.assertEqual(validate_manifest(p)['status'],'FAIL')
    def test_hash_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p,m=make_candidate_case(Path(td)); m['candidate_sha256']='0'*64; p.write_text(json.dumps(m),encoding='utf-8')
            self.assertEqual(validate_manifest(p)['status'],'FAIL')

if __name__=='__main__': unittest.main()
