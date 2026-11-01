# SPDX-License-Identifier: Apache-2.0
"""Host-only tests for the Android acceptance tooling.

These cover the fixture generator, the export checker and the device-run wrapper's argument and
exit-code handling with fake adb/maestro. They are NOT native acceptance evidence: nothing here
runs an emulator, the Release APK, the system pickers or a real long press.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'
WRAPPER = SCRIPTS / 'android-acceptance-run.sh'


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fixture = load('android_fixture_epub')
export_check = load('android_export_check')
CFI = 'epubcfi(/6/2!/4/4,/1:0,/1:8)'


def valid_export(sha, quote='Luminous', **overrides):
    hid = 'hl_' + 'a' * 32
    annotation = {
        'id': hid, 'documentId': f'sha256:{sha}',
        'quote': {'exact': quote, 'prefix': '', 'suffix': ''},
        'anchor': {'format': 'epub', 'href': 'chapter.xhtml', 'cfi': CFI},
        'note': '', 'schemaVersion': 1, 'visibility': 'private',
    }
    annotation.update(overrides)
    envelope = {'format': 'leafellow.highlights', 'formatVersion': 1, 'source': {'documentId': f'sha256:{sha}'},
                'count': 1, 'highlights': [{'id': hid, 'createdAt': 1800000000000, 'annotation': annotation}]}
    return json.dumps(envelope, indent=2) + '\n'


class FixtureTests(unittest.TestCase):
    def test_generator_is_deterministic_and_matches_pin(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            first = fixture.build(Path(a) / fixture.FIXTURE_NAME)
            second = fixture.build(Path(b) / fixture.FIXTURE_NAME)
            self.assertEqual(first, second)
            self.assertEqual((Path(a) / fixture.FIXTURE_NAME).read_bytes(), (Path(b) / fixture.FIXTURE_NAME).read_bytes())
            self.assertEqual(first, fixture.FIXTURE_SHA256)

    def test_archive_layout_is_a_stored_epub_with_fixed_times(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / fixture.FIXTURE_NAME
            fixture.build(path)
            self.assertLess(path.stat().st_size, 2 * 1024 * 1024)
            with zipfile.ZipFile(path) as archive:
                infos = archive.infolist()
                self.assertEqual(infos[0].filename, 'mimetype')
                self.assertEqual(archive.read('mimetype'), b'application/epub+zip')
                for info in infos:
                    self.assertEqual(info.compress_type, zipfile.ZIP_STORED, info.filename)
                    self.assertEqual(info.date_time, fixture.FIXED_DATE, info.filename)
                chapter = archive.read('OEBPS/chapter.xhtml').decode()
            self.assertEqual(chapter.count(fixture.TARGET_WORD), 1)
            self.assertIn(f'<p class="target">{fixture.TARGET_WORD}</p>', chapter)
            self.assertNotIn('<script', chapter.lower())

    def test_cli_writes_fixture_and_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run([sys.executable, str(SCRIPTS / 'android_fixture_epub.py'), tmp],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            meta = json.loads((Path(tmp) / 'leafellow-fixture.json').read_text())
            digest = hashlib.sha256((Path(tmp) / fixture.FIXTURE_NAME).read_bytes()).hexdigest()
            self.assertEqual(meta, {'fileName': fixture.FIXTURE_NAME, 'sha256': digest,
                                    'documentId': f'sha256:{digest}', 'targetQuote': 'Luminous',
                                    'license': 'CC0-1.0'})


class ExportCheckTests(unittest.TestCase):
    sha = 'b' * 64
    meta = {'sha256': 'b' * 64, 'targetQuote': 'Luminous'}

    def write(self, directory, text, name=None):
        name = name or f'leafellow-highlights-{self.sha[:12]}-abc123.json'
        (Path(directory) / name).write_text(text)

    def test_accepts_exact_single_private_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write(tmp, valid_export(self.sha))
            summary = export_check.check_export(Path(tmp), self.meta)
            self.assertEqual(summary['quote'], 'Luminous')
            self.assertEqual(summary['cfi'], CFI)

    def test_rejects_missing_empty_or_extra_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(export_check.ExportCheckError):
                export_check.check_export(Path(tmp) / 'absent', self.meta)
            with self.assertRaises(export_check.ExportCheckError):
                export_check.check_export(Path(tmp), self.meta)
            self.write(tmp, valid_export(self.sha))
            self.write(tmp, valid_export(self.sha), f'leafellow-highlights-{self.sha[:12]}-zzz.json')
            with self.assertRaises(export_check.ExportCheckError):
                export_check.check_export(Path(tmp), self.meta)

    def test_rejects_wrong_shape(self):
        cases = [
            valid_export('c' * 64),
            valid_export(self.sha, quote='Luminous '),
            valid_export(self.sha, visibility='shared'),
            valid_export(self.sha, anchor={'format': 'epub', 'href': 'chapter.xhtml', 'cfi': 'epubcfi(/6/2!/4/4/1:0)'}),
            valid_export(self.sha).replace('"count": 1', '"count": 2'),
            valid_export(self.sha).rstrip('\n'),
            '{"format": "leafellow.highlights"}\n',
            'not json\n',
        ]
        for text in cases:
            with self.subTest(text=text[:60]), tempfile.TemporaryDirectory() as tmp:
                self.write(tmp, text)
                with self.assertRaises(export_check.ExportCheckError):
                    export_check.check_export(Path(tmp), self.meta)

    def test_rejects_unexpected_file_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write(tmp, valid_export(self.sha), 'export.json')
            with self.assertRaises(export_check.ExportCheckError):
                export_check.check_export(Path(tmp), self.meta)


FAKE_ADB = r'''#!/usr/bin/env bash
echo "adb $*" >> "$FAKE_LOG"
case "$1" in
  install) exit "${FAKE_INSTALL_RC:-0}" ;;
  logcat) if [[ -n "${FAKE_HANG_LOGCAT:-}" ]]; then sleep 30; fi; echo "fake logcat"; exit "${FAKE_LOGCAT_RC:-0}" ;;
  pull)
    if [[ "$2" == */LeafellowExports/. ]]; then
      [[ -n "${FAKE_EXPORT_SRC:-}" ]] && cp "$FAKE_EXPORT_SRC"/* "$3"/ 2>/dev/null
      exit "${FAKE_PULL_RC:-0}"
    fi
    echo "<hierarchy/>" > "$3" ;;
  shell)
    case "$2" in
      settings) echo "Pixel 6" ;;
      getprop) if [[ "$3" == "ro.kernel.qemu" ]]; then echo "${FAKE_QEMU:-1}"; else echo "sdk_gphone64_x86_64"; fi ;;
    esac ;;
esac
exit 0
'''
FAKE_MAESTRO = r'''#!/usr/bin/env bash
echo "maestro $*" >> "$FAKE_LOG"
exit "${FAKE_MAESTRO_RC:-0}"
'''


class WrapperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.bin = root / 'bin'
        self.bin.mkdir()
        for name, body in (('adb', FAKE_ADB), ('maestro', FAKE_MAESTRO)):
            (self.bin / name).write_text(body)
            (self.bin / name).chmod(0o755)
        self.fixture_dir = root / 'fixture'
        self.assertEqual(subprocess.run([sys.executable, str(SCRIPTS / 'android_fixture_epub.py'), str(self.fixture_dir)],
                                        capture_output=True).returncode, 0)
        self.sha = json.loads((self.fixture_dir / 'leafellow-fixture.json').read_text())['sha256']
        self.apk = root / 'app-release.apk'
        self.apk.write_bytes(b'fake apk')
        self.flow = root / 'flow.yaml'
        self.flow.write_text('appId: x\n')
        self.out = root / 'out'
        self.exports = root / 'exports'
        self.exports.mkdir()
        (self.exports / f'leafellow-highlights-{self.sha[:12]}-abc123.json').write_text(valid_export(self.sha))
        self.log = root / 'calls.log'

    def run_wrapper(self, *extra, args=None, **env):
        full_env = {**os.environ, 'PATH': f'{self.bin}{os.pathsep}{os.environ["PATH"]}', 'FAKE_LOG': str(self.log),
                    'FAKE_EXPORT_SRC': str(self.exports), 'ADB_TIMEOUT': '5', 'DIAG_TIMEOUT': '2', **env}
        argv = args if args is not None else ['--apk', str(self.apk), '--fixture-dir', str(self.fixture_dir),
                                               '--flow', str(self.flow), '--out', str(self.out), *extra]
        return subprocess.run(['bash', str(WRAPPER), *argv], env=full_env, capture_output=True, text=True, timeout=60)

    def calls(self):
        return self.log.read_text().splitlines() if self.log.exists() else []

    def status(self):
        return dict(line.split('=', 1) for line in (self.out / 'status.txt').read_text().splitlines())

    def test_success_passes_maestro_evidence_flags_and_checks_export(self):
        result = self.run_wrapper()
        self.assertEqual(result.returncode, 0, result.stderr)
        maestro = [c for c in self.calls() if c.startswith('maestro ')]
        self.assertEqual(len(maestro), 1)
        for flag in ('--format junit', f'--output {self.out}/junit.xml', f'--test-output-dir {self.out}/maestro',
                     f'--debug-output {self.out}/maestro-debug', '-e APP_ID=com.anonymous.leafellow',
                     '-e STORAGE_ROOT=Internal storage|Pixel 6|sdk_gphone64_x86_64'):
            self.assertIn(flag, maestro[0])
        self.assertIn('adb push', '\n'.join(self.calls()))
        self.assertTrue(any('MEDIA_SCANNER_SCAN_FILE' in c for c in self.calls()))
        self.assertEqual(self.status()['final'], '0')
        self.assertIn('"exportCheck": "passed"', (self.out / 'export-check.json').read_text())
        self.assertTrue((self.out / 'diagnostics' / 'logcat.txt').exists())
        self.assertTrue((self.out / 'diagnostics' / 'window.xml').exists())

    def test_refuses_physical_device_before_install_or_storage_writes(self):
        result = self.run_wrapper(FAKE_QEMU='0')
        self.assertEqual(result.returncode, 3, result.stderr)
        calls = '\n'.join(self.calls())
        self.assertNotIn('adb install', calls)
        self.assertNotIn('adb push', calls)
        self.assertNotIn('adb shell rm', calls)
        self.assertFalse(any(c.startswith('maestro ') for c in self.calls()))

    def test_no_recursive_storage_deletion(self):
        result = self.run_wrapper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any('shell rm' in c for c in self.calls()))

    def test_install_failure_propagates_and_skips_maestro(self):
        result = self.run_wrapper(FAKE_INSTALL_RC='7')
        self.assertEqual(result.returncode, 7)
        self.assertFalse(any(c.startswith('maestro ') for c in self.calls()))
        self.assertTrue(any(c.startswith('adb logcat') for c in self.calls()))

    def test_maestro_failure_propagates_after_export_check_and_diagnostics(self):
        result = self.run_wrapper(FAKE_MAESTRO_RC='4')
        self.assertEqual(result.returncode, 4)
        self.assertEqual(self.status()['maestro'], '4')
        self.assertEqual(self.status()['export-check'], '0')
        self.assertTrue(any(c.startswith('adb exec-out screencap') for c in self.calls()))

    def test_missing_export_fails_even_when_maestro_passes(self):
        for item in self.exports.iterdir():
            item.unlink()
        result = self.run_wrapper()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.status()['export-check'], '1')

    def test_pull_failure_propagates(self):
        result = self.run_wrapper(FAKE_PULL_RC='5')
        self.assertEqual(result.returncode, 5)

    def test_diagnostic_failure_or_hang_does_not_change_outcome(self):
        started = time.monotonic()
        result = self.run_wrapper(FAKE_HANG_LOGCAT='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(time.monotonic() - started, 25)
        self.assertIn('logcat failed', (self.out / 'diagnostics' / 'errors.txt').read_text())
        result = self.run_wrapper(FAKE_LOGCAT_RC='9')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_fixture_mismatch_fails_before_touching_the_device(self):
        (self.fixture_dir / 'leafellow-fixture.epub').write_bytes(b'tampered')
        result = self.run_wrapper()
        self.assertEqual(result.returncode, 3)
        self.assertEqual(self.calls(), [])

    def test_bad_arguments_exit_2(self):
        self.assertEqual(self.run_wrapper(args=['--apk']).returncode, 2)
        self.assertEqual(self.run_wrapper(args=['--bogus', 'x']).returncode, 2)


if __name__ == '__main__':
    unittest.main()
