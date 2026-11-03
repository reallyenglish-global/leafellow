import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class WorkflowIsolationTest(unittest.TestCase):
    def test_release_config_validates_input_and_preserves_development(self):
        env = {k: v for k, v in os.environ.items() if k != 'LEAFELLOW_ANDROID_VERSION_CODE'}
        command = ['node', '-e', 'console.log(JSON.stringify(require("./apps/mobile/app.config.js")({config:require("./apps/mobile/app.json").expo})))']
        for code in [None, '42', '0', '01', '1;echo nope', '2100000001']:
            with self.subTest(code=code):
                current = dict(env)
                if code is not None:
                    current['LEAFELLOW_ANDROID_VERSION_CODE'] = code
                p = subprocess.run(command, cwd=ROOT, env=current, capture_output=True, text=True)
                if code in (None, '42'):
                    self.assertEqual(p.returncode, 0, p.stderr)
                    self.assertEqual(json.loads(p.stdout)['android']['versionCode'], 1 if code is None else 42)
                else:
                    self.assertNotEqual(p.returncode, 0)

    def test_fresh_signing_runner_does_not_execute_dependencies_or_build_outputs(self):
        text = (ROOT / '.github/workflows/android-store-build.yml').read_text()
        build, signing = text.split('  signed-artifacts:', 1)
        self.assertNotIn('secrets.', build)
        self.assertNotIn('environment:', build)
        self.assertIn('needs: unsigned-build', signing)
        self.assertIn('environment: android-signing', signing)
        self.assertIn("if: github.ref == 'refs/heads/main'", signing)
        for forbidden in ['pnpm ', 'npm ', 'gradlew', 'setup-gradle', 'expo prebuild']:
            self.assertNotIn(forbidden, signing)
        self.assertEqual(text.count('persist-credentials: false'), 2)
        self.assertLess(signing.index('scripts/verify-play-artifact.py unsigned-artifacts/app-release.aab'), signing.index('secrets.'))
        self.assertIn('scripts/verify-play-artifact.py release-artifacts/leafellow-release.aab', signing)
        self.assertIn('--apk-manifest release-artifacts/apk-manifest.xml', signing)
        for forbidden in ['upload-google-play', 'service_account_json', 'pull_request_target']:
            self.assertNotIn(forbidden, text)

    def test_unsigned_gradle_config_has_no_debug_signer_fallback(self):
        script = (ROOT / 'scripts/android-unsigned.init.gradle').read_text()
        self.assertIn('signingConfig = null', script)
        self.assertIn('debuggable = false', script)
        self.assertNotIn('LEAFELLOW_UPLOAD_', script)
