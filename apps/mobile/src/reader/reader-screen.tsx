// SPDX-License-Identifier: Apache-2.0
import { Reader, ReaderProvider, useReader } from '@epubjs-react-native/core';
import { useFileSystem } from '@epubjs-react-native/expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { captureSelection, isSelectionCurrent, type PendingSelection } from '../../../../src/reader/highlight-selection';
import { createHighlightSession } from '../../../../src/storage/highlight-session';
import { createSerialWriter } from '../../../../src/storage/serial-writes';
import { ExportCard } from './export-card';
import { HighlightPanel } from './highlight-panel';
import { latestNotice, useNoticeOrder, useOrderedNotice } from './notice-order';
import { MOSS, READER_THEME, styles } from './reader-theme';
import { SelectionCard } from './selection-card';
import { useExportFlow } from './use-export-flow';
import { useHighlights } from './use-highlights';
import { usePassageJump } from './use-passage-jump';
import { highlightCfi, useReaderMarks } from './use-reader-marks';
import { useReadingPosition } from './use-reading-position';

// uri is what the renderer loads: the picked file itself, or an app-owned temporary cache copy of
// its validated bytes (Android). release removes that copy, if any.
export type OpenBook = { name: string; uri: string; id: string; resumeCfi: string | null; release: () => void };
// The renderer reports no error when its WebView never loads the book, so stop waiting honestly.
const READER_OPEN_TIMEOUT_MS = 30_000;

