# SPDX-License-Identifier: Apache-2.0
"""Host flow-policy checks, not DocumentsUI or Maestro runtime acceptance.

The API 36 folder picker captured in run 41336628339 attempt 2 opens directly
at primary storage with Documents visible and no Show roots control. The file
picker and directory picker have different navigation contracts.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ExportPickerPolicyTests(unittest.TestCase):
    def setUp(self):
        self.flow = (ROOT / 'e2e/android/pick-export-folder.yaml').read_text()

    def test_accepts_direct_root_or_documents_without_requiring_a_drawer(self):
        self.assertIn('visible: "Documents|LeafellowExports"', self.flow)
        self.assertNotIn('"Show roots"', self.flow)
        self.assertNotIn('${STORAGE_ROOT}', self.flow)

    def test_enters_documents_only_when_the_export_folder_is_not_yet_visible(self):
        self.assertIn('- runFlow:\n    when:\n      notVisible: "LeafellowExports"\n'
                      '    commands:\n      - tapOn: "Documents"', self.flow)
        self.assertLess(self.flow.index('notVisible: "LeafellowExports"'),
                        self.flow.index('- tapOn: "Documents"'))
        self.assertLess(self.flow.index('- tapOn: "Documents"'),
                        self.flow.index('- tapOn: "LeafellowExports"'))

    def test_retains_mandatory_target_and_enabled_folder_consent(self):
        self.assertIn('- extendedWaitUntil:\n    visible: "LeafellowExports"\n'
                      '    timeout: 15000', self.flow)
        self.assertIn('- tapOn:\n    text: "(?i)use this folder"\n    enabled: true', self.flow)
        self.assertIn('- tapOn: "(?i)allow"', self.flow)
        self.assertNotIn('optional:', self.flow)
        acceptance = (ROOT / 'e2e/android/reader-acceptance.yaml').read_text()
        self.assertIn('- runFlow: pick-export-folder.yaml', acceptance)
        self.assertIn('Exported 1 highlight to the folder you chose.*', acceptance)
        self.assertIn('id: "highlight-delete"', acceptance)


if __name__ == '__main__':
    unittest.main()
