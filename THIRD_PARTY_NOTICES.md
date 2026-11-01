# Third-party notices

## Lato

The wordmark and preview lettering were rendered using Lato Semibold, by Łukasz Dziedzic (font copyright 2010–2011), distributed under the SIL Open Font License 1.1. Source: https://www.latofonts.com/ . No font binaries are distributed here. The wordmark uses outlined lettering; the brand board also uses outlines.

The OFL explicitly exempts documents created using the font from the requirement to license the document under OFL. The project's brand terms do not override rights in the font software. To rebuild with a local font, obtain Lato from its legitimate distribution and retain its license if redistributing the font.

## Document-import dependencies

Pinned runtime dependencies installed through pnpm, with their own upstream licenses (not vendored or relicensed):

- `pdfjs-dist` 6.4.299 — Apache-2.0; https://github.com/mozilla/pdf.js . Optional Node canvas dependencies retain their own licenses.
- `fflate` 0.8.3 — MIT; https://github.com/101arrowz/fflate .
- `fast-xml-parser` 5.11.2 — MIT; https://github.com/NaturalIntelligence/fast-xml-parser .
- `@noble/hashes` 2.4.0 — MIT; https://github.com/paulmillr/noble-hashes .

Dependency versions, transitive packages and integrity values are recorded in `pnpm-lock.yaml`; inspect installed package licenses before redistributing a built application. The optional original encrypted-fixture generator uses pypdf installed separately via uv; no pypdf code or external book is bundled into the fixtures.

## Mobile prototype dependencies

The React Native/Expo and EPUB-reader packages are direct dependencies of `apps/mobile`; versions are locked in `pnpm-lock.yaml` and their upstream MIT licenses remain in effect:

- `react-native` 0.88.1; https://github.com/facebook/react-native .
- `expo` 58.0.22, `expo-router` 58.0.29, and `expo-system-ui` 58.0.7; https://github.com/expo/expo .
- `@epubjs-react-native/core` 1.4.8; https://github.com/victorsoares96/epubjs-react-native .
- `@epubjs-react-native/expo-file-system` 2.0.0, `expo-file-system` 58.0.13, and `expo-sqlite` 58.0.15.
- `react-native-webview` 14.0.1; https://github.com/react-native-webview/react-native-webview .

Review all transitive licenses and updated security advisories before any public binary distribution; the current app is a local feasibility prototype, not a release build.

## Tooling

Rendering uses CairoSVG and fontTools installed independently; no third-party library source is vendored. Dependency licenses remain with their authors. The initial symbol geometry is original project artwork, not a stock icon or third-party logo. No claim is made that its general leaf/book motif is unique or legally cleared.
