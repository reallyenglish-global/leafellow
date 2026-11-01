# SPDX-License-Identifier: Apache-2.0
"""Run native reader acceptance on a dedicated, already booted iOS simulator.

No hardware targets, account/cloud services, production data or Leafellow Files sharing.
Only the separate synthetic FixtureShelf container is staged/read for import/export.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from xml.parsers.expat import ExpatError

from android_export_check import ExportCheckError, check_export

ROOT = Path(__file__).resolve().parents[1]
APP_ID = 'com.anonymous.leafellow'
SHELF_ID = 'com.leafellow.acceptance.fixtures'
RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5'
UUID = re.compile(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}')


def command(argv, *, timeout=60, log):
    """Bound each tool invocation and retain stdout/stderr, including on failure."""
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('ab') as output, tempfile.TemporaryFile(dir=log.parent) as stdout:
        output.write(('\n$ ' + ' '.join(str(x) for x in argv) + '\n').encode())
        output.flush()
        process = subprocess.Popen(argv, stdout=stdout, stderr=output, start_new_session=True)
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            raise
        finally:
            stdout.seek(0)
            shutil.copyfileobj(stdout, output)
        stdout.seek(0)
        text = stdout.read().decode('utf-8', errors='replace').strip()
    if process.returncode:
        raise subprocess.CalledProcessError(process.returncode, argv)
    return text


def validate_simulator(data, udid, expected_name):
    if not UUID.fullmatch(udid):
        raise ValueError('An explicit simulator UUID is required (not booted or a hardware ID)')
    targets = [d for d in data.get('devices', {}).get(RUNTIME, []) if d.get('udid') == udid]
    if len(targets) != 1:
        raise ValueError(f'Target is not available on pinned runtime {RUNTIME}')
    device = targets[0]
    if not (device.get('isAvailable') and device.get('state') == 'Booted'
            and re.fullmatch(r'LeafellowAcceptance-[0-9]+-[0-9]+', expected_name)
            and device.get('name') == expected_name):
        raise ValueError('Refusing target other than a dedicated booted LeafellowAcceptance-run-attempt simulator')


def build_shelf(out):
    app = out / 'FixtureShelf.app'
    app.mkdir(exist_ok=False)
    sdk = command(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], log=out / 'shelf-build.log')
    arch = platform.machine()
    if arch not in ('arm64', 'x86_64'):
        raise ValueError(f'Unsupported macOS simulator architecture: {arch}')
    command(['xcrun', 'swiftc', '-parse-as-library', '-sdk', sdk, '-target', f'{arch}-apple-ios15.1-simulator',
             str(ROOT / 'e2e/ios/FixtureShelf.swift'), '-o', str(app / 'FixtureShelf')],
            timeout=180, log=out / 'shelf-build.log')
    shutil.copyfile(ROOT / 'e2e/ios/FixtureShelf-Info.plist', app / 'Info.plist')
    # Local ad-hoc signing of a test helper only; no identity, entitlement or store upload.
    command(['codesign', '--force', '--sign', '-', str(app)], log=out / 'shelf-build.log')
    return app


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--fixture-dir', type=Path, required=True)
    parser.add_argument('--simulator', required=True)
    parser.add_argument('--simulator-name', required=True)
    parser.add_argument('--out', type=Path, required=True)
    return parser.parse_args(argv)


def run(args):
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    status = {}
    final = 0
    validated = False
    step = 'preflight'
    container = None
    meta = None

    def tool(argv, *, timeout=60, log=None):
        return command(argv, timeout=timeout, log=log or out / f'{step}.log')

    def record_failure(error):
        nonlocal final
        rc = error.returncode if isinstance(error, subprocess.CalledProcessError) else 124 if isinstance(error, subprocess.TimeoutExpired) else 3
        rc = rc if 0 < rc < 256 else 3
        status[step] = rc
        if not final:
            final = rc
        print(f'[ios-acceptance] {step}: {error}', file=sys.stderr)
        with (out / 'errors.txt').open('a') as errors:
            errors.write(f'{step}: {error}\n')

    try:
        epub = args.fixture_dir / 'leafellow-fixture.epub'
        meta = json.loads((args.fixture_dir / 'leafellow-fixture.json').read_text())
        if hashlib.sha256(epub.read_bytes()).hexdigest() != meta['sha256']:
            raise ValueError('Fixture hash mismatch')
        info = plistlib.loads((args.app / 'Info.plist').read_bytes())
        if info.get('CFBundleIdentifier') != APP_ID or info.get('UIFileSharingEnabled'):
            raise ValueError('Wrong app identity or private Leafellow Documents exposed through Files')
        status[step] = 0
        step = 'simulator-only'
        data = json.loads(tool(['xcrun', 'simctl', 'list', 'devices', '--json']))
        validate_simulator(data, args.simulator, args.simulator_name)
        validated = True
        status[step] = 0
        (out / 'simulator.json').write_text(json.dumps({'udid': args.simulator, 'runtime': RUNTIME,
                                                     'device': next(d for d in data['devices'][RUNTIME] if d['udid'] == args.simulator)}, indent=2))
        step = 'build-fixture-shelf'
        shelf = build_shelf(out)
        status[step] = 0
        step = 'install'
        for app in (args.app, shelf):
            tool(['xcrun', 'simctl', 'install', args.simulator, str(app)], timeout=120)
        status[step] = 0
        step = 'stage-inputs'
        path = tool(['xcrun', 'simctl', 'get_app_container', args.simulator, SHELF_ID, 'data'])
        container = Path(path)
        if not container.is_absolute() or not container.is_dir() or container.is_symlink() or container == Path('/'):
            raise ValueError('Invalid simulator fixture container')
        docs = container / 'Documents'
        if docs.is_symlink():
            raise ValueError('Fixture Documents must not be a symlink')
        docs.mkdir(exist_ok=True)
        target = docs / 'leafellow-fixture.epub'
        exports = docs / 'LeafellowExports'
        if target.exists() or target.is_symlink() or exports.exists() or exports.is_symlink():
            raise ValueError('Fixture or export folder already exists; use a fresh disposable simulator')
        with target.open('xb') as dest:
            dest.write(epub.read_bytes())
        exports.mkdir()
        tool(['xcrun', 'simctl', 'launch', args.simulator, SHELF_ID])
        tool(['xcrun', 'simctl', 'terminate', args.simulator, SHELF_ID])
        status[step] = 0
        step = 'maestro'
        for folder in ('maestro', 'maestro-debug'):
            (out / folder).mkdir(exist_ok=True)
        tool(['maestro', '--device', args.simulator, 'test', '--format', 'junit', '--output', str(out / 'junit.xml'),
              '--test-output-dir', str(out / 'maestro'), '--debug-output', str(out / 'maestro-debug'),
              '-e', f'APP_ID={APP_ID}', str(ROOT / 'e2e/ios/reader-acceptance.yaml')], timeout=1200)
        status[step] = 0
    except (OSError, ValueError, KeyError, TypeError, AttributeError, ExpatError, subprocess.SubprocessError) as error:
        record_failure(error)

    # Validate the actual file even if a later UI assertion failed; never invent one.
    if container is not None and status.get('stage-inputs') == 0:
        step = 'export-check'
        try:
            source = container / 'Documents/LeafellowExports'
            if not isinstance(meta, dict):
                raise ValueError('Fixture metadata missing')
            summary = check_export(source, meta)
            shutil.copytree(source, out / 'exports', dirs_exist_ok=False)
            (out / 'export-check.json').write_text(json.dumps({'exportCheck': 'passed', **summary}) + '\n')
            status[step] = 0
        except (OSError, ValueError, KeyError, TypeError, AttributeError, ExportCheckError) as error:
            # check_export has a dedicated exception type as well as malformed-envelope errors.
            record_failure(error)

    if validated:
        # Bounded best-effort diagnostics only for our explicitly validated simulator.
        for name, argv in (
            ('screen', ['xcrun', 'simctl', 'io', args.simulator, 'screenshot', str(out / 'screen.png')]),
            ('simulator-log', ['xcrun', 'simctl', 'spawn', args.simulator, 'log', 'show', '--last', '5m',
                               '--style', 'compact', '--predicate', 'process == "Leafellow"']),
        ):
            try:
                command(argv, timeout=20, log=out / f'{name}.log')
            except (OSError, subprocess.SubprocessError) as error:
                status[f'diagnostics-{name}'] = str(error)
    status['final'] = final
    (out / 'status.json').write_text(json.dumps(status, indent=2) + '\n')
    return final


if __name__ == '__main__':
    sys.exit(run(parse_args()))
