# Leafellow

**Read deeply. Learn together.**

![Leafellow brand identity](brand/leafellow-brand-board.png)

An open-source reading companion for understanding difficult passages, bridging missing foundations, and learning with other readers.

## Status

**Early project foundation — not a working ereader yet.** This repository currently contains the initial brand identity, renderer, validation tests, product brief and gated roadmap. There is no mobile application, provider login, inference integration, ebook parser, sync service or social backend yet. Assets are an initial design for review, not trademark clearance.

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
- [Brand guidelines](brand/README.md)
- [Contribution guide](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)

## Check the foundation

```sh
python3 -m unittest discover -s tests -v
```

Rebuild the brand assets (Python 3.10+, Cairo system library, and a local Lato Semibold font):

```sh
uv run --with cairosvg==2.9.1 --with fonttools==4.68.0 python scripts/build_brand.py --font /path/to/Lato-Semibold.ttf
```

The default font path targets a standard Linux `fonts-lato` installation. Fonts and the Cairo system library are not bundled. Tests use the Python standard library and do not need rendering dependencies. Raster bytes can vary with Cairo/font versions; regenerate and review the manifest when intentionally changing the renderer.

## License and identity

Code and non-brand documentation: [Apache License 2.0](LICENSE).
Original name/logo/icon artwork and brand tokens/previews under `brand/` are excluded from the Apache grant; see [brand-use terms](BRAND_LICENSE.md). This separation allows open-source software without granting permission to impersonate the project. It is not a claim of a registered trademark or a resolution of legal ownership outside this repository.

Project hosted by [reallyenglish-global](https://github.com/reallyenglish-global). Hosting and licensing decisions do not themselves settle employment/IP agreements. No third-party provider affiliation is implied.
