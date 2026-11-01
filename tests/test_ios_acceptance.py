# SPDX-License-Identifier: Apache-2.0
"""Host-only orchestration and policy tests; no iOS runtime acceptance claim."""
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import ios_acceptance as ios
import ios_app_artifact as artifact
from test_android_acceptance import valid_export

UDID = '12345678-1234-1234-1234-123456789ABC'


class IOSAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.fixture = self.root / 'fixture'
        subprocess.run([sys.executable, str(ROOT / 'scripts/android_fixture_epub.py'), str(self.fixture)], check=True, capture_output=True)
        self.sha = json.loads((self.fixture / 'leafellow-fixture.json').read_text())['sha256']
        self.app = self.root / 'Leafellow.app'
        self.app.mkdir()
        (self.app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': ios.APP_ID}))
        self.container = self.root / 'shelf-data'
        self.container.mkdir()
        self.out = self.root / 'out'
        self.args = ios.parse_args(['--app', str(self.app), '--fixture-dir', str(self.fixture),
                                   '--simulator', UDID, '--simulator-name', 'LeafellowAcceptance-123-1', '--out', str(self.out)])
        self.calls = []

    def devices(self, **overrides):
        return {'devices': {ios.RUNTIME: [dict(udid=UDID, name='LeafellowAcceptance-123-1',
                                               state='Booted', isAvailable=True, **overrides)]}}

    def fake_command(self, command, **kwargs):
        self.calls.append(command)
        if command[:5] == ['xcrun', 'simctl', 'list', 'devices', '--json']:
            return json.dumps(self.devices())
        if 'get_app_container' in command:
            self.assertIn(ios.SHELF_ID, command)
            return str(self.container)
        if command[0] == 'maestro':
            target = self.container / 'Documents' / 'LeafellowExports'
            (target / f'leafellow-highlights-{self.sha[:12]}-abc123.json').write_text(valid_export(self.sha))
        return ''

    def run_harness(self, failure=None):
        def invoke(command, **kwargs):
            if failure and failure[0](command):
                raise subprocess.CalledProcessError(failure[1], command)
            return self.fake_command(command, **kwargs)
        with patch.object(ios, 'command', side_effect=invoke), patch.object(ios, 'build_shelf') as build:
            build.return_value = self.root / 'FixtureShelf.app'
            rc = ios.run(self.args)
        return rc

    def test_success_uses_real_picker_flow_and_validates_export(self):
        self.assertEqual(self.run_harness(), 0)
        self.assertEqual((self.container / 'Documents/leafellow-fixture.epub').read_bytes(),
                         (self.fixture / 'leafellow-fixture.epub').read_bytes())
        maestro = next(c for c in self.calls if c[0] == 'maestro')
        self.assertEqual(maestro[:3], ['maestro', '--device', UDID])
        for flag in ('--format', '--output', '--test-output-dir', '--debug-output'):
            self.assertIn(flag, maestro)
        self.assertEqual(json.loads((self.out / 'status.json').read_text())['final'], 0)
        self.assertEqual(json.loads((self.out / 'export-check.json').read_text())['exportCheck'], 'passed')
        self.assertTrue(any('screenshot' in c for c in self.calls))

    def test_wrong_fixture_hash_fails_before_any_simulator_access(self):
        (self.fixture / 'leafellow-fixture.epub').write_bytes(b'wrong bytes')
        self.assertEqual(self.run_harness(), 3)
        self.assertEqual(self.calls, [])

    def test_refuses_shared_documents_on_leafellow(self):
        (self.app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': ios.APP_ID, 'UIFileSharingEnabled': True}))
        self.assertEqual(self.run_harness(), 3)
        self.assertEqual(self.calls, [])

    def test_refuses_wrong_app_identity(self):
        (self.app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'other.app'}))
        self.assertEqual(self.run_harness(), 3)
        self.assertEqual(self.calls, [])

    def test_only_disposable_booted_pinned_simulator_is_accepted(self):
        ios.validate_simulator(self.devices(), UDID, "LeafellowAcceptance-123-1")
        for field, value in [('name', 'Personal iPhone'), ('state', 'Shutdown'), ('isAvailable', False)]:
            data = self.devices()
            data['devices'][ios.RUNTIME][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                ios.validate_simulator(data, UDID, "LeafellowAcceptance-123-1")
        with self.assertRaises(ValueError):
            ios.validate_simulator({'devices': {'other-runtime': self.devices()['devices'][ios.RUNTIME]}}, UDID, 'LeafellowAcceptance-123-1')
        with self.assertRaises(ValueError):
            ios.validate_simulator(self.devices(), 'booted', 'LeafellowAcceptance-123-1')
        with self.assertRaises(ValueError):
            ios.validate_simulator(self.devices(), UDID, 'LeafellowAcceptance-999-1')

    def test_install_failure_is_preserved_and_maestro_is_not_called(self):
        self.assertEqual(self.run_harness((lambda c: c[:3] == ['xcrun', 'simctl', 'install'], 7)), 7)
        self.assertFalse(any(c[0] == 'maestro' for c in self.calls))
        self.assertTrue(any('screenshot' in c for c in self.calls))

    def test_maestro_failure_is_not_hidden_by_later_diagnostics_or_export(self):
        self.assertEqual(self.run_harness((lambda c: c[0] == 'maestro', 9)), 9)
        self.assertEqual(json.loads((self.out / 'status.json').read_text())['final'], 9)
        self.assertTrue(any('screenshot' in c for c in self.calls))

    def test_missing_export_fails_even_when_ui_driver_passes(self):
        original = self.fake_command
        def no_export(command, **kwargs):
            if command[0] == 'maestro':
                self.calls.append(command)
                return ''
            return original(command, **kwargs)
        with patch.object(ios, 'command', side_effect=no_export), patch.object(ios, 'build_shelf', return_value=self.root / 'FixtureShelf.app'):
            self.assertEqual(ios.run(self.args), 3)
        self.assertNotEqual(json.loads((self.out / 'status.json').read_text())['final'], 0)

    def test_staging_never_overwrites_existing_fixture(self):
        docs = self.container / 'Documents'
        docs.mkdir()
        (docs / 'leafellow-fixture.epub').write_bytes(b'existing')
        self.assertEqual(self.run_harness(), 3)
        self.assertEqual((docs / 'leafellow-fixture.epub').read_bytes(), b'existing')

    def test_wrong_run_simulator_is_refused_before_install_or_diagnostics(self):
        self.args.simulator_name = 'LeafellowAcceptance-999-1'
        self.assertEqual(self.run_harness(), 3)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][:5], ['xcrun', 'simctl', 'list', 'devices', '--json'])

    def test_diagnostic_failure_does_not_change_a_pass(self):
        self.assertEqual(self.run_harness((lambda c: 'screenshot' in c, 8)), 0)
        status = json.loads((self.out / 'status.json').read_text())
        self.assertEqual(status['final'], 0)
        self.assertIn('diagnostics-screen', status)

    def test_command_timeout_has_bounded_failure(self):
        with tempfile.TemporaryDirectory() as out:
            log = Path(out) / 'timeout.log'
            with self.assertRaises(subprocess.TimeoutExpired):
                ios.command([sys.executable, '-c', 'import time; print("before-timeout", flush=True); time.sleep(5)'], timeout=0.2, log=log)
            self.assertIn('\nbefore-timeout\n', log.read_text())


class IOSArtifactTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.zip = self.folder / artifact.NAME
        # Deliberately dummy bytes: these tests validate artifact admission, not native builds.
        self.zip.write_bytes(b'host checksum test only')
        self.sha = 'a' * 40
        artifact.record(self.folder, self.sha, '123', '1')

    def test_exact_head_and_run_verify(self):
        self.assertEqual(artifact.verify(self.folder, self.sha, '123')['checkoutSha'], self.sha)

    def test_wrong_source_and_run_are_rejected(self):
        for sha, run in [('b' * 40, '123'), (self.sha, '124'), ('main', '123')]:
            with self.subTest(sha=sha, run=run), self.assertRaises(ValueError):
                artifact.verify(self.folder, sha, run)

    def test_tampered_zip_is_rejected(self):
        self.zip.write_bytes(b'tampered')
        with self.assertRaises(ValueError):
            artifact.verify(self.folder, self.sha, '123')

    def test_tampered_checksum_file_is_rejected(self):
        (self.folder / f'{artifact.NAME}.sha256').write_text('incorrect')
        with self.assertRaises(ValueError):
            artifact.verify(self.folder, self.sha, '123')

    def test_missing_artifact_is_a_real_cli_failure(self):
        self.zip.unlink()
        self.assertEqual(artifact.main(['verify', str(self.folder), '--sha', self.sha, '--run-id', '123']), 1)


