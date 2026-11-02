#!/usr/bin/env bash
# Build only. No Publisher API calls or Play upload.
set -euo pipefail
# Never enable xtrace in a signing process.
: "${LEAFELLOW_UPLOAD_KEYSTORE:?Set an absolute upload.p12 path outside Git}"
: "${LEAFELLOW_UPLOAD_PASSWORD_FILE:?Set an absolute upload.password path outside Git}"
for path in "$LEAFELLOW_UPLOAD_KEYSTORE" "$LEAFELLOW_UPLOAD_PASSWORD_FILE"; do
  [[ "$path" = /* && -f "$path" && -r "$path" ]] || { printf 'Invalid signing file path\n' >&2; exit 1; }
done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export EXPO_NO_TELEMETRY=1 CI=1
# Validate the configured keystore before dependencies or native build execute.
keytool -list -keystore "$LEAFELLOW_UPLOAD_KEYSTORE" -storetype PKCS12 \
  -alias leafellow-upload -storepass:file "$LEAFELLOW_UPLOAD_PASSWORD_FILE" >/dev/null
pnpm --filter @leafellow/mobile exec expo prebuild --platform android --no-install
(
  cd apps/mobile/android
  ./gradlew bundleRelease --init-script "$ROOT/scripts/android-upload-signing.init.gradle" \
    -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64 --max-workers=2 --no-daemon
)
AAB="$ROOT/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab"
# Verify signature integrity AND that the signer is the designated upload key.
# A self-signed Android upload certificate is expected; do not infer PKI trust.
python3 "$ROOT/scripts/verify-upload-signature.py" "$AAB"
sha256sum "$AAB"
printf 'Build-only AAB: %s\nManifest/target SDK/device QA and Play enrollment remain separate gates.\n' "$AAB"
