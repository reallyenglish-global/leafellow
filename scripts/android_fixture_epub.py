# SPDX-License-Identifier: Apache-2.0
"""Generate the synthetic Android acceptance EPUB deterministically (standard library only).

The text is original, synthetic and dedicated to the public domain (CC0 1.0). No book is
committed: CI regenerates the same bytes on every run and checks them against FIXTURE_SHA256.
Every entry is STORED (not deflated) so the bytes do not depend on the zlib build.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile

FIXTURE_NAME = 'leafellow-fixture.epub'
TARGET_WORD = 'Luminous'
# Pinned: a change to any entry above must update this and is caught by tests/test_android_acceptance.py.
FIXTURE_SHA256 = 'ec2bc0189f7ec3bf1450a91a16b1ff390cb0d0dbcba2240fad11e23d0360c1f7'
FIXED_DATE = (2026, 1, 1, 0, 0, 0)
FILLER_PARAGRAPHS = 60

MIMETYPE = 'application/epub+zip'
CONTAINER = '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
'''
OPF = '''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:7d0c1f4e-3a52-4c1b-9a4e-6f1f0c0a5e01</dc:identifier>
    <dc:title>Leafellow Acceptance Fixture</dc:title>
    <dc:language>en</dc:language>
    <dc:rights>CC0 1.0: synthetic text written for automated testing.</dc:rights>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>
'''
NAV = '''<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc"><ol><li><a href="chapter.xhtml">A Long Quiet Chapter</a></li></ol></nav>
  </body>
</html>
'''
STYLE = '''p { margin: 0 0 1.2em 0; }
p.target { font-size: 2.6em; line-height: 1.4; margin: 1.5em 0 2.5em 0; text-align: center; }
'''
FILLER = ('Paragraph {n} of the acceptance chapter walks slowly through an orchard of plain words. '
          'Nothing here is quoted from any book; it exists so the reader can scroll well away from '
          'the opening passage and then return to it.')


def chapter() -> str:
    filler = '\n'.join(f'    <p>{FILLER.format(n=n)}</p>' for n in range(1, FILLER_PARAGRAPHS + 1))
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>A Long Quiet Chapter</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
  <body>
    <h1>A Long Quiet Chapter</h1>
    <p class="target">{TARGET_WORD}</p>
{filler}
    <p>The end of the acceptance chapter.</p>
  </body>
</html>
'''


def entries():
    return [
        ('mimetype', MIMETYPE),
        ('META-INF/container.xml', CONTAINER),
        ('OEBPS/content.opf', OPF),
        ('OEBPS/nav.xhtml', NAV),
        ('OEBPS/style.css', STYLE),
        ('OEBPS/chapter.xhtml', chapter()),
    ]


def build(path: Path) -> str:
    """Write the fixture to path and return its sha256 hex digest."""
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, text in entries():
            info = zipfile.ZipInfo(name, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, text.encode('utf-8'))
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metadata(digest: str) -> dict:
    return {
        'fileName': FIXTURE_NAME,
        'sha256': digest,
        'documentId': f'sha256:{digest}',
        'targetQuote': TARGET_WORD,
        'license': 'CC0-1.0',
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output_dir', type=Path)
    args = parser.parse_args(argv)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    digest = build(args.output_dir / FIXTURE_NAME)
    if digest != FIXTURE_SHA256:
        print(f'Fixture sha256 {digest} does not match the pinned {FIXTURE_SHA256}', file=sys.stderr)
        return 1
    (args.output_dir / 'leafellow-fixture.json').write_text(json.dumps(metadata(digest), indent=2) + '\n')
    print(digest)
    return 0


if __name__ == '__main__':
    sys.exit(main())
