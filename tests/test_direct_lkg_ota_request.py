import unittest

from scripts.direct_lkg_ota_request import CONFIG, DEVICE, SHA256, SHA512, URL, build_request


class DirectLkgOtaRequestTests(unittest.TestCase):
    def valid(self, **changes):
        data = dict(target=DEVICE, url=URL, sha256=SHA256, sha512=SHA512,
                    manufacturer="b28wrpvx", model="TS011F-BS-PM", role="Router",
                    config=CONFIG, relay="off", load_disconnected=True,
                    authorization="issuecomment-5374905979", global_override="https://moving/index.json")
        data.update(changes)
        return build_request(**data)

    def test_dry_run_binds_direct_firmware_url_without_fallback(self):
        request = self.valid()
        self.assertEqual(request["payload"], {"id": DEVICE, "url": URL})
        self.assertFalse(request["fallback_to_global_override"])
        self.assertNotIn("index", request["payload"]["url"])

    def test_rejects_moving_or_index_urls(self):
        with self.assertRaisesRegex(ValueError, "immutable"):
            self.valid(url="https://raw.githubusercontent.com/romasku/tuya-zigbee-switch/main/index.json")

    def test_rejects_unsafe_live_state(self):
        with self.assertRaisesRegex(ValueError, "relay"):
            self.valid(relay="on")


if __name__ == "__main__":
    unittest.main()
