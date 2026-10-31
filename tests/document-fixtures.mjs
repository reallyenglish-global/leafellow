// SPDX-License-Identifier: Apache-2.0
// Original synthetic fixtures generated at test runtime, not imported books.
import { zipSync, strToU8 } from 'fflate';

export function epubEntries() {
  return {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OPS/package.opf': strToU8('<package><metadata><title>Leafellow test book</title></metadata><manifest><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>'),
    'OPS/one.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Not body text</title></head><body><p>Vectors have <em>direction</em> &amp; length.</p></body></html>'),
    'OPS/two.xhtml': strToU8('<html><body><p>Matrix shapes matter.</p></body></html>'),
  };
}

export function epubBytes(overrides = {}) {
  return zipSync({ ...epubEntries(), ...overrides });
}

export function pdfBytes(texts = ['Vectors point in a direction.', 'Matrix shapes matter.']) {
  // Small, valid ASCII PDF with a real cross-reference table and Helvetica font.
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const text of texts) {
    const page = objects.length + 1;
    kids.push(`${page} 0 R`);
    const escaped = text.replace(/[\\()]/g, '\\$&');
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET` : '';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${texts.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return strToU8(pdf);
}
