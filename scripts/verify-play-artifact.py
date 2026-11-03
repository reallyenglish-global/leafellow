#!/usr/bin/env python3
"""Inspect actual AAB bytes on a fresh signing runner, without Gradle/npm or secrets.

Manifest/ABI/alignment evidence is not a substitute for Play processing or device QA.
The bundletool binary is independently checksum-pinned before any Java execution.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile

BUNDLETOOL_SHA256 = 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29'
ANDROID = '{http://schemas.android.com/apk/res/android}'


def check_manifest(xml, package, code, version) -> dict:
    if not code.isascii() or not code.isdecimal() or code.startswith('0') or not 1 <= int(code) <= 2100000000:
        raise ValueError('Invalid Play versionCode')
    # XML comes from pinned bundletool; reject DTD/entity declarations as defense in depth.
    if '<!DOCTYPE' in xml.upper() or '<!ENTITY' in xml.upper():
        raise ValueError('DTD/entity declarations are forbidden')
    root = ET.fromstring(xml)
    if root.tag != 'manifest' or root.get('package') != package:
        raise ValueError('Artifact package mismatch')
    if root.get(ANDROID + 'versionCode') != code or root.get(ANDROID + 'versionName') != version:
        raise ValueError('Artifact version mismatch')
    app = root.find('application')
    if app is None or any(app.get(ANDROID + key, 'false') not in ('false', '0') for key in ('debuggable', 'testOnly')):
        raise ValueError('Debug, test-only or ambiguous application flags')
    sdk = root.find('uses-sdk')
    target = int(sdk.get(ANDROID + 'targetSdkVersion', '0')) if sdk is not None else 0
    if target < 36:
        raise ValueError('Play readiness requires target API >= 36')
    permissions = sorted({e.attrib[ANDROID + 'name'] for e in root if e.tag.startswith('uses-permission') and e.get(ANDROID + 'name')})
    return dict(package=package, versionCode=int(code), versionName=version, targetSdkVersion=target,
                debuggable=False, testOnly=False, permissions=permissions)


def check_elf(data):
    """Require all 64-bit PT_LOAD segments to support 16-KB memory pages."""
    if len(data) < 64 or data[:6] != b'\x7fELF\x02\x01':
        raise ValueError('Expected little-endian ELF64 library')
    offset = struct.unpack_from('<Q', data, 32)[0]
    size, count = struct.unpack_from('<HH', data, 54)
    if size < 56 or not count or offset + size * count > len(data):
        raise ValueError('Invalid ELF program headers')
    loads = 0
    for i in range(count):
        kind, _, pos, address, _, _, _, align = struct.unpack_from('<IIQQQQQQ', data, offset + i * size)
        if kind == 1:
            loads += 1
            if align < 16384 or align & (align - 1) or (address - pos) % 16384:
                raise ValueError('Native library lacks 16-KB PT_LOAD alignment')
    if not loads:
        raise ValueError('ELF library has no load segments')


def inspect_bundle(bundle, jar, package, code, version):
    if hashlib.sha256(jar.read_bytes()).hexdigest() != BUNDLETOOL_SHA256:
        raise ValueError('Untrusted bundletool checksum')

    def tool(*args):
        return subprocess.check_output(['java', '-jar', str(jar), *args], text=True, timeout=180)

    tool('validate', '--bundle=' + str(bundle))
    xml = tool('dump', 'manifest', '--bundle=' + str(bundle), '--module=base')
    result = check_manifest(xml, package, code, version)
    config = tool('dump', 'config', '--bundle=' + str(bundle))
    libraries = []
    abis = set()
    with zipfile.ZipFile(bundle) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate bundle entries')
        for name in names:
            parts = name.split('/')
            if len(parts) == 4 and parts[1] == 'lib' and name.endswith('.so'):
                abis.add(parts[2])
                if parts[2] in ('arm64-v8a', 'x86_64'):
                    try:
                        check_elf(archive.read(name))
                    except ValueError as error:
                        raise ValueError(f'{name}: {error}') from error
                    libraries.append(name)
    if abis and 'arm64-v8a' not in abis:
        raise ValueError('Native bundle is missing arm64-v8a')
    # The Play-generated APKs must also use 16-KB ZIP alignment, not just aligned ELF.
    if libraries and 'PAGE_ALIGNMENT_16K' not in config:
        raise ValueError('Bundle config does not request 16-KB APK ZIP alignment')
    result.update(aabSha256=hashlib.sha256(bundle.read_bytes()).hexdigest(), abis=sorted(abis),
                  elf64LibrariesChecked=libraries, bundleRequests16kbZipAlignment='PAGE_ALIGNMENT_16K' in config)
    return result, xml, config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--bundletool', type=Path, required=True)
    parser.add_argument('--package', required=True)
    parser.add_argument('--version-code', required=True)
    parser.add_argument('--version-name', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--apk-manifest', type=Path)
    args = parser.parse_args()
    result, xml, config = inspect_bundle(args.bundle, args.bundletool, args.package, args.version_code, args.version_name)
    if args.apk_manifest:
        check_manifest(args.apk_manifest.read_text(), args.package, args.version_code, args.version_name)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'aab-manifest.xml').write_text(xml)
    (args.output / 'bundle-config.json').write_text(config)
    (args.output / 'artifact-inspection.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
