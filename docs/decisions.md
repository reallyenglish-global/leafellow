# Decision ledger

## Confirmed at kickoff

- Name: **Leafellow**, selected by project initiator.
- Public repository: **reallyenglish-global/leafellow**, explicitly requested.
- Code/non-brand docs: **Apache-2.0**; name/logo brand rights separately reserved, explicitly selected.
- Initial identity: original leaf/book symbol, forest/paper/sage palette, first design for review.
- No private planning notes or raw review transcripts published.

## Proposed, not settled

- React Native + TypeScript, conditional on native reader capability, equations, durable anchors, accessibility and target device.
- Readium as a candidate, not assumed cross-format/platform parity. Compare Flutter/native options against actual requirements.
- Personal vertical slice before sync/social infrastructure; test one-partner sharing cheaply.

## Open decisions before mobile implementation

1. Primary device and the first actual book/paper/file; EPUB versus PDF/math requirements.
2. A permitted provider route and budget. Open-source distribution alone does not prove provider eligibility or mobile OAuth feasibility.
3. Whether a limited, explicitly opted-in API alternative is acceptable if subscription integration is unavailable.
4. Trusted maths reviewer/reference and the first delayed independent learning check.

## Provider caveats

OpenAI documents eligible open-source/local Sign in with ChatGPT plan-usage routes: https://developers.openai.com/siwc/token-sharing-open-source . Verify current registration, scope, model availability, billing/quota and mobile support before implementation. ChatGPT identity is not automatically inference permission, and Codex agent integration is not the same as direct model inference.

Claude's documentation distinguishes product APIs from user sign-in to unmodified Claude Code: https://code.claude.com/docs/en/legal-and-compliance . Do not implement generic Claude.ai third-party subscription login, collect session tokens, or assume a CLI-hosting exception permits the intended reader integration. BYOK is an alternative requiring an explicit product decision.

Recheck terms and route-specific retention/workspace visibility before sending any excerpt. This is an integration gate, not legal advice or proof of provider approval.
