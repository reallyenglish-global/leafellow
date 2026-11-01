# SPDX-License-Identifier: Apache-2.0
"""Bind a simulator .app zip to its exact source and workflow run; never sign or publish."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys


NAME = 'Leafellow-iOS-Simulator.app.zip'


def digest(path):
    sha256 = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            sha256.update(block)
    return sha256.hexdigest()


def record(folder, sha, run_id, attempt):
    if not re.fullmatch(r'[0-9a-f]{40}', sha) or not run_id.isdigit() or not attempt.isdigit():
        raise ValueError('Exact checkout SHA, workflow run ID and build attempt are required')
    sha256 = digest(folder / NAME)
    metadata = {'checkoutSha': sha, 'runId': run_id, 'buildAttempt': attempt,
                'zipSha256': sha256, 'variant': 'Release-iphonesimulator, unsigned, not for distribution'}
    (folder / 'provenance.json').write_text(json.dumps(metadata, indent=2) + '\n')
    (folder / f'{NAME}.sha256').write_text(f'{sha256}  {NAME}\n')
    return metadata


def verify(folder, sha, run_id):
    metadata = json.loads((folder / 'provenance.json').read_text())
    if not re.fullmatch(r'[0-9a-f]{40}', sha) or not run_id.isdigit():
        raise ValueError('Exact expected SHA and workflow run ID required')
    if metadata.get('checkoutSha') != sha or metadata.get('runId') != run_id:
        raise ValueError('Simulator app provenance does not match this exact head and workflow run')
    expected = digest(folder / NAME)
    if metadata.get('zipSha256') != expected or (folder / f'{NAME}.sha256').read_text() != f'{expected}  {NAME}\n':
        raise ValueError('Simulator app zip checksum mismatch')
    return metadata


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('record', 'verify'))
    parser.add_argument('folder', type=Path)
    parser.add_argument('--sha', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--attempt')
    args = parser.parse_args(argv)
    try:
        if args.action == 'record':
            metadata = record(args.folder, args.sha, args.run_id, args.attempt or '')
        else:
            metadata = verify(args.folder, args.sha, args.run_id)
        print(json.dumps(metadata))
        return 0
    except (OSError, ValueError, KeyError) as error:
        print(f'iOS artifact {args.action} failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
