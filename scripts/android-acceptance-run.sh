#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Run the Android reader acceptance flow against an already booted emulator.
#
# Usage: android-acceptance-run.sh --apk PATH --fixture-dir DIR --flow PATH --out DIR [--app-id ID]
#
# Exit status is the first failure among: preflight, install, Maestro, export pull, export check.
# Diagnostics (logcat, screenshot, UI hierarchy) are collected best-effort with bounded timeouts
# after every run, pass or fail, while the emulator is still up. They never change the exit status.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ID="com.anonymous.leafellow"
APK="" FIXTURE_DIR="" FLOW="" OUT=""
DEVICE_EPUB="/sdcard/Download/leafellow-fixture.epub"
DEVICE_EXPORTS="/sdcard/Documents/LeafellowExports"
ADB_TIMEOUT="${ADB_TIMEOUT:-60}"
DIAG_TIMEOUT="${DIAG_TIMEOUT:-20}"
MAESTRO_TIMEOUT="${MAESTRO_TIMEOUT:-1200}"

usage() { echo "Usage: $0 --apk PATH --fixture-dir DIR --flow PATH --out DIR [--app-id ID]" >&2; }

while [[ $# -gt 0 ]]; do
  if [[ $# -lt 2 ]]; then usage; exit 2; fi
  case "$1" in
    --apk) APK="${2:-}"; shift 2 ;;
    --fixture-dir) FIXTURE_DIR="${2:-}"; shift 2 ;;
    --flow) FLOW="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --app-id) APP_ID="${2:-}"; shift 2 ;;
    *) usage; exit 2 ;;
  esac
done
if [[ -z "$APK" || -z "$FIXTURE_DIR" || -z "$FLOW" || -z "$OUT" ]]; then usage; exit 2; fi

mkdir -p "$OUT/maestro" "$OUT/maestro-debug" "$OUT/exports" "$OUT/diagnostics"
STATUS_FILE="$OUT/status.txt"
: > "$STATUS_FILE"
FINAL=0
record() { # record STEP RC
  echo "$1=$2" >> "$STATUS_FILE"
  echo "[acceptance] $1 exit $2" >&2
  if [[ "$2" -ne 0 && "$FINAL" -eq 0 ]]; then FINAL="$2"; fi
}
adb_t() { timeout "$ADB_TIMEOUT" adb "$@"; }

collect_diagnostics() {
  local d="$OUT/diagnostics"
  timeout "$DIAG_TIMEOUT" adb logcat -d -t 5000 > "$d/logcat.txt" 2> "$d/logcat.err" || echo "logcat failed" >> "$d/errors.txt"
  timeout "$DIAG_TIMEOUT" adb exec-out screencap -p > "$d/screen.png" 2> "$d/screen.err" || echo "screencap failed" >> "$d/errors.txt"
  if timeout "$DIAG_TIMEOUT" adb shell uiautomator dump /sdcard/leafellow-window.xml > "$d/uiautomator.out" 2>&1; then
    timeout "$DIAG_TIMEOUT" adb pull /sdcard/leafellow-window.xml "$d/window.xml" > /dev/null 2>&1 || echo "hierarchy pull failed" >> "$d/errors.txt"
  else
    echo "uiautomator dump failed" >> "$d/errors.txt"
  fi
  return 0
}

finish() {
  collect_diagnostics
  echo "final=$FINAL" >> "$STATUS_FILE"
  exit "$FINAL"
}

# Preflight: fixture bytes must match the pinned metadata generated in this run.
EPUB="$FIXTURE_DIR/leafellow-fixture.epub"
META="$FIXTURE_DIR/leafellow-fixture.json"
rc=0
if [[ ! -s "$APK" || ! -s "$EPUB" || ! -s "$META" || ! -s "$FLOW" ]]; then
  echo "Missing APK, fixture, fixture metadata or flow" >&2; rc=3
else
  expected="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha256"])' "$META")" || rc=3
  actual="$(sha256sum "$EPUB" | cut -d' ' -f1)" || rc=3
  if [[ "$rc" -eq 0 && "$expected" != "$actual" ]]; then echo "Fixture sha256 mismatch" >&2; rc=3; fi
fi
record preflight "$rc"
if [[ "$FINAL" -ne 0 ]]; then echo "final=$FINAL" >> "$STATUS_FILE"; exit "$FINAL"; fi

adb_t wait-for-device; record wait-for-device $?
if [[ "$FINAL" -ne 0 ]]; then finish; fi

# Never install, clear application state or touch shared storage on a physical device.
# adb itself refuses multiple targets; a single attached target must explicitly identify as qemu.
BOOT_QEMU="$(adb_t shell getprop ro.boot.qemu 2>/dev/null | tr -d '\r')"
LEGACY_QEMU="$(adb_t shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r')"
if [[ "$BOOT_QEMU" != "1" && "$LEGACY_QEMU" != "1" ]]; then
  echo "Refusing acceptance on a target that is not an Android emulator" >&2
  record emulator-only 3
  echo "final=$FINAL" >> "$STATUS_FILE"
  exit "$FINAL"
fi
record emulator-only 0

adb_t install -r "$APK"; record install $?
if [[ "$FINAL" -ne 0 ]]; then finish; fi

# Stage inputs through the shared storage the system pickers show, never the app sandbox.
{
  adb_t push "$EPUB" "$DEVICE_EPUB" &&
  adb_t shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$DEVICE_EPUB" &&
  adb_t shell mkdir -p "$DEVICE_EXPORTS"
}; record stage-inputs $?
if [[ "$FINAL" -ne 0 ]]; then finish; fi

DEVICE_NAME="$(adb_t shell settings get global device_name 2>/dev/null | tr -d '\r')"
DEVICE_MODEL="$(adb_t shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
# Storage titles are literal labels, not caller-provided regex fragments.
STORAGE_ROOT="$(python3 -c 'import re,sys; print("|".join(re.escape(x) for x in sys.argv[1:] if x and x != "null"))' \
  "Internal storage" "$DEVICE_NAME" "$DEVICE_MODEL")"
record storage-title $?
if [[ "$FINAL" -ne 0 ]]; then finish; fi

timeout "$MAESTRO_TIMEOUT" maestro test \
  --format junit --output "$OUT/junit.xml" \
  --test-output-dir "$OUT/maestro" \
  --debug-output "$OUT/maestro-debug" \
  -e APP_ID="$APP_ID" -e STORAGE_ROOT="$STORAGE_ROOT" \
  "$FLOW"
record maestro $?

adb_t pull "$DEVICE_EXPORTS/." "$OUT/exports"; record export-pull $?
python3 "$SCRIPT_DIR/android_export_check.py" "$OUT/exports" "$META" > "$OUT/export-check.json"
record export-check $?

finish
