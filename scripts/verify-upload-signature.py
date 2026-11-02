#!/usr/bin/env python3
"""Verify a signed JAR/AAB against the configured upload key, without logging secrets."""
import base64
import hashlib
import os
import re
import subprocess
import sys


def verify(path):
    key = os.environ['LEAFELLOW_UPLOAD_KEYSTORE']
    password = os.environ['LEAFELLOW_UPLOAD_PASSWORD_FILE']
    args = ['-keystore', key, '-storetype', 'PKCS12', '-storepass:file', password]
    expected = subprocess.check_output(['keytool', '-exportcert', *args, '-alias', 'leafellow-upload'])
    signed = subprocess.check_output(['keytool', '-printcert', '-rfc', '-jarfile', path], text=True)
    certs = re.findall(r'-----BEGIN CERTIFICATE-----\s*(.*?)\s*-----END CERTIFICATE-----', signed, re.S)
    if len(certs) != 1:
        raise SystemExit('Expected exactly one upload signer certificate')
    actual = base64.b64decode(''.join(certs[0].split()), validate=True)
    if actual != expected:
        raise SystemExit('Bundle certificate does not match the upload keystore')
    env = dict(os.environ, LC_ALL='C')
    result = subprocess.run(['jarsigner', '-J-Duser.language=en', '-verify', '-strict', *args, path],
                            env=env, capture_output=True, text=True)
    if result.returncode != 0 or 'jar verified.' not in result.stdout:
        raise SystemExit('Strict signature verification failed; inspect artifact with jarsigner')
    print('Upload signature verified; certificate SHA256=' + hashlib.sha256(actual).hexdigest())


if __name__ == '__main__':
    verify(sys.argv[1])
