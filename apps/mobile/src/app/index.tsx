// SPDX-License-Identifier: Apache-2.0
import { Reader, ReaderProvider, useReader } from '@epubjs-react-native/core';
import { useFileSystem } from '@epubjs-react-native/expo-file-system';
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { captureSelection, isSelectionCurrent, type PendingSelection } from '../../../../src/reader/highlight-selection';
import { inspectEpub, validateEpubFile } from '../../../../src/reader/import-epub';
import {
  PASSAGE_JUMP_TIMEOUT_MS,
  buildPassageJumpScript,
  createPassageJumpRequest,
  passageJumpFailure,
  passageJumpStatus,
  readPassageJumpMessage,
  type PassageJumpOutcome,
  type PassageJumpRequest,
} from '../../../../src/reader/passage-jump';
import { normalizeEpubReaderProgress } from '../../../../src/reader/reader-progress';
import {
  createExportGuard,
  exportFileName,
  runHighlightExport,
  serializeHighlightExport,
  type ExportOutcome,
} from '../../../../src/storage/highlight-export';
import { createExportFlow, type ExportFlowResult, type ExportFlowState } from '../../../../src/storage/highlight-export-flow';
import { createHighlightSession } from '../../../../src/storage/highlight-session';
import { clearLastReadingPosition, loadLastReadingPosition, saveLastReadingPosition } from '../../../../src/storage/reading-position';
import { HighlightExportUnreadableError, HighlightOutcomeUnknownError, type SavedHighlight } from '../../../../src/storage/saved-highlights';
import { createSerialWriter } from '../../../../src/storage/serial-writes';
import { systemFolderDestination } from '../highlight-export-destination';
import { createAppRendererSources } from '../reader-source-fs';

// uri is what the renderer loads: the picked file itself, or an app-owned temporary cache copy of
// its validated bytes (Android). release removes that copy, if any.
type OpenBook = { name: string; uri: string; id: string; resumeCfi: string | null; release: () => void };
// The renderer reports no error when its WebView never loads the book, so stop waiting honestly.
const READER_OPEN_TIMEOUT_MS = 30_000;
type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; unreadable: number };
const plural = (count: number) => `${count} highlight${count === 1 ? '' : 's'}`;

function describeExport(outcome: ExportOutcome, count: number): { message: string; failed: boolean } {
  switch (outcome.status) {
    case 'written':
      // The requested name is reported as requested: a storage provider may store it under another name.
      return { failed: false, message: `Exported ${plural(count)} to the folder you chose and checked the file by reading it back. Leafellow asked for the name ${outcome.fileName}; some storage providers save it under a different name. Leafellow does not upload it; the storage provider for that folder may sync it.` };
    case 'cancelled':
      return { failed: false, message: 'Export cancelled. No file was created.' };
    case 'not-completed':
      return { failed: true, message: 'The folder could not be opened, so nothing was exported.' };
    case 'failed':
      if (outcome.stage === 'exists') return { failed: true, message: 'A file with the export name already exists there. Leafellow did not write to it or remove it, and nothing was exported.' };
      if (outcome.stage === 'create') return { failed: true, message: 'The export file could not be created in that folder, so nothing was exported. Some storage providers can leave an empty file behind; Leafellow did not write to it or remove it.' };
      if (outcome.cleanup === 'failed') {
        return { failed: true, message: 'The export could not be written and checked, and the new file could not be removed. An incomplete export file may remain in that folder; do not rely on it.' };
      }
      return { failed: true, message: 'The export could not be written and checked, so the new file was removed. Nothing was exported.' };
  }
}

function describeExportResult(result: ExportFlowResult): { message: string; failed: boolean } {
  switch (result.kind) {
    case 'empty':
      return { failed: false, message: 'This book has no saved highlights yet, so there is nothing to export.' };
    case 'prepare-failed':
      return {
        failed: true,
        message: result.reason instanceof HighlightExportUnreadableError
          ? `${plural(result.reason.unreadable)} could not be read, so no partial export was made. Nothing was written.`
          : 'Saved highlights could not be prepared for export. Nothing was written.',
      };
    case 'outcome':
      return describeExport(result.outcome, result.count);
    case 'error':
      return { failed: true, message: 'The export could not be completed. Do not rely on any file it may have created.' };
  }
}

