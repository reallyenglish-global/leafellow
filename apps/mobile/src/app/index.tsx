// SPDX-License-Identifier: Apache-2.0
import { Reader, useReader } from '@epubjs-react-native/core';
import { useFileSystem } from '@epubjs-react-native/expo-file-system';
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { inspectEpub, validateEpubFile } from '../../../../src/reader/import-epub';
import { normalizeEpubReaderProgress } from '../../../../src/reader/reader-progress';
import { clearLastReadingPosition, loadLastReadingPosition, saveLastReadingPosition } from '../../../../src/storage/reading-position';

type OpenBook = { name: string; uri: string; id: string; resumeCfi: string | null };

function ReaderSurface({ book, onClose }: { book: OpenBook; onClose: () => void }) {
  const db = useSQLiteContext();
  const { width, height } = useWindowDimensions();
  const [selection, setSelection] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [positionError, setPositionError] = useState('');
  const reader = useReader();
  const writes = useRef<Promise<void>>(Promise.resolve());

  function saveLocation(cfi: string, progressFraction: number) {
    const position = { documentId: book.id, cfi, progress: progressFraction, updatedAt: Date.now() };
    writes.current = writes.current
      .catch(() => undefined)
      .then(() => saveLastReadingPosition(db, position))
      .then(() => setPositionError(''))
      .catch(() => setPositionError('The reading position could not be saved on this device.'));
  }

  async function closeReader() {
    await writes.current;
    onClose();
  }

  return (
    <View style={styles.readerScreen}>
      <View style={styles.readerHeader}>
        <Pressable accessibilityRole="button" onPress={() => { void closeReader(); }} style={styles.backButton}>
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
          height={Math.max(240, height - (selection ? 210 : 132))}
          initialLocation={book.resumeCfi ?? undefined}
          flow="scrolled-doc"
          spread="none"
          enableSelection
          allowScriptedContent={false}
          allowPopups={false}
          defaultTheme={{ body: { color: '#18312B', background: '#F7F3E8', 'font-family': 'Georgia, serif', 'line-height': '1.7' } }}
          onSelected={(text) => setSelection(text)}
          onLocationChange={(_total, location, nextProgressPercent) => {
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
            <Text selectable style={styles.selectionText}>{selection}</Text>
          </ScrollView>
          <Text style={styles.selectionHint}>AI explanations and saved highlights are not connected in this prototype.</Text>
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {positionError ? <Text accessibilityRole="alert" style={styles.error}>{positionError}</Text> : null}
      {reader.isLoading ? <ActivityIndicator accessibilityLabel="Loading book" style={styles.loading} color="#356B52" /> : null}
    </View>
  );
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const [book, setBook] = useState<OpenBook | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function openEpub() {
    setBusy(true);
    setMessage('');
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['application/epub+zip'] });
      if (picked.canceled) return;
      const file = picked.result;
      validateEpubFile(file.name, file.size);
      const inspected = await inspectEpub(new Uint8Array(await file.arrayBuffer()));
      const saved = await loadLastReadingPosition(db, inspected.id);
      setBook({ name: file.name, uri: file.uri, id: inspected.id, resumeCfi: saved?.cfi ?? null });
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

  if (book) return <ReaderSurface book={book} onClose={() => { setBook(null); setMessage(''); }} />;

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
            onPress={openEpub}
            style={({ pressed }) => [styles.openButton, pressed && styles.pressed, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator color="#F7F3E8" /> : <Text style={styles.openButtonText}>Choose an EPUB</Text>}
          </Pressable>
          {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
          <Text style={styles.note}>Re-select the exact same EPUB to resume. Leafellow keeps only one reading position and the file’s content hash; it does not copy the book.</Text>
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
  error: { color: '#8D3535', fontSize: 14, lineHeight: 20, padding: 12, backgroundColor: '#FCEEEE', borderRadius: 12 },
  loading: { position: 'absolute', top: 86, alignSelf: 'center' },
});
