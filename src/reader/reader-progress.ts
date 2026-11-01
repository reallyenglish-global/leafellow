// SPDX-License-Identifier: Apache-2.0
/** Convert epubjs-react-native's integer percent callback to our persisted 0..1 fraction. */
export function normalizeEpubReaderProgress(progressPercent: number): number {
  if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new TypeError('Invalid EPUB reader progress');
  }
  return progressPercent / 100;
}