class IOSPolicyTests(unittest.TestCase):
    def test_picker_navigation_waits_before_conditions_and_is_idempotent(self):
        helper = (ROOT / 'e2e/ios/open-fixture-shelf.yaml').read_text()
        self.assertIn('visible: "Search"', helper)
        self.assertLess(helper.index('- extendedWaitUntil:'), helper.index('- runFlow:'))
        self.assertNotIn('notVisible:', helper)
        self.assertNotIn('- tapOn: "FixtureShelf"', helper)
        self.assertIn('text: "FixtureShelf"\n          below: "Search"', helper)
        self.assertIn('text: "LeafellowExports"\n        above: "Search"', helper)
        # Maestro 2.12 Filters.below compares top Y; model only, not native bounds.
        search_y, title_y, row_y = 120, 60, 200
        self.assertFalse(title_y > search_y)
        self.assertTrue(row_y > search_y)
        for filename in ('pick-fixture.yaml', 'pick-export-folder.yaml'):
            text = (ROOT / 'e2e/ios' / filename).read_text()
            self.assertIn('PICKER_CHILD:', text)
            self.assertNotIn('when:', text)

    def test_flow_keeps_lifecycle_privacy_and_real_file_selection(self):
        flow = (ROOT / 'e2e/ios/reader-acceptance.yaml').read_text()
        for value in ('stopApp', 'clearState: false', 'id: "reader-back"', 'id: "highlight-go-to"',
                      'id: "export-acknowledge"', 'id: "highlight-delete"', 'reader-resumed-away',
                      'reader-returned-to-passage', 'Paragraph [0-9]+', 'above:', 'assertNotVisible:'):
            self.assertIn(value, flow)
        self.assertEqual(flow.count('- runFlow: pick-fixture.yaml'), 3)
        self.assertNotIn('optional:', flow)
        self.assertNotIn('clearState: true', flow)

    def test_native_workflow_is_opt_in_and_reuses_build_artifact(self):
        text = (ROOT / '.github/workflows/ios.yml').read_text()
        for value in ('workflow_dispatch:', 'reader_acceptance:', "github.event_name == 'workflow_dispatch'",
                      'inputs.reader_acceptance', 'needs: ios', 'actions/download-artifact@',
                      'scripts/ios_acceptance.py', 'scripts/ios_app_artifact.py verify',
                      'if: always()', 'sha256', 'Xcode_26.6.app'):
            self.assertIn(value, text)
        self.assertNotIn('contents: write', text)
        self.assertNotIn('secrets.', text)

    def test_fixture_shelf_alone_is_shared_and_not_a_production_plugin_change(self):
        config = json.loads((ROOT / 'apps/mobile/app.json').read_text())
        self.assertNotIn('UIFileSharingEnabled', config['expo']['ios'])
        self.assertNotIn('enableFileSharing', json.dumps(config))
        plist = plistlib.loads((ROOT / 'e2e/ios/FixtureShelf-Info.plist').read_bytes())
        self.assertTrue(plist['UIFileSharingEnabled'])
        self.assertEqual(plist['CFBundleIdentifier'], ios.SHELF_ID)


if __name__ == '__main__':
    unittest.main()
