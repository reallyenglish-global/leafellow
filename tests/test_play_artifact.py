"""Synthetic XML/ELF negative controls, not native-device acceptance evidence."""
import importlib.util
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('artifact', ROOT / 'scripts/verify-play-artifact.py')
assert spec is not None and spec.loader is not None
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)

XML = '''<manifest xmlns:android="http://schemas.android.com/apk/res/android"
 package="com.reallyenglish.example" android:versionCode="42" android:versionName="0.1.0">
 <uses-sdk android:targetSdkVersion="36"/><application android:debuggable="false"/>
 <uses-permission android:name="android.permission.INTERNET"/></manifest>'''


class ArtifactTest(unittest.TestCase):
    def check(self, xml=XML, code='42', version='0.1.0'):
        return artifact.check_manifest(xml, 'com.reallyenglish.example', code, version)

    def test_identity_version_and_permissions(self):
        result = self.check()
        self.assertEqual(result['targetSdkVersion'], 36)
        self.assertEqual(result['permissions'], ['android.permission.INTERNET'])

    def test_rejects_wrong_package_and_versions(self):
        for xml in [XML.replace('.example', '.prototype'), XML.replace('versionCode="42"', 'versionCode="43"'),
                    XML.replace('versionName="0.1.0"', 'versionName="0.2.0"')]:
            with self.subTest(xml=xml), self.assertRaises(ValueError):
                self.check(xml)

    def test_rejects_debug_test_only_missing_app_and_old_sdk(self):
        for xml in [XML.replace('debuggable="false"', 'debuggable="true"'),
                    XML.replace('debuggable="false"', 'testOnly="1"'),
                    XML.replace('debuggable="false"', 'debuggable="@bool/debug"'),
                    XML.replace('<application android:debuggable="false"/>', ''),
                    XML.replace('targetSdkVersion="36"', 'targetSdkVersion="35"')]:
            with self.subTest(xml=xml), self.assertRaises(ValueError):
                self.check(xml)

    def test_version_code_is_not_a_shell_fragment_or_invalid_integer(self):
        for code in ['0', '01', '-1', '1;exit 0', '2100000001', '1.0', '']:
            with self.subTest(code=code), self.assertRaises(ValueError):
                self.check(code=code)

    def test_manifest_is_parsed_as_xml_not_regex(self):
        self.assertEqual(self.check(XML.replace('"', "'"))['versionCode'], 42)
        with self.assertRaises(Exception):
            self.check('<manifest')

    def elf(self, alignment=16384, offset=0, vaddr=0):
        data = bytearray(120)
        data[:6] = b'\x7fELF\x02\x01'
        struct.pack_into('<Q', data, 32, 64)
        struct.pack_into('<HH', data, 54, 56, 1)
        struct.pack_into('<IIQQQQQQ', data, 64, 1, 5, offset, vaddr, 0, 1, 1, alignment)
        return bytes(data)

    def test_elf_load_alignment_and_offset_are_16kb_compatible(self):
        artifact.check_elf(self.elf())
        for data in [self.elf(4096), self.elf(offset=4096), self.elf()[:80], b'not ELF']:
            with self.subTest(data=data[:10]), self.assertRaises(ValueError):
                artifact.check_elf(data)


if __name__ == '__main__':
    unittest.main()
