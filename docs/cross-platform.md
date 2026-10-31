# Cross-platform architecture proposal

## Confirmed requirement

Leafellow must support **web, Android and iOS**. This is a product requirement, not optional future expansion. No build or device test has established support yet. A primary test device is still useful for scheduling, but must not become a single-platform architecture decision.

## Recommended stack — proposed, not yet implemented

**React Native + Expo + TypeScript + Expo Router**, using React Native Web for shared application UI. Flutter remains viable; the recommendation reflects the existing React/TypeScript direction and the importance of browser document rendering, not a claim that Flutter cannot serve the web.

A single-platform Swift/Kotlin product no longer meets the requirement. Native reader modules may still be platform-specific implementation details behind shared interfaces.

## Share contracts and learning logic, not every platform implementation

- Share library metadata, stable source/edition identity, annotations, learning state, provider result/error models, context consent, and navigation concepts.
- Share the application shell where practical; use a split reader/tutor layout on wide screens and a sheet/full-screen panel on phones.
- Reader adapter: open authorized source, expose capabilities, select passage, emit source locator and exact quote/context, apply decoration, navigate back, close.
- Storage adapter: browser database/file persistence versus mobile database/files, with a common versioned record/export contract. Browser eviction/quota and mobile backup/key handling are different; no automatic persistence equivalence.
- Auth adapter: supported browser authorization/callback behavior versus native system-browser/deep-link behavior. Never place provider secrets in document JS, public bundles or browser localStorage. Browser identity/session architecture may need a server boundary, depending on provider rules. A shared UI does not make subscription OAuth universal.
- Files adapter: browser file input/download versus mobile document picker/share sheet.

Suggested logical boundaries (not a demand for a multi-package monorepo now): `app`, `reader`, `learning`, `storage`, `providers`. Start in one application and extract packages only when useful.

## Reader engine gate

Compare two bounded routes using the same authorized file and representative passages:

1. Browser reader plus mobile DOM/WebView embedding. This may share EPUB/math rendering, but selection menus, scrolling, offline resources, accessibility and the bridge need actual native testing. Book content must remain isolated from application/provider privileges; no permissive bridge into untrusted documents.
2. Browser reader plus native Swift/Kotlin readers behind the same application contract. This can offer better platform integration but introduces separate engines, native bindings and locator translation.

Do not promise that a locator copied between different engines identifies the same range. Define a canonical source identity and quote/context fallback, test portability explicitly, and show ambiguous matches rather than silently moving notes. Cross-device sync remains a separately designed feature, not an automatic consequence of shared code.

Readium Web currently documents EPUB support, not PDF parity. It describes complementary TypeScript navigation and Go publication-serving toolkits; a browser-local import is not established merely by choosing the TypeScript toolkit. Do not introduce mandatory cloud book upload or a Go backend without an explicit rights/privacy/architecture decision. PDF is now a required format and needs a separately evaluated engine; see [EPUB/PDF scope](formats.md).

## Cross-platform acceptance before claiming support

- Browser: define supported desktop/mobile browser versions, test responsive reader/tutor, keyboard/mouse selection and accessibility. At minimum exercise Chromium, Firefox and Safari/WebKit paths before release; desktop WebKit automation is not a substitute for real iOS Safari testing.
- Android: real native build and emulator/device smoke for import, selection, highlight, return, offline restart and allowed provider authorization.
- iOS: real Xcode/macOS or approved remote build and simulator/device smoke for the same flow. A web bundle/native JavaScript export is not an iOS application test. Signing/store publication is separately approved.
- All three: same core learning flow, source-context preview, stable annotations after restart, honest network/provider failure, no silent billing fallback. Different file pickers and native navigation affordances are acceptable; missing core functionality is not.
- Browser offline installation/caching and mobile offline persistence need separate tests. PWA packaging is optional until required, not a substitute for Android/iOS apps.

Ship small vertical increments across all three rather than completing web and indefinitely postponing mobile. Web can be the fastest iteration loop, but feasibility checks must cover all target runtimes early.

## Still needed

Choose representative authorized EPUB and PDF sources and decide scanned/fixed-layout scope; choose supported provider route and budget; name the maths reference/reviewer. These remain unresolved even though target platforms are settled. No framework dependencies or app scaffold have been added by this documentation update.

## Documentation inspected

- [Expo web support](https://docs.expo.dev/workflow/web/): shared React Native Web UI and platform-specific DOM components.
- [Expo DOM components](https://docs.expo.dev/guides/dom-components/): native WebView-backed DOM support and asynchronous bridge considerations; not a guarantee of ebook reader compatibility.
- [Readium Web](https://readium.org/web/): EPUB scope, TypeScript navigation/Go serving split and candidate engines.

These documents support the proposal, not an executed integration result.
