import hashlib
import tempfile
import unittest
from pathlib import Path

from scripts.metering_candidate_gate import sha256_lf_text_file


class MeteringCandidateGateTests(unittest.TestCase):
    def test_reviewed_text_hash_is_stable_across_checkout_line_endings(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            lf = root / "tool-lf.py"
            crlf = root / "tool-crlf.py"
            lf.write_bytes(b"first\nsecond\n")
            crlf.write_bytes(b"first\r\nsecond\r\n")

            expected = hashlib.sha256(lf.read_bytes()).hexdigest()
            self.assertEqual(sha256_lf_text_file(lf), expected)
            self.assertEqual(sha256_lf_text_file(crlf), expected)


if __name__ == "__main__":
    unittest.main()
