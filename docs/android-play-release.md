# Android / Google Play preparation

## Scope and current status

Android application ID: `com.reallyenglish.leafellow`. Initial `versionCode`: 1.
The iOS identifier is unchanged and is NOT App Store ready.
Changing Android ID makes this a separate installation from the prototype ID;
it does not migrate the prototype's local SQLite reading position.

This is build preparation, not a publishing approval or a claim of store readiness.
Do not upload a debug-signed acceptance APK to Play. Expo's generated release
build defaults to the debug signing config; `android-upload-signing.init.gradle`
replaces it for the store build, forces `debuggable=false`, and checks application ID.
That integration still needs a successful hosted native build and AAB inspection.

## Key custody

The designated upload key was generated outside this repository:

- Private host directory: held outside the repository (0700); Joey receives its
  location separately. Set `PRIVATE_SIGNING_DIR` to that directory.
- `upload.p12`: RSA-4096 PKCS12 private upload keystore (0600).
- `upload.password`: strong generated password (0600); do not paste in chat.
- `upload-certificate.pem`: public certificate for Play enrollment.
- Alias: `leafellow-upload`.
- Upload certificate SHA256:
  `36:AD:6F:78:05:3B:79:2F:D8:DC:6F:81:E6:C5:6F:77:54:06:3E:A6:83:1C:A8:16:5B:17:53:AB:72:CA:42:46`.
- Certificate expires 2054-03-19.

Keytool generation/export and PKCS12 parsing succeeded. A real signed test JAR
passed strict verification against this keystore; unsigned archives and unsigned
injected entries were rejected. This does not prove Android bundle correctness.
Make an independent encrypted/off-host backup and confirm recovery before publishing.
The password currently sits beside the key, protected by host filesystem permissions;
that is not an independently secured backup or a substitute for a secret manager.

## Build-only path

Use Node 24+ and pnpm 10.29.3, JDK 17, and a compatible Android SDK/NDK:

```sh
pnpm install --frozen-lockfile
export LEAFELLOW_UPLOAD_KEYSTORE="$PRIVATE_SIGNING_DIR/upload.p12"
export LEAFELLOW_UPLOAD_PASSWORD_FILE="$PRIVATE_SIGNING_DIR/upload.password"
bash scripts/android-store-build.sh
```

Do not use shell tracing. No passwords are passed as command-line values.
Output: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.
The script requires the upload key, verifies its integrity before prebuild, then
verifies the AAB signature and exact signer and prints an artifact SHA256 checksum.
Inspect the built manifest using bundletool before accepting it: package ID,
version code, target SDK, `debuggable=false`, release permissions, and backup policy.

The manual `Android signed bundle (build only)` workflow is restricted to `main`.
No PR trigger, Play credentials, publishing API calls, or production track exist.
Before any run, Joey must approve code publication and signing-secret storage,
then create the `android-signing` environment with a required human reviewer and
main-only branch restrictions. Add these environment secrets securely:

- `LEAFELLOW_UPLOAD_KEYSTORE_BASE64` (encoded upload.p12; encoding is not encryption)
- `LEAFELLOW_UPLOAD_KEYSTORE_PASSWORD`

Do not add them as unrestricted repository secrets. Review all signing code and
workflow dependencies first. The workflow cleans temporary signing files and
archives only the AAB and its checksum for 7 days. Hosted runners provide Android
SDK tooling; a successful hosted run has NOT yet been recorded for this change.

## Google Play Console — human/account gates

1. Confirm whether this exact package already exists in the intended developer
   account. If it does, STOP and use the registered upload identity or approved
   upload-key reset; never replace the existing app-signing identity.
2. For a genuinely new app, create the app entry, complete developer verification,
   and enroll in **Play App Signing**, choosing a Google-generated app-signing key.
   Google retains that private key; it cannot be downloaded as a local keystore.
3. Register the public upload certificate where Console requests it. Depending on
   onboarding, Play can derive the upload certificate from the first signed AAB.
   Never upload the PKCS12 private key or password as the public certificate.
4. Once enrolled, download the PUBLIC app-signing certificate from Console and
   record both fingerprints. The app-signing and upload certificates are distinct.
5. Complete store name/descriptions, icon, feature graphic, screenshots, privacy
   policy URL, Data safety, content rating, ads/target-audience declarations,
   app-access instructions, country selection and any account-specific testing gates.
   Audit actual local EPUB/WebView/SQLite/backup/network behavior; do not infer
   Data safety answers from marketing text or guess policy declarations.
6. Run release-device QA and inspect target API/permissions/16-KB page-size native
   compatibility against current Play requirements. Verify versionCode has never
   been used for this package; increment it for subsequent uploads.
7. With separate approval, upload the signed AAB to a draft/internal release first.
   Review Play processing errors and pre-launch reports before any rollout.

No Play Console authentication or enrollment was established during preparation.
Nothing was uploaded, merged, or published to Google Play.

Reference: https://developer.android.com/studio/publish/app-signing
