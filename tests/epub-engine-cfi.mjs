// SPDX-License-Identifier: Apache-2.0
// Loads the CFI class from the epub.js bundle that @epubjs-react-native/core injects into its
// WebView, so passage-jump tests use the engine's own comparator rather than a reimplementation.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);

export function loadEngineEpub() {
  const corePath = require.resolve('@epubjs-react-native/core/package.json', {
    paths: [new URL('../apps/mobile/', import.meta.url).pathname],
  });
  const bundlePath = corePath.replace(/package\.json$/, 'lib/module/epubjs.js');
  const moduleText = readFileSync(bundlePath, 'utf8');
  // The module is `export default \`...\``; evaluate only the template literal to get the script.
  const source = new Function(`return ${moduleText.replace(/^export default /, '').replace(/;\s*$/, '')}`)();
  const sandbox = { module: { exports: {} }, require: () => ({}), window: {}, navigator: { userAgent: '' }, console };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);
  const ePub = sandbox.module.exports.default ?? sandbox.module.exports;
  if (typeof ePub !== 'function' || typeof ePub.CFI !== 'function') throw new Error('epub.js CFI export not found');
  return { ePub, bundlePath };
}
