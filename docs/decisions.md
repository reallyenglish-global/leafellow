# Decision ledger

## Confirmed at kickoff

- Name: **Leafellow**, selected by project initiator.
- Public repository: **reallyenglish-global/leafellow**, explicitly requested.
- Code/non-brand docs: **Apache-2.0**; name/logo brand rights separately reserved, explicitly selected.
- Initial identity: original leaf/book symbol, forest/paper/sage palette, first design for review.
- No private planning notes or raw review transcripts published.

## Confirmed platform scope

- Web, Android and iOS are all required. No platform has been implemented or device-tested yet.
- EPUB and PDF are both required on all three platforms; see [format scope and acceptance](formats.md).
- See the [cross-platform architecture proposal](cross-platform.md).

## Confirmed implementation stack

- React Native + Expo + TypeScript + Expo Router is selected for the initial Android/iOS app; the planned web UI remains required. Expo SDK 58.0.22 and React Native 0.88.1 are pinned in `apps/mobile` with pnpm workspace management. Expo compatibility checks pass; this is not evidence of native runtime parity.
- The initial mobile reader spike uses the EPUB React Native component with scripted EPUB content disabled. It remains a feasibility candidate until native security, selection, accessibility, and locator tests pass.

## Proposed product sequencing

- Personal vertical slice before sync/social infrastructure; test one-partner sharing cheaply.

## Remaining feasibility and product decisions

1. Alice's Adventures in Wonderland (Project Gutenberg eBook 11, EPUB3) is selected as the first local reader sample. A representative PDF and full browser/device test matrix remain open; decide scope for scanned/protected/fixed-layout material before claiming format support.
2. A permitted provider route and budget. Open-source distribution alone does not prove provider eligibility or mobile OAuth feasibility.
3. Whether a limited, explicitly opted-in API alternative is acceptable if subscription integration is unavailable.
4. Trusted maths reviewer/reference and the first delayed independent learning check.

## Provider caveats

OpenAI documents eligible open-source/local Sign in with ChatGPT plan-usage routes: https://developers.openai.com/siwc/token-sharing-open-source . Verify current registration, scope, model availability, billing/quota and mobile support before implementation. ChatGPT identity is not automatically inference permission, and Codex agent integration is not the same as direct model inference.

Claude's documentation distinguishes product APIs from user sign-in to unmodified Claude Code: https://code.claude.com/docs/en/legal-and-compliance . Do not implement generic Claude.ai third-party subscription login, collect session tokens, or assume a CLI-hosting exception permits the intended reader integration. BYOK is an alternative requiring an explicit product decision.

Recheck terms and route-specific retention/workspace visibility before sending any excerpt. This is an integration gate, not legal advice or proof of provider approval.
