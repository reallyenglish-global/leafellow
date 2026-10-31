# Leafellow identity — first edition

**Read deeply. Learn together.**

![Identity board](leafellow-brand-board.png)

## Concept

Two leaf-shaped pages meet at a clear central gutter. They represent a book and two perspectives learning together. The small gold point is a shared discovery, not an AI sparkle or claim of learning success. This is original vector geometry, not stock artwork. The general leaf/book motif is not asserted to be unique.

## Palette

- Forest `#173F35`: primary wordmark, icon background, strong surfaces.
- Fern `#356B52`: companion leaf and secondary accents.
- Sage `#C5D8C1`: reversed companion leaf and quiet supporting surfaces.
- Paper `#F7F3E8`: reading-oriented warm background.
- Ink `#18312B`: proposed UI/body text.
- Gold `#D8AE61`: discovery accent, not small body text on paper.
- Muted `#5D6D60`: supporting text on paper, subject to contrast checks at actual use.

These are brand tokens, not a fully accessibility-certified UI theme. Do not use pale sage/gold as small text on paper. Preserve semantic indicators and test actual text sizes/contrast in implementation.

## Asset inventory

- `leafellow-logo.svg` / reversed: horizontal wordmark with outlined Lato Semibold lettering; no font dependency for display.
- `leafellow-mark.svg` / reversed / mono: transparent symbol; mono inherits `currentColor` (standalone default black).
- `leafellow-icon.svg`: square 256-viewBox master, **unmasked** full-bleed background.
- `leafellow-icon-rounded.svg`: illustrative rounded preview, not the app-store upload source.
- `leafellow-icon-16.png` through `leafellow-icon-1024.png`: square PNG exports; final store platform requirements still need checking.
- `leafellow-icon-foreground.svg`: preliminary separate foreground candidate on a 272-unit canvas. Not an integrated or certified Android adaptive icon; test safe-zone/masks on actual platforms before use.
- `leafellow-brand-board.svg` / PNG: identity overview and small-size check.
- `tokens.json`: proposed colours/typography. `manifest.json`: generated-file checksums.

Keep clear space at least the gold point's diameter around the visible mark, more where possible. Do not stretch, add shadows, recolour arbitrarily or detach the point in official lockups. Use the mono mark when the smallest sizes lose accent detail. Small PNGs are provided for inspection, not a claim that every detail survives 16 pixels.

## Typography / provenance

Wordmark: Lato Semibold rendered to outlines. Suggested app UI: platform system sans. Reading typeface should remain user-selectable, with accessible sizing/line spacing. No font binaries are bundled; see `../THIRD_PARTY_NOTICES.md`.

## Rights

Initial design for review; not a registered/cleared trademark. Assets here have separate reserved brand-use terms in `../BRAND_LICENSE.md`, not Apache-2.0. Public source availability is not unrestricted permission to brand another product as Leafellow.
