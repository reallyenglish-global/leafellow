// SPDX-License-Identifier: Apache-2.0
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { inspectEpub, validateEpubFile } from '../../../../src/reader/import-epub';
import { clearLastReadingPosition, loadLastReadingPosition } from '../../../../src/storage/reading-position';
import { ReaderScreen, type OpenBook } from '../reader/reader-screen';
import { FOREST, INK, MOSS, MUTED, PAPER } from '../reader/reader-theme';
import { createAppRendererSources } from '../reader-source-fs';

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
      validateEpubFile(file.name, file.size, file.type);
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
            {busy ? <ActivityIndicator color={PAPER} /> : <Text style={styles.openButtonText}>Choose an EPUB</Text>}
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
  safeArea: { flex: 1, backgroundColor: PAPER },
  home: { flex: 1, paddingHorizontal: 26, paddingTop: 18, paddingBottom: 20, justifyContent: 'space-between', backgroundColor: PAPER },
  wordmark: { color: FOREST, fontSize: 23, fontWeight: '700', letterSpacing: -0.8 },
  hero: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 18, paddingVertical: 24 },
  eyebrow: { color: MUTED, fontSize: 11, letterSpacing: 1.7, fontWeight: '700' },
  title: { color: INK, fontSize: 38, lineHeight: 44, fontWeight: '600', letterSpacing: -1.1 },
  description: { color: MUTED, fontSize: 17, lineHeight: 26, maxWidth: 390 },
  openButton: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: FOREST, paddingHorizontal: 22, marginTop: 4 },
  openButtonText: { color: PAPER, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.65 },
  note: { color: MUTED, fontSize: 13, lineHeight: 19 },
  message: { color: MOSS, fontSize: 13, lineHeight: 19 },
  clearButton: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  clearButtonText: { color: MUTED, fontSize: 13, textDecorationLine: 'underline' },
  footer: { color: MUTED, fontSize: 13, textAlign: 'center' },
});
