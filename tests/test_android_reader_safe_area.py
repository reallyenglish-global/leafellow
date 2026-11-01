# SPDX-License-Identifier: Apache-2.0
"""Flow-policy check for the Android reader acceptance flow, not native safe-area acceptance.

The reader's header inset and frame layout are covered by the component tests in
apps/mobile/src/reader/__tests__. The hosted flow must still prove a normal tap on the
Library button closes the reader and returns to the home screen.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ReaderSafeAreaPolicyTests(unittest.TestCase):
    def test_flow_preserves_normal_library_tap_and_home_assertion(self):
        flow = (ROOT / 'e2e/android/reader-acceptance.yaml').read_text()
        self.assertIn('- tapOn:\n    id: "reader-back"\n- extendedWaitUntil:\n    visible:\n      id: "open-epub"', flow)


if __name__ == '__main__':
    unittest.main()
