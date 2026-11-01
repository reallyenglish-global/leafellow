# SPDX-License-Identifier: Apache-2.0
"""Validate the highlight export pulled from the Android emulator after the acceptance flow.

Fails (exit 1) unless the pulled folder holds exactly one Leafellow export whose envelope matches
the generated fixture: source hash, one private EPUB record, the exact target quote and a range CFI.
"""
import argparse
import json
from pathlib import Path
import re
import sys

ENVELOPE_KEYS = {'format', 'formatVersion', 'source', 'count', 'highlights'}
ENTRY_KEYS = {'id', 'createdAt', 'annotation'}
ANNOTATION_KEYS = {'id', 'documentId', 'quote', 'anchor', 'note', 'schemaVersion', 'visibility'}
RANGE_CFI = re.compile(r'^epubcfi\([^()]*,[^()]*,[^()]*\)$')
HIGHLIGHT_ID = re.compile(r'^hl_[0-9a-f]{32}$')


class ExportCheckError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ExportCheckError(message)


def check_export(export_dir: Path, fixture: dict) -> dict:
    sha = fixture['sha256']
    require(re.fullmatch(r'[0-9a-f]{64}', sha or ''), 'fixture metadata has no sha256')
    require(export_dir.is_dir(), f'export folder missing: {export_dir}')
    files = sorted(p for p in export_dir.iterdir())
    name_pattern = re.compile(rf'^leafellow-highlights-{sha[:12]}-[a-z0-9]+\.json$')
    require(len(files) == 1, f'expected exactly one exported file, found {[p.name for p in files]}')
    path = files[0]
    require(path.is_file() and name_pattern.fullmatch(path.name), f'unexpected export file name: {path.name}')
    text = path.read_text(encoding='utf-8')
    require(text.endswith('\n'), 'export is not newline-terminated')
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise ExportCheckError(f'export is not JSON: {error}') from error
    require(isinstance(data, dict) and set(data) == ENVELOPE_KEYS, 'unexpected envelope keys')
    require(data['format'] == 'leafellow.highlights' and data['formatVersion'] == 1, 'unexpected format')
    require(data['source'] == {'documentId': f'sha256:{sha}'}, 'export source is not the fixture hash')
    highlights = data['highlights']
    require(isinstance(highlights, list) and data['count'] == 1 and len(highlights) == 1, 'expected count 1')
    entry = highlights[0]
    require(isinstance(entry, dict) and set(entry) == ENTRY_KEYS, 'unexpected record keys')
    require(isinstance(entry['createdAt'], int) and entry['createdAt'] > 0, 'invalid createdAt')
    annotation = entry['annotation']
    require(isinstance(annotation, dict) and set(annotation) == ANNOTATION_KEYS, 'unexpected annotation keys')
    require(HIGHLIGHT_ID.fullmatch(str(entry['id'])) and annotation['id'] == entry['id'], 'invalid highlight id')
    require(annotation['documentId'] == f'sha256:{sha}', 'annotation source is not the fixture hash')
    require(annotation['visibility'] == 'private' and annotation['schemaVersion'] == 1, 'record is not private v1')
    require(annotation['quote'].get('exact') == fixture['targetQuote'],
            f"quote {annotation['quote'].get('exact')!r} != {fixture['targetQuote']!r}")
    anchor = annotation['anchor']
    require(anchor.get('format') == 'epub' and isinstance(anchor.get('href'), str) and anchor['href'],
            'anchor is not an EPUB anchor')
    require(isinstance(anchor.get('cfi'), str) and RANGE_CFI.fullmatch(anchor['cfi']), 'anchor CFI is not a range CFI')
    return {'file': path.name, 'id': entry['id'], 'cfi': anchor['cfi'], 'quote': annotation['quote']['exact']}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export_dir', type=Path)
    parser.add_argument('fixture_metadata', type=Path)
    args = parser.parse_args(argv)
    try:
        fixture = json.loads(args.fixture_metadata.read_text())
        summary = check_export(args.export_dir, fixture)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, ExportCheckError) as error:
        print(f'Export check FAILED: {error}', file=sys.stderr)
        return 1
    print(json.dumps({'exportCheck': 'passed', **summary}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
