# SPDX-License-Identifier: Apache-2.0
"""Layout wiring regression only; hosted native acceptance proves EPUB behavior."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ReaderLayoutTests(unittest.TestCase):
    def test_reader_frame_owns_remaining_space(self):
        source = (ROOT / 'apps/mobile/src/app/index.tsx').read_text()
        match = re.search(r'readerFrame: \{([^}]+)\}', source)
        assert match is not None
        style = match.group(1)
        self.assertIn('flex: 1', style)
        self.assertIn('minHeight: 0', style)
        self.assertIn("overflow: 'hidden'", style)

    def test_reader_waits_for_measured_space_not_window_estimates(self):
        source = (ROOT / 'apps/mobile/src/app/index.tsx').read_text()
        reader = source.split('function ReaderSurface(', 1)[1].split('function ReaderScreen(', 1)[0]
        self.assertIn('onLayout={handleReaderLayout}', reader)
        self.assertIn('readerSize.width > 0 && readerSize.height > 0', reader)
        self.assertIn('width={readerSize.width}', reader)
        self.assertIn('height={readerSize.height}', reader)
        self.assertNotIn('Math.max(240', reader)
        self.assertNotIn('useWindowDimensions', reader)
        # Resizing changes props, not reader identity or its persisted initial CFI.
        self.assertIn('key={book.id}', reader)
        self.assertIn('initialLocation={book.resumeCfi ?? undefined}', reader)


if __name__ == '__main__':
    unittest.main()