function exportId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0x100000000).toString(36)}`;
}

const HIGHLIGHT_STYLE = { color: '#E8C547', opacity: 0.45 };
// Module-level so its identity is stable: Reader reloads the whole WebView when defaultTheme changes.
const READER_THEME = { body: { color: '#18312B', background: '#F7F3E8', 'font-family': 'Georgia, serif', 'line-height': '1.7' } };

function highlightCfi(highlight: SavedHighlight): string {
  return highlight.annotation.anchor.format === 'epub' ? highlight.annotation.anchor.cfi : '';
}

function sortHighlights(list: SavedHighlight[]): SavedHighlight[] {
  return [...list].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function ReaderSurface({ book, onClose }: { book: OpenBook; onClose: () => void }) {
  const db = useSQLiteContext();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [selectionNotice, setSelectionNotice] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [positionError, setPositionError] = useState('');
  const [highlights, setHighlights] = useState<SavedHighlight[]>([]);
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [highlightMessage, setHighlightMessage] = useState('');
  const [highlightError, setHighlightError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHighlights, setShowHighlights] = useState(false);
  const [jump, setJump] = useState<{ id: string; request: PassageJumpRequest } | null>(null);
  const [closing, setClosing] = useState(false);
  // Bumped on every engine onReady, including WebView reloads, which drop all drawn marks.
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [markError, setMarkError] = useState('');
  const [openStalled, setOpenStalled] = useState(false);
  const reader = useReader();
  const readerRef = useRef(reader);
  const [writer] = useState(createSerialWriter);
  const [session] = useState(() => createHighlightSession(db, book.id, writer));
  // Held from snapshot through preview, folder picker and write; saves, deletes and close wait.
  const [exportGuard] = useState(createExportGuard);
  const [exportState, setExportState] = useState<ExportFlowState>({ status: 'idle' });
  const active = useRef(true);
  // Handlers ask the flow, not exportState: two taps before a re-render must not act on stale state.
  const [exportFlow] = useState(() => createExportFlow({
    guard: exportGuard,
    async prepare() {
      // Queued behind every accepted save and delete, and no new ones start while the guard is held.
      const snapshot = await session.exportSnapshot();
      return { count: snapshot.length, text: serializeHighlightExport(book.id, snapshot) };
    },
    fileName: () => exportFileName(book.id, exportId()),
    run: ({ text, fileName }) => runHighlightExport({ text, fileName, destination: systemFolderDestination }),
    isActive: () => active.current,
    onChange: state => { if (active.current) setExportState(state); },
  }));
  const currentHref = useRef<string | null>(null);
  const applied = useRef(new Set<string>());
  const pendingJump = useRef<PassageJumpRequest | null>(null);

  const loadHighlights = useCallback(async () => {
    setListState({ status: 'loading' });
    const result = await session.load();
    if (!active.current || result.status === 'stale') return;
    if (result.status === 'error') {
      setListState({ status: 'error' });
      return;
    }
    setHighlights(result.highlights);
    setListState({ status: 'ready', unreadable: result.unreadable });
  }, [session]);

  useEffect(() => {
    active.current = true;
    void loadHighlights();
    return () => { active.current = false; };
  }, [loadHighlights]);

  useEffect(() => { readerRef.current = reader; });

  useEffect(() => {
    if (readyGeneration > 0) {
      setOpenStalled(false);
      return;
    }
    const timer = setTimeout(() => setOpenStalled(true), READER_OPEN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [readyGeneration]);

  // Reconcile drawn marks with the stored list for the current WebView instance only.
  useEffect(() => {
    if (readyGeneration === 0) return;
    const wanted = new Map(highlights.map(highlight => [highlightCfi(highlight), highlight] as const));
    let failed = 0;
    for (const cfi of [...applied.current]) {
      if (wanted.has(cfi)) continue;
      try {
        readerRef.current.removeAnnotationByCfi(cfi);
        applied.current.delete(cfi);
      } catch {
        failed += 1;
      }
    }
    for (const [cfi, highlight] of wanted) {
      if (!cfi || applied.current.has(cfi)) continue;
      try {
        readerRef.current.addAnnotation('highlight', cfi, { id: highlight.id }, HIGHLIGHT_STYLE);
        applied.current.add(cfi);
      } catch {
        failed += 1;
      }
    }
    setMarkError(failed > 0
      ? 'Some highlight marks could not be updated on the page. Your saved highlights are unchanged.'
      : '');
  }, [readyGeneration, highlights]);

  const finishJump = useCallback((outcome: PassageJumpOutcome) => {
    pendingJump.current = null;
    setJump(null);
    if (outcome.status === 'confirmed') {
      setHighlightMessage(outcome.fullyVisible
        ? 'Showing this highlight.'
        : 'Showing the start of this highlight; it continues below.');
    } else if (outcome.status === 'failed') {
      setHighlightError(outcome.reason);
    }
  }, []);

  useEffect(() => {
    if (!jump) return;
    const timer = setTimeout(() => {
      if (pendingJump.current === jump.request) finishJump(passageJumpStatus(jump.request, Date.now()));
    }, Math.max(0, PASSAGE_JUMP_TIMEOUT_MS - (Date.now() - jump.request.requestedAt)));
    return () => clearTimeout(timer);
  }, [jump, finishJump]);

  function handleReady(location: { start?: { href?: string } } | undefined) {
    currentHref.current = location?.start?.href ?? null;
    applied.current = new Set();
    if (pendingJump.current) finishJump(passageJumpFailure('reloaded'));
    setReadyGeneration(generation => generation + 1);
  }

  function handleWebViewMessage(message: unknown) {
    const outcome = readPassageJumpMessage(pendingJump.current, message);
    if (outcome && outcome.status !== 'in-progress') finishJump(outcome);
  }

  function saveLocation(cfi: string, progressFraction: number) {
    if (writer.isClosed()) return;
    const position = { documentId: book.id, cfi, progress: progressFraction, updatedAt: Date.now() };
    writer.run(() => saveLastReadingPosition(db, position))
      .then(() => { if (active.current) setPositionError(''); })
      .catch(() => { if (active.current) setPositionError('The reading position could not be saved on this device.'); });
  }

  function handleSelected(text: string, cfiRange: string) {
    setHighlightMessage('');
    setHighlightError('');
    const result = captureSelection(text, cfiRange, {
      documentId: book.id,
      // Only this book's own location report; never provider state that may predate it.
      href: currentHref.current,
      selectedAt: Date.now(),
    });
    if (result.ok) {
      setSelection(result.selection);
      setSelectionNotice('');
    } else {
      setSelection(null);
      setSelectionNotice(result.reason);
    }
  }

  function saveSelection() {
    const pending = selection;
    if (!pending || saving || writer.isClosed() || exportGuard.isBusy() || listState.status !== 'ready') return;
    if (!isSelectionCurrent(pending, { documentId: book.id, href: currentHref.current })) {
      setSelection(null);
      setSelectionNotice('The reader moved since this passage was selected. Select it again to save it.');
      return;
    }
    setSaving(true);
    setHighlightMessage('');
    setHighlightError('');
    session.save({
      documentId: pending.documentId, exact: pending.exact, cfi: pending.cfi, href: pending.href, createdAt: Date.now(),
    })
      .then(({ highlight: saved, created }) => {
        if (!active.current) return;
        setHighlights(current => sortHighlights([...current.filter(item => item.id !== saved.id), saved]));
        setSelection(current => (current === pending ? null : current));
        setHighlightMessage(created ? 'Highlight saved on this device.' : 'This passage was already saved.');
      })
      .catch((reason: unknown) => {
        if (!active.current) return;
        if (reason instanceof HighlightOutcomeUnknownError) {
          setHighlightError('The save may have finished, but it could not be confirmed. Checking saved highlights again.');
          void loadHighlights();
          return;
        }
        setHighlightError(reason instanceof RangeError ? `Not saved: ${reason.message}.` : 'The highlight could not be saved on this device. Nothing was saved.');
      })
      .finally(() => { if (active.current) setSaving(false); });
  }

  function goToHighlight(highlight: SavedHighlight) {
    const cfi = highlightCfi(highlight);
    if (!cfi || pendingJump.current || highlight.annotation.anchor.format !== 'epub') return;
    setHighlightMessage('');
    setHighlightError('');
    let request: PassageJumpRequest;
    try {
      request = createPassageJumpRequest(cfi, highlight.annotation.quote.exact, Date.now());
    } catch {
      finishJump(passageJumpFailure('invalid-target'));
      return;
    }
    pendingJump.current = request;
    setJump({ id: highlight.id, request });
    try {
      reader.injectJavascript(buildPassageJumpScript(request));
    } catch {
      finishJump(passageJumpFailure('engine-unavailable'));
    }
  }

  function deleteHighlight(highlight: SavedHighlight) {
    if (deletingId || writer.isClosed() || exportGuard.isBusy()) return;
    setDeletingId(highlight.id);
    setHighlightMessage('');
    setHighlightError('');
    // The marks effect removes the drawn mark once the row leaves the list.
    session.remove(highlight.id)
      .then(removed => {
        if (!active.current) return;
        setHighlights(current => current.filter(item => item.id !== highlight.id));
        setHighlightMessage(removed ? 'Highlight deleted.' : 'This highlight was already gone.');
      })
      .catch((reason: unknown) => {
        if (!active.current) return;
        if (reason instanceof HighlightOutcomeUnknownError) {
          setHighlightError('The delete may have finished, but it could not be confirmed. Checking saved highlights again.');
          void loadHighlights();
          return;
        }
        setHighlightError('The highlight could not be deleted. It is still saved.');
      })
      .finally(() => { if (active.current) setDeletingId(null); });
  }

  function startExport() {
    if (closing || writer.isClosed()) return;
    if (!exportFlow.start()) return;
    setHighlightMessage('');
    setHighlightError('');
  }

  function cancelExport() {
    exportFlow.cancel();
  }

  function confirmExport() {
    void exportFlow.confirm();
  }

  const exportResult = exportState.status === 'finished' ? describeExportResult(exportState.result) : null;

  const exportBusy = exportState.status === 'preparing' || exportState.status === 'preview' || exportState.status === 'writing';
  const canSave = !saving && !closing && !exportBusy && listState.status === 'ready';
  const canExport = !closing && !exportBusy && listState.status === 'ready' && highlights.length > 0;

  async function closeReader() {
    if (closing || exportGuard.isBusy()) return;
    setClosing(true);
    setSelection(null);
    pendingJump.current = null;
    await writer.close();
    active.current = false;
    onClose();
  }

  return (
    <View style={[styles.readerScreen, { paddingBottom: insets.bottom }]}>
      <View style={[styles.readerHeader, { paddingTop: 12 + insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closing ? 'Finishing saves before returning to library'
            : exportBusy ? 'Back to library, unavailable until the export finishes or is cancelled' : 'Back to library'}
          accessibilityState={{ disabled: closing || exportBusy }}
          disabled={closing || exportBusy}
          testID="reader-back"
          onPress={() => { void closeReader(); }}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Library</Text>
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.bookTitle}>{book.name}</Text>
        <Text style={styles.progress}>{progress === null ? 'Opening…' : `${Math.round(progress)}%`}</Text>
      </View>
      <View style={styles.readerFrame}>
        <Reader
          key={book.id}
          src={book.uri}
          fileSystem={useFileSystem}
          width={width}
          height={Math.max(240, height - insets.top - insets.bottom - (selection || showHighlights ? 300 : 180))}
          initialLocation={book.resumeCfi ?? undefined}
          flow="scrolled-doc"
          spread="none"
          enableSelection
          allowScriptedContent={false}
          allowPopups={false}
          defaultTheme={READER_THEME}
          onReady={(_total, location) => handleReady(location)}
          onWebViewMessage={handleWebViewMessage}
          onSelected={handleSelected}
          onPressAnnotation={(annotation) => {
            const pressed = highlights.find(item => highlightCfi(item) === annotation.cfiRange);
            if (pressed) {
              setShowHighlights(true);
              setHighlightMessage(`Saved highlight: “${pressed.annotation.quote.exact.trim().slice(0, 80)}”`);
            }
          }}
          onLocationChange={(_total, location, nextProgressPercent) => {
            const href = location.start.href;
            if (href !== currentHref.current) {
              currentHref.current = href;
              if (selection && !isSelectionCurrent(selection, { documentId: book.id, href })) {
                setSelection(null);
                setSelectionNotice('The reader moved to another chapter, so the earlier selection was cleared.');
              }
            }
            setProgress(nextProgressPercent);
            try {
              saveLocation(location.start.cfi, normalizeEpubReaderProgress(nextProgressPercent));
            } catch {
              setPositionError('The reader reported invalid progress; this position was not saved.');
            }
          }}
          onDisplayError={(reason) => setError(`This EPUB could not be displayed: ${reason}`)}
        />
      </View>
      {book.resumeCfi ? <Text style={styles.resumeNote}>Resumed from this book’s last saved reading position.</Text> : null}
      {selection ? (
        <View style={styles.selectionCard}>
          <Text style={styles.selectionLabel}>PASSAGE PREVIEW</Text>
          <ScrollView style={styles.selectionScroll}>
            <Text selectable testID="passage-preview-text" style={styles.selectionText}>{selection.exact}</Text>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save this passage as a private highlight"
            accessibilityState={{ disabled: !canSave, busy: saving }}
            disabled={!canSave}
            testID="save-highlight"
            onPress={saveSelection}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, !canSave && styles.disabled]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving…' : listState.status === 'ready' ? 'Save highlight' : 'Waiting for saved highlights…'}
            </Text>
          </Pressable>
          <Text style={styles.selectionHint}>Highlights are stored locally on this device; no automatic upload. AI explanations are not connected in this prototype.</Text>
        </View>
      ) : null}
      {selectionNotice ? <Text accessibilityRole="alert" style={styles.notice}>{selectionNotice}</Text> : null}
      {highlightMessage ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{highlightMessage}</Text> : null}
      {highlightError ? <Text accessibilityRole="alert" style={styles.error}>{highlightError}</Text> : null}
      {markError ? <Text accessibilityRole="alert" style={styles.error}>{markError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showHighlights }}
        testID="highlights-toggle"
        onPress={() => setShowHighlights(open => !open)}
        style={styles.highlightToggle}
      >
        <Text style={styles.highlightToggleText}>
          {listState.status === 'loading' ? 'Loading highlights…'
            : listState.status === 'error' ? 'Highlights unavailable'
              : `${showHighlights ? 'Hide' : 'Show'} highlights (${highlights.length})`}
        </Text>
      </Pressable>
      {showHighlights ? (
        <View style={styles.highlightPanel}>
          {listState.status === 'error' ? (
            <View style={styles.highlightRow}>
              <Text accessibilityRole="alert" style={styles.errorText}>Saved highlights could not be read from this device.</Text>
              <Pressable accessibilityRole="button" onPress={() => { void loadHighlights(); }} style={styles.rowButton}>
                <Text style={styles.rowButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {listState.status === 'ready' && listState.unreadable > 0 ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {listState.unreadable} saved highlight{listState.unreadable === 1 ? '' : 's'} could not be read and {listState.unreadable === 1 ? 'is' : 'are'} not shown.
            </Text>
          ) : null}
          {listState.status === 'ready' && highlights.length === 0 ? (
            <Text style={styles.selectionHint}>No saved highlights for this book yet. Select a passage, then choose Save highlight. Export becomes available once a highlight is saved.</Text>
          ) : null}
          {exportState.status === 'preview' ? (
            <View style={styles.exportCard}>
              <Text accessibilityRole="header" style={styles.selectionLabel}>EXPORT THIS BOOK’S HIGHLIGHTS</Text>
              <Text style={styles.exportText}>
                {plural(exportState.count)} from this book only, as one JSON file. It contains the exact highlighted passages, any notes, their positions in this EPUB and the book’s content hash. It does not contain the book itself.
              </Text>
              <Text style={styles.exportText}>
                Leafellow writes the file only to the folder you choose next and does not upload it. If that folder belongs to a cloud or synced storage provider, that provider may sync it.
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: exportState.acknowledged }}
                accessibilityLabel="I understand the exported file leaves Leafellow’s private storage"
                testID="export-acknowledge"
                onPress={() => {
                  const current = exportFlow.state();
                  if (current.status === 'preview') exportFlow.setAcknowledged(!current.acknowledged);
                }}
                style={styles.checkRow}
              >
                <Text style={styles.checkBox}>{exportState.acknowledged ? '☑' : '☐'}</Text>
                <Text style={styles.exportText}>I understand the file leaves Leafellow’s private storage.</Text>
              </Pressable>
              <View style={styles.exportActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose a folder and export ${plural(exportState.count)}`}
                  accessibilityState={{ disabled: !exportState.acknowledged }}
                  disabled={!exportState.acknowledged}
                  testID="export-confirm"
                  onPress={confirmExport}
                  style={({ pressed }) => [styles.saveButton, styles.exportButton, pressed && styles.pressed, !exportState.acknowledged && styles.disabled]}
                >
                  <Text style={styles.saveButtonText}>Choose folder and export</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Cancel export" onPress={cancelExport} style={styles.rowButton}>
                  <Text style={styles.rowButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Export this book’s ${plural(highlights.length)} to a folder you choose`}
              accessibilityState={{ disabled: !canExport, busy: exportBusy }}
              disabled={!canExport}
              testID="export-start"
              onPress={startExport}
              style={[styles.rowButton, !canExport && styles.disabled]}
            >
              <Text style={styles.rowButtonText}>
                {exportState.status === 'preparing' ? 'Preparing export…'
                  : exportState.status === 'writing' ? 'Exporting… do not close the app'
                    : highlights.length === 0 ? 'Export highlights (none saved yet)' : 'Export highlights…'}
              </Text>
            </Pressable>
          )}
          {exportResult ? (
            <Text accessibilityRole={exportResult.failed ? 'alert' : undefined} accessibilityLiveRegion="polite"
              style={exportResult.failed ? styles.errorText : styles.notice}>
              {exportResult.message}
            </Text>
          ) : null}
          <ScrollView style={styles.highlightScroll}>
            {highlights.map(highlight => (
              <View key={highlight.id} style={styles.highlightRow}>
                <Text numberOfLines={2} style={styles.highlightQuote}>{highlight.annotation.quote.exact.trim()}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Go to highlight: ${highlight.annotation.quote.exact.trim().slice(0, 60)}`}
                  accessibilityState={{ disabled: jump !== null || closing || readyGeneration === 0, busy: jump?.id === highlight.id }}
                  disabled={jump !== null || closing || readyGeneration === 0}
                  testID="highlight-go-to"
                  onPress={() => goToHighlight(highlight)}
                  style={styles.rowButton}
                >
                  <Text style={styles.rowButtonText}>{jump?.id === highlight.id ? 'Checking…' : 'Go to'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete highlight: ${highlight.annotation.quote.exact.trim().slice(0, 60)}`}
                  accessibilityState={{ disabled: deletingId !== null || closing || exportBusy, busy: deletingId === highlight.id }}
                  disabled={deletingId !== null || closing || exportBusy}
                  testID="highlight-delete"
                  onPress={() => deleteHighlight(highlight)}
                  style={styles.rowButton}
                >
                  <Text style={styles.deleteText}>{deletingId === highlight.id ? 'Deleting…' : 'Delete'}</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {openStalled && !error ? (
        <Text accessibilityRole="alert" testID="reader-open-error" style={styles.error}>
          This book did not finish opening. Go back to the library and choose it again.
        </Text>
      ) : null}
      {positionError ? <Text accessibilityRole="alert" style={styles.error}>{positionError}</Text> : null}
      {reader.isLoading ? <ActivityIndicator accessibilityLabel="Loading book" style={styles.loading} color="#356B52" /> : null}
    </View>
  );
}

// One ReaderProvider per open book, so no engine state (section, annotations, location) from a
// previously opened book can reach this one.
function ReaderScreen({ book, onClose }: { book: OpenBook; onClose: () => void }) {
  return (
    <ReaderProvider>
      <ReaderSurface book={book} onClose={onClose} />
    </ReaderProvider>
  );
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const [book, setBook] = useState<OpenBook | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [rendererSources] = useState(createAppRendererSources);
  const openBook = useRef<OpenBook | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Removes temporary copies left behind if the app stopped while a book was open.
    rendererSources.sweep();
    return () => {
      mounted.current = false;
      openBook.current?.release();
      openBook.current = null;
    };
  }, [rendererSources]);

  function closeBook() {
    openBook.current?.release();
    openBook.current = null;
    setBook(null);
    setMessage('');
  }

  async function openEpub() {
    setBusy(true);
    setMessage('');
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['application/epub+zip'] });
      if (picked.canceled) return;
      const file = picked.result;
      validateEpubFile(file.name, file.size);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const inspected = await inspectEpub(bytes);
      // The renderer gets exactly these validated bytes; the picked file is never read again.
      const source = await rendererSources.prepare(file.uri, bytes);
      try {
        const saved = await loadLastReadingPosition(db, inspected.id);
        if (!mounted.current) {
          source.release();
          return;
        }
        const next: OpenBook = { name: file.name, uri: source.uri, id: inspected.id, resumeCfi: saved?.cfi ?? null, release: source.release };
        openBook.current = next;
        setBook(next);
      } catch (error) {
        source.release();
        throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The EPUB could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  function forgetPosition() {
    Alert.alert(
      'Forget saved reading position?',
      'This clears the one saved EPUB location from this device. It does not delete your original book file.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            void clearLastReadingPosition(db)
              .then(() => setMessage('Saved reading position cleared.'))
              .catch(() => setMessage('The saved reading position could not be cleared.'));
          },
        },
      ],
    );
  }

  if (book) return <ReaderScreen key={book.id} book={book} onClose={closeBook} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Leafellow', headerShown: false }} />
      <View style={styles.home}>
        <Text style={styles.wordmark}>leafellow</Text>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>A CALMER WAY TO READ DIFFICULT THINGS</Text>
          <Text accessibilityRole="header" style={styles.title}>Read a little.{ '\n' }Understand more.</Text>
          <Text style={styles.description}>Bring a book. Pause on a passage. Build understanding one small step at a time.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose an EPUB to read"
            disabled={busy}
            testID="open-epub"
            onPress={openEpub}
            style={({ pressed }) => [styles.openButton, pressed && styles.pressed, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator color="#F7F3E8" /> : <Text style={styles.openButtonText}>Choose an EPUB</Text>}
          </Pressable>
          {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
          <Text style={styles.note}>Re-select the same EPUB to resume. Positions and private highlights are stored locally, with no automatic upload. Some files need a temporary reading copy in app cache; cleanup is attempted on close and next start. A crash or cleanup error may leave it there until a later cleanup.</Text>
          <Pressable accessibilityRole="button" onPress={forgetPosition} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Forget saved position</Text>
          </Pressable>
        </View>
        <Text style={styles.footer}>Your book, your pace.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F3E8' },
  home: { flex: 1, paddingHorizontal: 26, paddingTop: 18, paddingBottom: 20, justifyContent: 'space-between', backgroundColor: '#F7F3E8' },
  wordmark: { color: '#173F35', fontSize: 23, fontWeight: '700', letterSpacing: -0.8 },
  hero: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 18, paddingVertical: 24 },
  eyebrow: { color: '#5D6D60', fontSize: 11, letterSpacing: 1.7, fontWeight: '700' },
  title: { color: '#18312B', fontSize: 38, lineHeight: 44, fontWeight: '600', letterSpacing: -1.1 },
  description: { color: '#5D6D60', fontSize: 17, lineHeight: 26, maxWidth: 390 },
  openButton: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173F35', paddingHorizontal: 22, marginTop: 4 },
  openButtonText: { color: '#F7F3E8', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.65 },
  note: { color: '#5D6D60', fontSize: 13, lineHeight: 19 },
  message: { color: '#356B52', fontSize: 13, lineHeight: 19 },
  clearButton: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  clearButtonText: { color: '#5D6D60', fontSize: 13, textDecorationLine: 'underline' },
  footer: { color: '#5D6D60', fontSize: 13, textAlign: 'center' },
  readerScreen: { flex: 1, backgroundColor: '#F7F3E8' },
  readerHeader: { minHeight: 70, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#173F35' },
  backButton: { paddingVertical: 8, paddingRight: 4 },
  backText: { color: '#F7F3E8', fontSize: 15, fontWeight: '600' },
  bookTitle: { flex: 1, color: '#F7F3E8', fontSize: 15, fontWeight: '600' },
  progress: { minWidth: 44, color: '#C5D8C1', fontSize: 12, textAlign: 'right' },
  readerFrame: { flex: 1, overflow: 'hidden' },
  resumeNote: { color: '#356B52', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  selectionCard: { maxHeight: 200, margin: 12, padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E8DE' },
  selectionLabel: { color: '#356B52', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  selectionScroll: { maxHeight: 90 },
  selectionText: { color: '#18312B', fontSize: 15, lineHeight: 22 },
  selectionHint: { color: '#5D6D60', fontSize: 11, marginTop: 9, lineHeight: 15 },
  saveButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173F35', marginTop: 10 },
  saveButtonText: { color: '#F7F3E8', fontSize: 15, fontWeight: '700' },
  notice: { color: '#356B52', fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 4 },
  highlightToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderTopWidth: 1, borderColor: '#E1E8DE' },
  highlightToggleText: { color: '#173F35', fontSize: 14, fontWeight: '600' },
  highlightPanel: { maxHeight: 420, paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  highlightScroll: { maxHeight: 180 },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  highlightQuote: { flex: 1, color: '#18312B', fontSize: 14, lineHeight: 20 },
  rowButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 6 },
  rowButtonText: { color: '#173F35', fontSize: 14, fontWeight: '600' },
  deleteText: { color: '#8D3535', fontSize: 14, fontWeight: '600' },
  errorText: { flex: 1, color: '#8D3535', fontSize: 13, lineHeight: 19 },
  exportCard: { padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E8DE', gap: 6 },
  exportText: { flex: 1, color: '#18312B', fontSize: 13, lineHeight: 19 },
  checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: { color: '#173F35', fontSize: 20 },
  exportActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportButton: { flex: 1, marginTop: 0, paddingHorizontal: 12 },
  error: { color: '#8D3535', fontSize: 14, lineHeight: 20, padding: 12, backgroundColor: '#FCEEEE', borderRadius: 12 },
  loading: { position: 'absolute', top: 86, alignSelf: 'center' },
});
