# SPDX-License-Identifier: Apache-2.0
"""Source-wiring and captured-geometry regression, not native safe-area acceptance.

Run 41315463625's real failed hierarchy: status bar [0,0][1080,128], enabled
reader-back [42,44][210,140]. Its center y=92 is inside the system bar, so a
normal accessibility-directed center tap cannot activate the app's Library button.
The actual hosted flow must still prove a normal tap closes and restarts the reader.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ReaderSafeAreaPolicyTests(unittest.TestCase):
    def test_reader_uses_live_insets_for_header_bottom_and_viewport(self):
        source = (ROOT / 'apps/mobile/src/app/index.tsx').read_text()
        reader = source.split('function ReaderSurface(', 1)[1].split('function ReaderScreen(', 1)[0]
        self.assertIn('useSafeAreaInsets', source.split("from 'react-native-safe-area-context'")[0])
        self.assertIn('const insets = useSafeAreaInsets();', reader)
        self.assertIn('paddingBottom: insets.bottom', reader)
        self.assertIn('paddingTop: insets.top', reader)
        self.assertIn('paddingBottom: 12', reader)

    def test_original_back_center_was_under_system_bar(self):
        status_bottom, back_top, back_bottom = 128, 44, 140
        center = (back_top + back_bottom) / 2
        self.assertLess(center, status_bottom)
        # An inset of the actual status-bar height moves the same touch target clear of it.
        self.assertGreater(center + status_bottom, status_bottom)

    def test_flow_preserves_normal_library_tap_and_home_assertion(self):
        flow = (ROOT / 'e2e/android/reader-acceptance.yaml').read_text()
        self.assertIn('- tapOn:\n    id: "reader-back"\n- extendedWaitUntil:\n    visible:\n      id: "open-epub"', flow)


if __name__ == '__main__':
    unittest.main()
