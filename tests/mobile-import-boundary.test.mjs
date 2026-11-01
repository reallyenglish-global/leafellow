// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const appEntry = path.join(projectRoot, 'apps/mobile/src/app/index.tsx');

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, ...['.ts', '.tsx', '.mjs', '.js'].map(ext => `${base}${ext}`),
    path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  return candidates.find(candidate => existsSync(candidate) && !candidate.endsWith('.d.ts')) ?? null;
}

function importsIn(source) {
  const imports = new Set();
  const staticImport = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(staticImport)) imports.add(match[1]);
  for (const match of source.matchAll(dynamicImport)) imports.add(match[1]);
  return imports;
}

function mobileImportGraph(entry) {
  const files = new Set();
  const external = new Set();
  const queue = [entry];
  while (queue.length) {
    const filename = queue.pop();
    if (files.has(filename)) continue;
    files.add(filename);
    for (const specifier of importsIn(readFileSync(filename, 'utf8'))) {
      if (specifier.startsWith('.')) {
        const resolved = resolveRelativeImport(filename, specifier);
        if (resolved) queue.push(resolved);
      } else {
        external.add(specifier);
      }
    }
  }
  return { files, external };
}

test('native EPUB reader import graph excludes the PDF.js worker module', () => {
  const graph = mobileImportGraph(appEntry);
  assert.ok([...graph.files].some(file => file.endsWith('/src/reader/import-epub.ts')));
  assert.ok([...graph.external].some(specifier => specifier.startsWith('@epubjs-react-native/')));
  assert.ok(
    ![...graph.external].some(specifier => specifier.startsWith('pdfjs-dist/')),
    'the EPUB-only native app must not bundle PDF.js dynamic worker imports that Hermes cannot parse',
  );
});
