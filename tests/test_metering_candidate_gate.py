import hashlib
import tempfile
import unittest
from pathlib import Path

from scripts.metering_candidate_gate import EXPECTED_OVERLAY_FILES, exact_overlay_files, sha256_lf_text_file
from scripts.metering_overlay_guard import EXPECTED_CHANGED


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

    def test_exact_four_file_overlay_passes(self):
        self.assertTrue(exact_overlay_files(EXPECTED_OVERLAY_FILES))

    def test_missing_overlay_file_fails(self):
        self.assertFalse(exact_overlay_files(EXPECTED_OVERLAY_FILES[:-1]))

    def test_extra_overlay_file_fails(self):
        self.assertFalse(exact_overlay_files(EXPECTED_OVERLAY_FILES + ["unexpected.c"]))

    def test_candidate_list_stays_synchronized_with_overlay_guard(self):
        self.assertEqual(sorted(EXPECTED_OVERLAY_FILES), sorted(EXPECTED_CHANGED))


if __name__ == "__main__":
    unittest.main()