function ReaderSurface({ book, onClose }: { book: OpenBook; onClose: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [readerSize, setReaderSize] = useState({ width: 0, height: 0 });
  const handleReaderLayout = useCallback(({ nativeEvent: { layout: { width, height } } }: LayoutChangeEvent) =>
    setReaderSize(current => current.width === width && current.height === height ? current : { width, height }), []);
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [selectionNotice, setSelectionNotice] = useState('');
  const [error, setError] = useState('');
  // One notice line shows the newest of: a tapped mark, a go-to result, a save or delete.
  const noticeOrder = useNoticeOrder();
  const [pressNotice, setPressNotice] = useOrderedNotice(noticeOrder);
  const [showHighlights, setShowHighlights] = useState(false);
  const [closing, setClosing] = useState(false);
  // Bumped on every engine onReady, including WebView reloads, which drop all drawn marks.
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [openTimedOut, setOpenTimedOut] = useState(false);
  const reader = useReader();
  const readerRef = useRef(reader);
  useEffect(() => { readerRef.current = reader; });
  const [writer] = useState(createSerialWriter);
  const [session] = useState(() => createHighlightSession(db, book.id, writer));
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const { highlights, listState, saving, deletingId, ...saved } = useHighlights(session, active, noticeOrder);
  const passage = usePassageJump(reader, active, noticeOrder);
  const { markError, reset: resetMarks } = useReaderMarks(readerRef, highlights, readyGeneration);
  const exporter = useExportFlow({ session, book, active, writer });
  const position = useReadingPosition(db, writer, book, active);
  const currentHref = useRef<string | null>(null);

  // Arms only while the book has never been ready; the first onReady also hides a stall already shown.
  useEffect(() => {
    if (readyGeneration > 0) return;
    const timer = setTimeout(() => setOpenTimedOut(true), READER_OPEN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [readyGeneration]);
  const openStalled = openTimedOut && readyGeneration === 0;

  // Every action that used to clear the shared message line clears each source (go-to clears its own
  // only when it acts, so the screen clears the rest after it).
  function clearMessages() { setPressNotice(''); saved.clearMessages(); passage.clearMessages(); }
  const notice = latestNotice(pressNotice, passage.noticeEntry, saved.noticeEntry);

  function handleReady(location: { start?: { href?: string } } | undefined) {
    currentHref.current = location?.start?.href ?? null;
    resetMarks();
    passage.onReady();
    setReadyGeneration(generation => generation + 1);
  }

  function handleSelected(text: string, cfiRange: string) {
    clearMessages();
    // Only this book's own location report; never provider state that may predate it.
    const result = captureSelection(text, cfiRange, { documentId: book.id, href: currentHref.current, selectedAt: Date.now() });
    setSelection(result.ok ? result.selection : null);
    setSelectionNotice(result.ok ? '' : result.reason);
  }

  function handleLocationChange(location: { start: { href: string; cfi: string } }, percent: number) {
    const href = location.start.href;
    if (href !== currentHref.current) {
      currentHref.current = href;
      if (selection && !isSelectionCurrent(selection, { documentId: book.id, href })) {
        setSelection(null);
        setSelectionNotice('The reader moved to another chapter, so the earlier selection was cleared.');
      }
    }
    position.onLocationChange(location, percent);
  }

  function saveSelection() {
    const pending = selection;
    if (!pending || saving || writer.isClosed() || exporter.guard.isBusy() || listState.status !== 'ready') return;
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

  async function closeReader() {
    if (closing || exporter.guard.isBusy()) return;
    setClosing(true);
    setSelection(null);
    passage.cancel();
    await position.close();
    active.current = false;
    onClose();
  }

  const canSave = !saving && !closing && !exporter.busy && listState.status === 'ready';
  const canExport = !closing && !exporter.busy && listState.status === 'ready' && highlights.length > 0;
  const alertText = (message: string) => message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null;

  return (
    <View testID="reader-screen" style={[styles.readerScreen, { paddingBottom: insets.bottom }]}>
      <View testID="reader-header" style={[styles.readerHeader, { paddingTop: insets.top, paddingBottom: 12 }]}>
        <Pressable accessibilityRole="button" testID="reader-back" style={styles.backButton}
          accessibilityLabel={closing ? 'Finishing saves before returning to library'
            : exporter.busy ? 'Back to library, unavailable until the export finishes or is cancelled' : 'Back to library'}
          accessibilityState={{ disabled: closing || exporter.busy }} disabled={closing || exporter.busy}
          onPress={() => { void closeReader(); }}>
          <Text style={styles.backText}>‹  Library</Text>
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.bookTitle}>{book.name}</Text>
        <Text style={styles.progress}>{position.progress === null ? 'Opening…' : `${Math.round(position.progress)}%`}</Text>
      </View>
      {/* Measure the space left by the actual header, insets and panels. The engine's
          flex root needs a bounded parent; window-height estimates can clip its controls. */}
      <View testID="reader-frame" style={styles.readerFrame} onLayout={handleReaderLayout}>
        {readerSize.width > 0 && readerSize.height > 0 && <Reader
          key={book.id} src={book.uri} fileSystem={useFileSystem} width={readerSize.width} height={readerSize.height}
          initialLocation={book.resumeCfi ?? undefined} flow="scrolled-doc" spread="none" enableSelection
          allowScriptedContent={false} allowPopups={false} defaultTheme={READER_THEME}
          onReady={(_total, location) => handleReady(location)} onWebViewMessage={passage.onWebViewMessage} onSelected={handleSelected}
          onPressAnnotation={({ cfiRange }) => {
            const pressed = highlights.find(item => highlightCfi(item) === cfiRange);
            if (pressed) { setShowHighlights(true); setPressNotice(`Saved highlight: “${pressed.annotation.quote.exact.trim().slice(0, 80)}”`); }
          }}
          onLocationChange={(_total, location, percent) => handleLocationChange(location, percent)}
          onDisplayError={(reason) => setError(`This EPUB could not be displayed: ${reason}`)}
        />}
      </View>
      {book.resumeCfi ? <Text style={styles.resumeNote}>Resumed from this book’s last saved reading position.</Text> : null}
      {selection ? <SelectionCard selection={selection} canSave={canSave} saving={saving} listReady={listState.status === 'ready'} onSave={saveSelection} /> : null}
      {selectionNotice ? <Text accessibilityRole="alert" style={styles.notice}>{selectionNotice}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      {alertText(saved.error)}{alertText(passage.error)}{alertText(markError)}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHighlights }} testID="highlights-toggle"
        onPress={() => setShowHighlights(open => !open)} style={styles.highlightToggle}>
        <Text style={styles.highlightToggleText}>
          {listState.status === 'loading' ? 'Loading highlights…' : listState.status === 'error' ? 'Highlights unavailable'
            : `${showHighlights ? 'Hide' : 'Show'} highlights (${highlights.length})`}
        </Text>
      </Pressable>
      {showHighlights ? (
        <HighlightPanel
          listState={listState} highlights={highlights} exportState={exporter.state} exportResult={exporter.result}
          canExport={canExport} jump={passage.jump} deletingId={deletingId} closing={closing} readyGeneration={readyGeneration}
          onRetry={() => { void saved.load(); }} onStartExport={() => { if (!closing && exporter.start()) clearMessages(); }}
          onGoTo={highlight => { if (passage.goTo(highlight)) { setPressNotice(''); saved.clearMessages(); } }}
          onDelete={highlight => { if (!deletingId && !writer.isClosed() && !exporter.guard.isBusy()) { clearMessages(); saved.remove(highlight); } }}
          exportCard={exporter.state.status === 'preview' ? (
            <ExportCard count={exporter.state.count} acknowledged={exporter.state.acknowledged}
              onToggle={exporter.toggleAcknowledged} onConfirm={exporter.confirm} onCancel={exporter.cancel} />
          ) : null}
        />
      ) : null}
      {alertText(error)}
      {openStalled && !error ? <Text accessibilityRole="alert" testID="reader-open-error" style={styles.error}>
        This book did not finish opening. Go back to the library and choose it again.</Text> : null}
      {alertText(position.positionError)}
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
