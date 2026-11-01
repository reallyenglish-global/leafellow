# Leafellow Mobile

Early React Native reader prototype for Android and iOS. It uses the Expo SDK 58.0.22 / React Native 0.88.1 compatibility set, TypeScript and Expo Router. Manage dependencies from the repository root with pnpm 10.29.3.

```sh
pnpm install --frozen-lockfile
pnpm --filter @leafellow/mobile start
pnpm --filter @leafellow/mobile typecheck
pnpm --filter @leafellow/mobile exec expo-doctor
```

Native EPUB packages require a development build; Expo Go does not include them. Generate a local iOS project with `pnpm --filter @leafellow/mobile prebuild:ios` and install CocoaPods before building in Xcode. Expo generated `com.anonymous.leafellow` only as a temporary simulator bundle identifier; choose a final identifier before signing or store distribution. The GitHub Actions iOS workflow generates the native project, builds an unsigned Simulator app, launches it on an available iPhone Simulator, and uploads the `.app` archive and screenshot. It does not sign or submit an App Store build.

This prototype accepts bounded, unprotected, reflowable EPUB files for a local reading feasibility slice. It stores one last-reading CFI, progress value, timestamp and source hash in app-local SQLite; reselect the exact same EPUB to resume. The book bytes are not copied or uploaded, and the saved position can be cleared from the home screen. Platform backup behavior for SQLite has not been configured or validated. The prototype does not yet provide saved highlights, PDF reading, AI, sync, or a web reader. The web route is a notice, not support. Scripted EPUB content and popups are explicitly disabled; verify that selection and all required behavior work under this security setting before choosing the reader engine for release.
