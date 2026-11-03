"""Real apksigner password regression; synthetic ZIP, not installable-device QA."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

SDK = Path(os.environ.get('ANDROID_HOME', '/nonexistent'))
JAR = Path(os.environ.get('ANDROID_APKSIGNER_JAR', SDK / 'build-tools/36.0.0/lib/apksigner.jar'))


class ApkPasswordTest(unittest.TestCase):
    @unittest.skipUnless(JAR.is_file(), 'Android build-tools 36 apksigner.jar is required')
    def test_same_file_double_read_fails_and_pkcs12_fallback_signs(self):
        with tempfile.TemporaryDirectory(prefix='apk-password-test-') as directory:
            root = Path(directory)
            password = root / 'password'
            password.write_text('temporary-test-password-not-a-real-secret\n')
            subprocess.run(['keytool', '-genkeypair', '-keystore', str(root / 'upload.p12'),
                            '-storetype', 'PKCS12', '-storepass:file', str(password), '-alias', 'upload',
                            '-keyalg', 'RSA', '-keysize', '2048', '-validity', '2',
                            '-dname', 'CN=Disposable Password Regression', '-noprompt'],
                           check=True, capture_output=True)
            with zipfile.ZipFile(root / 'input.apk', 'w') as archive:
                archive.writestr('payload.txt', 'Synthetic signing test, not an Android application')
            args = ['java', '-jar', str(JAR), 'sign', '--min-sdk-version', '24',
                    '--ks', str(root / 'upload.p12'), '--ks-key-alias', 'upload',
                    '--ks-pass', 'file:' + str(password), '--v4-signing-enabled', 'false']
            bad = subprocess.run([*args, '--key-pass', 'file:' + str(password),
                                  '--out', str(root / 'bad.apk'), str(root / 'input.apk')],
                                 text=True, capture_output=True)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn('Failed to read', bad.stderr)
            good = subprocess.run([*args, '--out', str(root / 'good.apk'), str(root / 'input.apk')],
                                  text=True, capture_output=True)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertTrue((root / 'good.apk').is_file())
            self.assertFalse((root / 'good.apk.idsig').exists())
            # Distinct env variable names are distinct retriever sources, even for equal values.
            # This is Wordmine's configuration; unlike reusing one file, it must succeed.
            env_args = ['java', '-jar', str(JAR), 'sign', '--min-sdk-version', '24',
                        '--ks', str(root / 'upload.p12'), '--ks-key-alias', 'upload',
                        '--ks-pass', 'env:TEST_STORE_PASSWORD', '--key-pass', 'env:TEST_KEY_PASSWORD',
                        '--v4-signing-enabled', 'false', '--out', str(root / 'env.apk'), str(root / 'input.apk')]
            env = {**os.environ, 'TEST_STORE_PASSWORD': password.read_text().strip(),
                   'TEST_KEY_PASSWORD': password.read_text().strip()}
            separate_env = subprocess.run(env_args, env=env, text=True, capture_output=True)
            self.assertEqual(separate_env.returncode, 0, separate_env.stderr)
