"""Credential-free release configuration checks; not native build evidence."""
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AndroidReleaseTest(unittest.TestCase):
    def test_permanent_identity_and_initial_version(self):
        android = json.loads((ROOT / 'apps/mobile/app.json').read_text())['expo']['android']
        self.assertEqual(android['package'], 'com.reallyenglish.leafellow')
        self.assertIs(type(android['versionCode']), int)
        self.assertGreater(android['versionCode'], 0)

    def test_acceptance_uses_release_identity(self):
        runner = (ROOT / 'scripts/android-acceptance-run.sh').read_text()
        self.assertIn('APP_ID="com.reallyenglish.leafellow"', runner)

    def test_private_signing_formats_are_ignored(self):
        for name in ['test.jks', 'test.keystore', 'test.p12', 'test.pfx', 'test.password']:
            result = subprocess.run(['git', 'check-ignore', '--no-index', name], cwd=ROOT,
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, name)

    def test_build_fails_without_credentials(self):
        import os
        env = {k: v for k, v in os.environ.items() if not k.startswith('LEAFELLOW_UPLOAD_')}
        result = subprocess.run(['bash', 'scripts/android-store-build.sh'], cwd=ROOT,
                                env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('LEAFELLOW_UPLOAD_KEYSTORE', result.stderr)


if __name__ == '__main__':
    unittest.main()
