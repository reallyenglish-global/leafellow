// SPDX-License-Identifier: Apache-2.0
import { StyleSheet } from 'react-native';

// The app palette, shared by the reader, the library screen and the database error screen.
export const PAPER = '#F7F3E8';
export const INK = '#18312B';
export const DANGER = '#8D3535';
export const FOREST = '#173F35';
export const MOSS = '#356B52';
export const SAGE = '#C5D8C1';
export const MUTED = '#5D6D60';
export const RULE = '#E1E8DE';
export const CARD = '#FFFFFF';
export const DANGER_WASH = '#FCEEEE';
export const MARKER = '#E8C547';

export const HIGHLIGHT_STYLE = { color: MARKER, opacity: 0.45 };
// Module-level so its identity is stable: Reader reloads the whole WebView when defaultTheme changes.
export const READER_THEME = { body: { color: INK, background: PAPER, 'font-family': 'Georgia, serif', 'line-height': '1.7' } };

export const styles = StyleSheet.create({
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.65 },
  readerScreen: { flex: 1, backgroundColor: PAPER },
  readerHeader: { minHeight: 70, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: FOREST },
  backButton: { paddingVertical: 8, paddingRight: 4 },
  backText: { color: PAPER, fontSize: 15, fontWeight: '600' },
  bookTitle: { flex: 1, color: PAPER, fontSize: 15, fontWeight: '600' },
  progress: { minWidth: 44, color: SAGE, fontSize: 12, textAlign: 'right' },
  readerFrame: { flex: 1, minHeight: 0, overflow: 'hidden' },
  resumeNote: { color: MOSS, fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  selectionCard: { maxHeight: 200, margin: 12, padding: 16, borderRadius: 16, backgroundColor: CARD, borderWidth: 1, borderColor: RULE },
  selectionLabel: { color: MOSS, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  selectionScroll: { maxHeight: 90 },
  selectionText: { color: INK, fontSize: 15, lineHeight: 22 },
  selectionHint: { color: MUTED, fontSize: 11, marginTop: 9, lineHeight: 15 },
  saveButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: FOREST, marginTop: 10 },
  saveButtonText: { color: PAPER, fontSize: 15, fontWeight: '700' },
  notice: { color: MOSS, fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 4 },
  highlightToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderTopWidth: 1, borderColor: RULE },
  highlightToggleText: { color: FOREST, fontSize: 14, fontWeight: '600' },
  highlightPanel: { maxHeight: 420, paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  highlightScroll: { maxHeight: 180 },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  highlightQuote: { flex: 1, color: INK, fontSize: 14, lineHeight: 20 },
  rowButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 6 },
  rowButtonText: { color: FOREST, fontSize: 14, fontWeight: '600' },
  deleteText: { color: DANGER, fontSize: 14, fontWeight: '600' },
  errorText: { flex: 1, color: DANGER, fontSize: 13, lineHeight: 19 },
  exportCard: { padding: 12, borderRadius: 12, backgroundColor: CARD, borderWidth: 1, borderColor: RULE, gap: 6 },
  exportText: { flex: 1, color: INK, fontSize: 13, lineHeight: 19 },
  checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: { color: FOREST, fontSize: 20 },
  exportActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportButton: { flex: 1, marginTop: 0, paddingHorizontal: 12 },
  error: { color: DANGER, fontSize: 14, lineHeight: 20, padding: 12, backgroundColor: DANGER_WASH, borderRadius: 12 },
  loading: { position: 'absolute', top: 86, alignSelf: 'center' },
});
