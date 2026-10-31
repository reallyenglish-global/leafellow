#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Render original Leafellow brand art. Outputs have separate brand-use terms.

uv run --with cairosvg==2.9.1 --with fonttools==4.68.0 python scripts/build_brand.py
Pass --font /path/to/Lato-Semibold.ttf when the system font is elsewhere.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path

import cairosvg
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'brand'
COLORS = {'forest': '#173F35', 'fern': '#356B52', 'sage': '#C5D8C1',
          'paper': '#F7F3E8', 'ink': '#18312B', 'gold': '#D8AE61', 'muted': '#5D6D60'}


def svg(body, width, height, title='Leafellow', description='Two leaf-shaped pages and a shared point of discovery.'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">'
            f'<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(description)}</desc>{body}</svg>\n')


def mark(left, right, dot, veins=None):
    body = (f'<path fill="{left}" d="M122 193C106 176 76 177 60 159C43 140 48 103 46 70C79 66 109 80 122 105Z"/>'
            f'<path fill="{right}" d="M134 193C150 176 180 177 196 159C213 140 208 103 210 70C177 66 147 80 134 105Z"/>'
            f'<circle cx="128" cy="53" r="7" fill="{dot}"/>')
    if veins:
        body += (f'<g fill="none" stroke="{veins}" stroke-width="4" stroke-linecap="round">'
                 '<path d="M70 100C90 106 103 120 108 143"/><path d="M186 100C166 106 153 120 148 143"/></g>')
    return body


def text_path(font, text, x, baseline, size, color, tracking=0):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    units = font['head'].unitsPerEm
    scale = size / units
    cursor = 0
    result = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        result.append(f'<path fill="{color}" transform="translate({x + cursor * scale:.3f} {baseline}) scale({scale:.6f} {-scale:.6f})" d="{pen.getCommands()}"/>')
        cursor += glyphs[name].width + tracking / scale
    return ''.join(result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--font', default='/usr/share/fonts/truetype/lato/Lato-Semibold.ttf')
    args = parser.parse_args()
    font = TTFont(args.font)
    OUT.mkdir(parents=True, exist_ok=True)
    light = mark(COLORS['forest'], COLORS['fern'], COLORS['gold'])
    dark = mark(COLORS['paper'], COLORS['sage'], COLORS['gold'])
    mono = mark('currentColor', 'currentColor', 'currentColor')
    files = {
        'leafellow-mark.svg': svg(light, 256, 256),
        'leafellow-mark-reversed.svg': svg(dark, 256, 256),
        'leafellow-mark-mono.svg': svg(mono, 256, 256),
        'leafellow-logo.svg': svg('<g transform="translate(-8 -4) scale(.53)">'+light+'</g>'+text_path(font, 'Leafellow', 131, 87, 66, COLORS['forest']), 470, 128),
        'leafellow-logo-reversed.svg': svg('<g transform="translate(-8 -4) scale(.53)">'+dark+'</g>'+text_path(font, 'Leafellow', 131, 87, 66, COLORS['paper']), 470, 128),
        'leafellow-icon.svg': svg('<rect width="256" height="256" fill="'+COLORS['forest']+'"/>'+dark, 256, 256),
        'leafellow-icon-rounded.svg': svg('<rect width="256" height="256" rx="56" fill="'+COLORS['forest']+'"/>'+dark, 256, 256),
        'leafellow-icon-foreground.svg': svg('<g transform="translate(40 40) scale(.75)">'+dark+'</g>', 272, 272),
    }
    for name, value in files.items():
        (OUT/name).write_text(value)
    for size in [16, 32, 48, 64, 128, 192, 256, 512, 1024]:
        cairosvg.svg2png(bytestring=files['leafellow-icon.svg'].encode(), write_to=str(OUT/f'leafellow-icon-{size}.png'), output_width=size, output_height=size)
    cairosvg.svg2png(bytestring=files['leafellow-logo.svg'].encode(), write_to=str(OUT/'leafellow-logo.png'), output_width=1410, output_height=384)
    # Brand board uses outlined lettering, no web fonts or external resources.
    board = '<rect width="1600" height="1320" fill="'+COLORS['paper']+'"/>'
    board += text_path(font, 'LEAFELLOW / IDENTITY 01', 76, 73, 18, COLORS['muted'], 2)
    board += '<g transform="translate(55 110) scale(1.45)">'+files['leafellow-logo.svg'].split('</desc>',1)[1].rsplit('</svg>',1)[0]+'</g>'
    board += text_path(font, 'Read deeply. Learn together.', 80, 345, 40, COLORS['forest'])
    board += text_path(font, 'A reading companion for the questions between the lines.', 82, 391, 23, COLORS['muted'])
    board += '<rect x="80" y="447" width="920" height="412" rx="28" fill="'+COLORS['forest']+'"/>'
    board += '<g transform="translate(116 481) scale(1.2)">'+dark+'</g>'
    board += text_path(font, 'A leaf. A page.', 465, 575, 35, COLORS['paper'])
    board += text_path(font, 'A fellow learner.', 465, 626, 35, COLORS['sage'])
    board += text_path(font, 'Two perspectives, one shared discovery.', 465, 704, 20, COLORS['sage'])
    board += '<rect x="1040" y="447" width="480" height="412" rx="28" fill="#E8E8DC"/>'
    board += '<g transform="translate(1152 488)"><rect width="256" height="256" rx="56" fill="'+COLORS['forest']+'"/>'+dark+'</g>'
    board += text_path(font, 'APP ICON / PREVIEW MASK', 1103, 810, 16, COLORS['forest'], 1)
    for i,key in enumerate(['forest','fern','sage','paper','gold']):
        x=80+i*292
        board += f'<rect x="{x}" y="910" width="264" height="92" rx="12" fill="{COLORS[key]}" stroke="#D4D9CA"/>'
        board += text_path(font, key.upper(), x, 1033, 17, COLORS['forest'], 1)
        board += text_path(font, COLORS[key], x, 1064, 20, COLORS['muted'])
    board += text_path(font, 'SMALL-SIZE CHECK', 80, 1155, 15, COLORS['muted'], 1)
    for i,size in enumerate([16,24,32,48,64]):
        x=80+i*112
        board += f'<g transform="translate({x} 1180) scale({size/256})"><rect width="256" height="256" rx="48" fill="{COLORS["forest"]}"/>'+dark+'</g>'
        board += text_path(font, str(size), x, 1280, 13, COLORS['muted'])
    board += text_path(font, 'Initial design / not trademark clearance', 1040, 1262, 18, COLORS['muted'])
    (OUT/'leafellow-brand-board.svg').write_text(svg(board,1600,1320,'Leafellow brand identity','Logo, app icon, palette and small-size checks. Initial design for review.'))
    cairosvg.svg2png(bytestring=(OUT/'leafellow-brand-board.svg').read_bytes(), write_to=str(OUT/'leafellow-brand-board.png'))
    (OUT/'tokens.json').write_text(json.dumps({'colors':COLORS,'typography':{'wordmark':'Outlined Lato Semibold','interface_proposal':'System sans serif','reading_proposal':'User-selected serif or sans serif'},'icon_background':COLORS['forest']},indent=2)+'\n')
    outputs = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(OUT.iterdir()) if p.suffix in {'.svg','.png','.json'} and p.name!='manifest.json'}
    (OUT/'manifest.json').write_text(json.dumps(outputs,indent=2)+'\n')
    print(f'Generated {len(outputs)} brand outputs plus manifest')


if __name__ == '__main__':
    main()
