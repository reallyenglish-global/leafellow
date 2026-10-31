# SPDX-License-Identifier: Apache-2.0
"""Standard-library checks for the published foundation (not mobile/AI tests)."""
import hashlib
import json
from pathlib import Path
import re
import struct
import unittest
import xml.etree.ElementTree as ET
import zlib

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / 'brand'
SVG = '{http://www.w3.org/2000/svg}'


def validate_svg(data):
    """Validate our generated static assets; not a general untrusted-SVG sanitizer."""
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('Document declarations forbidden')
    # Only repository-controlled assets; reject DTD/entities before stdlib parsing.
    # This is deliberately not an importer for user-controlled documents.
    tree = ET.fromstring(data)
    if tree.tag != SVG + 'svg' or not tree.get('viewBox'):
        raise ValueError('Expected an SVG with a viewBox')
    allowed = {'svg', 'title', 'desc', 'g', 'path', 'circle', 'rect'}
    for node in tree.iter():
        if node.tag.removeprefix(SVG) not in allowed:
            raise ValueError('Unexpected element')
        for attr, value in node.attrib.items():
            if attr.lower().startswith('on') or 'href' in attr.lower() or 'url(' in value.lower():
                raise ValueError('Active/external content forbidden')
    return tree


class FoundationTests(unittest.TestCase):
    def test_manifest_matches_complete_output_set(self):
        manifest = json.loads((BRAND / 'manifest.json').read_text())
        actual = {p.name for p in BRAND.iterdir() if p.suffix in {'.svg', '.png', '.json'} and p.name != 'manifest.json'}
        self.assertEqual(set(manifest), actual)
        for name, expected in manifest.items():
            self.assertEqual(hashlib.sha256((BRAND/name).read_bytes()).hexdigest(), expected, name)

    def test_all_svg_are_static_accessible_vectors(self):
        for path in BRAND.glob('*.svg'):
            tree = validate_svg(path.read_bytes())
            self.assertIsNotNone(tree.find(SVG + 'title'), path.name)
            self.assertIsNotNone(tree.find(SVG + 'desc'), path.name)
            self.assertEqual(tree.get('role'), 'img')

    def test_reject_active_svg(self):
        for body in ['<script/>', '<image href="https://example.invalid/x"/>', '<rect onclick="bad()"/>', '<path fill="url(https://example.invalid/x)"/>']:
            with self.assertRaises(ValueError):
                validate_svg(('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">'+body+'</svg>').encode())

    def test_reject_document_entities(self):
        with self.assertRaises(ValueError):
            validate_svg(b'<!DOCTYPE svg><svg/>')

    def test_wordmark_is_outlined(self):
        for name in ['leafellow-logo.svg', 'leafellow-logo-reversed.svg']:
            tree = validate_svg((BRAND/name).read_bytes())
            self.assertGreater(len(list(tree.iter(SVG + 'path'))), 5)
            self.assertFalse(list(tree.iter(SVG + 'text')))

    def test_png_integrity_dimensions_and_square_master(self):
        for path in BRAND.glob('*.png'):
            data = path.read_bytes()
            self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
            pos = 8
            compressed = b''
            while pos < len(data):
                n = struct.unpack('>I', data[pos:pos+4])[0]
                kind = data[pos+4:pos+8]
                chunk = data[pos+8:pos+8+n]
                crc = struct.unpack('>I', data[pos+8+n:pos+12+n])[0]
                self.assertEqual(zlib.crc32(kind+chunk) & 0xffffffff, crc)
                if kind == b'IHDR':
                    width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
                    self.assertEqual(depth, 8)
                    self.assertIn(color, (2,6))
                    self.assertEqual(interlace, 0)
                if kind == b'IDAT':
                    compressed += chunk
                pos += n + 12
            self.assertEqual(pos, len(data))
            channels = 3 if color == 2 else 4
            self.assertEqual(len(zlib.decompress(compressed)), height*(1+width*channels))
            if path.name.startswith('leafellow-icon-'):
                expected = int(path.stem.rsplit('-',1)[1])
                self.assertEqual((width,height), (expected,expected))
            elif path.name == 'leafellow-brand-board.png':
                self.assertEqual((width,height),(1600,1320))
            elif path.name == 'leafellow-logo.png':
                self.assertEqual((width,height),(1410,384))
        master = validate_svg((BRAND/'leafellow-icon.svg').read_bytes())
        self.assertIsNone(master.find(SVG+'rect').get('rx'))

    def test_palette_and_license_boundary(self):
        tokens = json.loads((BRAND/'tokens.json').read_text())
        self.assertEqual(tokens['colors']['forest'], '#173F35')
        for value in tokens['colors'].values():
            self.assertRegex(value, '^#[0-9A-F]{6}$')
        self.assertIn('Apache License', (ROOT/'LICENSE').read_text())
        self.assertIn('not licensed under', (ROOT/'BRAND_LICENSE.md').read_text())
        self.assertIn('Copyright 2026', (ROOT/'NOTICE').read_text())

    def test_local_markdown_links_resolve(self):
        for path in ROOT.rglob('*.md'):
            if '.git' in path.parts:
                continue
            for target in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',path.read_text()):
                if target.startswith(('https://','http://','#','mailto:')):
                    continue
                self.assertTrue((path.parent/target.split('#')[0]).exists(),f'{path}: {target}')

    def test_no_private_content_or_books_in_project(self):
        forbidden = ['/home/', '/mnt/', 'life-os/', 'BWS_ACCESS_TOKEN']
        for path in ROOT.rglob('*'):
            if not path.is_file() or '.git' in path.parts or '__pycache__' in path.parts:
                continue
            self.assertNotIn(path.suffix, {'.epub','.pdf','.pem','.key'})
            if path == Path(__file__):
                continue
            if path.suffix in {'.md','.py','.json','.yml','.svg'}:
                text = path.read_text()
                for token in forbidden:
                    self.assertNotIn(token,text,str(path))


if __name__ == '__main__':
    unittest.main()
