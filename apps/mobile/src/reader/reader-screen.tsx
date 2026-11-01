// SPDX-License-Identifier: Apache-2.0
import { Reader, ReaderProvider, useReader } from '@epubjs-react-native/core';
import { useFileSystem } from '@epubjs-react-native/expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { captureSelection, isSelectionCurrent, type PendingSelection } from '../../../../src/reader/highlight-selection';
import {
  createExportGuard,
  exportFileName,
  runHighlightExport,
  serializeHighlightExport,
  type ExportOutcome,
} from '../../../../src/storage/highlight-export';
import { createExportFlow, type ExportFlowResult, type ExportFlowState } from '../../../../src/storage/highlight-export-flow';
import { createHighlightSession } from '../../../../src/storage/highlight-session';
import { HighlightExportUnreadableError, type SavedHighlight } from '../../../../src/storage/saved-highlights';
import { createSerialWriter } from '../../../../src/storage/serial-writes';
import { systemFolderDestination } from '../highlight-export-destination';
import { MOSS, READER_THEME, styles } from './reader-theme';
import { useHighlights } from './use-highlights';
import { usePassageJump } from './use-passage-jump';
import { highlightCfi, useReaderMarks } from './use-reader-marks';
import { useReadingPosition } from './use-reading-position';

// uri is what the renderer loads: the picked file itself, or an app-owned temporary cache copy of
// its validated bytes (Android). release removes that copy, if any.
export type OpenBook = { name: string; uri: string; id: string; resumeCfi: string | null; release: () => void };
// The renderer reports no error when its WebView never loads the book, so stop waiting honestly.
const READER_OPEN_TIMEOUT_MS = 30_000;
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

function ReaderSurface({ book, onClose }: { book: OpenBook; onClose: () => void }) {
  const db = useSQLiteContext();
  const [readerSize, setReaderSize] = useState({ width: 0, height: 0 });
  const handleReaderLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    const { width, height } = layout;
    setReaderSize(current => current.width === width && current.height === height ? current : { width, height });
  }, []);
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [selectionNotice, setSelectionNotice] = useState('');
  const [error, setError] = useState('');
  // The notice for a tapped mark; save, delete and go-to messages come from their hooks.
  const [pressNotice, setPressNotice] = useState('');
  const [showHighlights, setShowHighlights] = useState(false);
  const [closing, setClosing] = useState(false);
  // Bumped on every engine onReady, including WebView reloads, which drop all drawn marks.
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [openStalled, setOpenStalled] = useState(false);
  const reader = useReader();
  const readerRef = useRef(reader);
  useEffect(() => { readerRef.current = reader; });
  const [writer] = useState(createSerialWriter);
  const [session] = useState(() => createHighlightSession(db, book.id, writer));
  // Held from snapshot through preview, folder picker and write; saves, deletes and close wait.
  const [exportGuard] = useState(createExportGuard);
  const [exportState, setExportState] = useState<ExportFlowState>({ status: 'idle' });
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const { highlights, listState, saving, deletingId, ...saved } = useHighlights(session, active);
  const passage = usePassageJump(reader, active);
  const { markError, reset: resetMarks } = useReaderMarks(readerRef, highlights, readyGeneration);
  const { progress, positionError, onLocationChange: savePosition, close: closePosition } = useReadingPosition(db, writer, book, active);
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

  function clearMessages() {
    setPressNotice('');
    saved.clearMessages();
    passage.clearMessages();
  }

  useEffect(() => {
    if (readyGeneration > 0) {
      setOpenStalled(false);
      return;
    }
    const timer = setTimeout(() => setOpenStalled(true), READER_OPEN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [readyGeneration]);

  function handleReady(location: { start?: { href?: string } } | undefined) {
    currentHref.current = location?.start?.href ?? null;
    resetMarks();
    passage.onReady();
    setReadyGeneration(generation => generation + 1);
  }

  function handleSelected(text: string, cfiRange: string) {
    clearMessages();
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
    clearMessages();
    void saved.save(pending).then(stored => {
      if (stored && active.current) setSelection(current => (current === pending ? null : current));
    });
  }

  function deleteHighlight(highlight: SavedHighlight) {
    if (deletingId || writer.isClosed() || exportGuard.isBusy()) return;
    clearMessages();
    saved.remove(highlight);
  }

  function startExport() {
    if (closing || writer.isClosed()) return;
    if (!exportFlow.start()) return;
    clearMessages();
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

  // One notice line, as before the split: a tapped mark, then a go-to result, then a save or delete.
  const notice = pressNotice || passage.notice || saved.notice;

  async function closeReader() {
    if (closing || exportGuard.isBusy()) return;
    setClosing(true);
    setSelection(null);
    passage.cancel();
    await closePosition();
    active.current = false;
    onClose();
  }

  return (
    <View style={[styles.readerScreen, { paddingBottom: insets.bottom }]}>
      <View testID="reader-header" style={[styles.readerHeader, { paddingTop: insets.top, paddingBottom: 12 }]}>
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
      {/* Measure the space left by the actual header, insets and panels. The engine's
          flex root needs a bounded parent; window-height estimates can clip its controls. */}
      <View testID="reader-frame" style={styles.readerFrame} onLayout={handleReaderLayout}>
        {readerSize.width > 0 && readerSize.height > 0 && <Reader
          key={book.id}
          src={book.uri}
          fileSystem={useFileSystem}
          width={readerSize.width}
          height={readerSize.height}
          initialLocation={book.resumeCfi ?? undefined}
          flow="scrolled-doc"
          spread="none"
          enableSelection
          allowScriptedContent={false}
          allowPopups={false}
          defaultTheme={READER_THEME}
          onReady={(_total, location) => handleReady(location)}
          onWebViewMessage={passage.onWebViewMessage}
          onSelected={handleSelected}
          onPressAnnotation={(annotation) => {
            const pressed = highlights.find(item => highlightCfi(item) === annotation.cfiRange);
            if (pressed) {
              setShowHighlights(true);
              setPressNotice(`Saved highlight: “${pressed.annotation.quote.exact.trim().slice(0, 80)}”`);
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
            savePosition(location, nextProgressPercent);
          }}
          onDisplayError={(reason) => setError(`This EPUB could not be displayed: ${reason}`)}
        />}
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
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      {saved.error ? <Text accessibilityRole="alert" style={styles.error}>{saved.error}</Text> : null}
      {passage.error ? <Text accessibilityRole="alert" style={styles.error}>{passage.error}</Text> : null}
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
              <Pressable accessibilityRole="button" onPress={() => { void saved.load(); }} style={styles.rowButton}>
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
                  accessibilityState={{ disabled: passage.jump !== null || closing || readyGeneration === 0, busy: passage.jump?.id === highlight.id }}
                  disabled={passage.jump !== null || closing || readyGeneration === 0}
                  testID="highlight-go-to"
                  onPress={() => { if (passage.goTo(highlight)) { setPressNotice(''); saved.clearMessages(); } }}
                  style={styles.rowButton}
                >
                  <Text style={styles.rowButtonText}>{passage.jump?.id === highlight.id ? 'Checking…' : 'Go to'}</Text>
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
      {reader.isLoading ? <ActivityIndicator accessibilityLabel="Loading book" style={styles.loading} color={MOSS} /> : null}
    </View>
  );
}

// One ReaderProvider per open book, so no engine state (section, annotations, location) from a
// previously opened book can reach this one.
export function ReaderScreen({ book, onClose }: { book: OpenBook; onClose: () => void }) {
  return (
    <ReaderProvider>
      <ReaderSurface book={book} onClose={onClose} />
    </ReaderProvider>
  );
}
