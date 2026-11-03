"""Real JDK signing controls with disposable keys, never production credentials."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('verify', ROOT / 'scripts/verify-upload-signature.py')
assert spec and spec.loader
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class UploadSignatureTest(unittest.TestCase):
    def test_real_signed_unsigned_injected_and_wrong_signer(self):
        with tempfile.TemporaryDirectory(prefix='leafellow-signature-test-') as directory:
            root = Path(directory)
            (root / 'password').write_text('temporary-test-password-not-a-real-secret\n')
            env = {'LEAFELLOW_UPLOAD_KEYSTORE': str(root / 'expected.p12'),
                   'LEAFELLOW_UPLOAD_PASSWORD_FILE': str(root / 'password')}
            with patch.dict(os.environ, env):
                for name in ['expected', 'other']:
                    subprocess.run(['keytool', '-genkeypair', '-keystore', str(root / (name + '.p12')),
                                    '-storetype', 'PKCS12', '-storepass:file', str(root / 'password'),
                                    '-alias', 'leafellow-upload', '-keyalg', 'RSA', '-keysize', '2048',
                                    '-validity', '2', '-dname', 'CN=Temporary Test', '-noprompt'],
                                   check=True, capture_output=True)
                with zipfile.ZipFile(root / 'unsigned.jar', 'w') as archive:
                    archive.writestr('payload.txt', 'test data')
                for name, key in [('signed', 'expected'), ('wrong', 'other')]:
                    shutil.copyfile(root / 'unsigned.jar', root / (name + '.jar'))
                    subprocess.run(['jarsigner', '-keystore', str(root / (key + '.p12')),
                                    '-storepass:file', str(root / 'password'), str(root / (name + '.jar')),
                                    'leafellow-upload'], check=True, capture_output=True)
                verifier.verify(str(root / 'signed.jar'))
                shutil.copyfile(root / 'signed.jar', root / 'injected.jar')
                with zipfile.ZipFile(root / 'injected.jar', 'a') as archive:
                    archive.writestr('unsigned-injection.txt', 'test data')
                for name in ['unsigned', 'injected', 'wrong']:
                    with self.subTest(name=name), self.assertRaises((SystemExit, subprocess.CalledProcessError)):
                        verifier.verify(str(root / (name + '.jar')))
