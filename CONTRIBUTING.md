# Contributing

Leafellow is an early product prototype. The initial Android/iOS app uses React Native + Expo; the rendering engine/provider route and full web/PDF feature parity still require feasibility and device review.

Use TDD for behavior changes: add one focused failing test, run it and confirm the intended failure, implement the smallest passing behavior, then refactor with tests green. Record meaningful RED/GREEN evidence in the PR; do not claim post-hoc tests are TDD.

Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm --filter @leafellow/mobile typecheck`, `python3 -m unittest discover -s tests -v` and `git diff --check` before submitting. GitHub Actions must pass at the actual PR head; local success is not a substitute. Do not commit credentials, provider session data, private books, learner histories or personal design transcripts. Use synthetic/public-domain/appropriately licensed examples with provenance.

Code and non-brand documentation contributions are submitted under Apache-2.0. Brand changes require discussion and agreement on separate brand rights before contribution; do not assume the code license applies to brand art. Follow existing brand-use terms when discussing the authentic project. Do not promise transfer of rights you do not have.

PR approval, merge authorization, deployments and paid provider usage are separate decisions. No automated release or deployment is configured.
