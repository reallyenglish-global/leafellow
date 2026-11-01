# SPDX-License-Identifier: Apache-2.0
"""Host policy regression for real zero-area WebView nodes; not native acceptance evidence.

Run 41313612875's failed hierarchy retained Luminous at [89,184][992,184] even while
its screenshot visibly showed paragraphs 7-10. Maestro 2.12 Filters.sizeMatches uses
abs(actual_height - height) <= tolerance, so height=1000/tolerance=999 excludes zero.
The Pixel 6 fixture's single word and paragraph nodes fit the resulting 1..1999px range.
Actual gesture/visibility/persistence/export acceptance remains a hosted-emulator gate.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class NativeVisibilityPolicyTests(unittest.TestCase):
    def test_all_target_checks_require_positive_area_including_initial_and_return(self):
        flow = (ROOT / 'e2e/android/reader-acceptance.yaml').read_text()
        matches = re.findall(r'(?:text|visible): "Luminous"\n\s+height: (\d+)\n\s+tolerance: (\d+)', flow)
        self.assertEqual(matches, [('1000', '999')] * 4)
        self.assertEqual(flow.count('- assertNotVisible:\n    text: "Luminous"'), 2)

    def test_resume_wait_requires_a_positive_height_rendered_paragraph(self):
        flow = (ROOT / 'e2e/android/reader-acceptance.yaml').read_text()
        self.assertIn('text: "Paragraph [0-9]+ of the acceptance chapter.*"\n      height: 1000\n      tolerance: 999', flow)

    def test_captured_zero_height_node_is_not_an_on_screen_word(self):
        # Exact historical zero-area bounds from the real failed Maestro hierarchy.
        left, top, right, bottom = 89, 184, 992, 184
        self.assertGreater(right - left, 0)
        self.assertGreater(abs((bottom - top) - 1000), 999)
        # Real visible paragraph 7 occupied [89,344][992,777].
        self.assertLessEqual(abs((777 - 344) - 1000), 999)


if __name__ == '__main__':
    unittest.main()
