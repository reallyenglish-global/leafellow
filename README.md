# Leafellow

**Read deeply. Learn together.**

![Leafellow brand identity](brand/leafellow-brand-board.png)

An open-source reading companion for understanding difficult passages, bridging missing foundations, and learning with other readers.

## Status

**Early project foundation — not a working ereader yet.** This repository contains the initial brand identity, renderer, validation tests, product brief, gated roadmap and a first shared TypeScript annotation core. The core creates/validates private EPUB/PDF records and serializes/restores them against the expected source identity. A first local-byte EPUB/PDF import adapter now parses generated test documents, extracts ordered text and returns source-bound text-range selections. There is no reader UI, mobile application, provider login, inference integration, sync service or social backend yet. Assets are an initial design for review, not trademark clearance.

## The idea

Read → highlight a confusing passage → get an explanation or a short prerequisite bridge → check understanding → return to the source. Keep bookmarks, personal annotations and explicitly shared discussion distinct. Private by default; no punitive streaks or whole-book uploads by default.

The first learning scenario is technical reading with gaps in mathematics. Other subjects may follow; building a general curriculum platform is not the starting scope.

## Project documents

- [Product brief](docs/product.md)
- [Roadmap and feasibility gates](docs/roadmap.md)
- [Architecture decisions](docs/decisions.md)
- [Web, Android and iOS architecture proposal](docs/cross-platform.md)
- [Required EPUB and PDF format scope](docs/formats.md)
- [Initial delivery contract](docs/kickoff.md)
- [Annotation core: first TDD slice and observed evidence](docs/annotation-core.md)
- [Document import: real-byte parsing, safety limits and TDD evidence](docs/document-import.md)
- [Brand guidelines](brand/README.md)
- [Contribution guide](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)

## Check the foundation and annotation core

Use Node.js 24+ and Python 3.10+. The annotation core has no runtime dependencies. The document-import adapter uses pinned parsing/hashing dependencies; TypeScript is a locked development dependency.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
python3 -m unittest discover -s tests -v
```

GitHub Actions checks the Python foundation and runs annotation/import tests and type checks on Node 24 and 26. These checks do not establish browser rendering or native device compatibility.

Rebuild the brand assets (Python 3.10+, Cairo system library, and a local Lato Semibold font):

```sh
uv run --with cairosvg==2.9.1 --with fonttools==4.68.0 python scripts/build_brand.py --font /path/to/Lato-Semibold.ttf
```

The default font path targets a standard Linux `fonts-lato` installation. Fonts and the Cairo system library are not bundled. Tests use the Python standard library and do not need rendering dependencies. Raster bytes can vary with Cairo/font versions; regenerate and review the manifest when intentionally changing the renderer.

## License and identity

Code and non-brand documentation: [Apache License 2.0](LICENSE).
Original name/logo/icon artwork and brand tokens/previews under `brand/` are excluded from the Apache grant; see [brand-use terms](BRAND_LICENSE.md). This separation allows open-source software without granting permission to impersonate the project. It is not a claim of a registered trademark or a resolution of legal ownership outside this repository.

Project hosted by [reallyenglish-global](https://github.com/reallyenglish-global). Hosting and licensing decisions do not themselves settle employment/IP agreements. No third-party provider affiliation is implied.
