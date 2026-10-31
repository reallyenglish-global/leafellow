# Initial delivery contract

## Goal / scope

Publish a real, inspectable Leafellow project foundation: initial logo/icon palette, reproducible renderer, validated assets, public-safe product/roadmap docs, Apache-2.0 code license and separate brand terms. Source authorization: project initiator explicitly chose Leafellow, reallyenglish-global, public open-source publication and the license split.

Before: private design proposal only. After: public source and downloadable initial design assets. This is not mobile-app implementation.

## Invariants and blast radius

Only the new project workspace and its dedicated GitHub repository are published. No private planning repository, personal account/workspace data, customer information, paid traffic, infrastructure, deployment, provider token, book file or raw design transcript. No other worktree altered. Public disclosure cannot reliably be reversed; only allowlisted project files are staged. No external service spend beyond ordinary authorized repository activity.

## Acceptance / evidence commands

- SVG assets parse with no scripts, external resources or embedded font requirements.
- PNG exports have expected dimensions, RGBA/RGB content and file hashes matching manifest.
- Wordmark uses paths; icon includes square unmasked source and separate rounded preview.
- Renderer exercised, visual preview inspected, positive/negative validator tests pass.
- `python3 -m unittest discover -s tests -v`; `git diff --check`.
- Review staged file list and public-safe content, compare Apache license to official source, then publish only this repository.
- Read back repository visibility, license/brand terms and exact default-branch commit after publication. CI must be reported honestly; it does not authorize deployment.

## Remaining unknowns

Trademark clearance, legal entity/IP agreements, app device/source and provider integration feasibility are not established. Brand files are first proposals and brand rights cannot override third-party rights. Do not choose an unconfirmed framework just to fill the repository with a scaffold.
