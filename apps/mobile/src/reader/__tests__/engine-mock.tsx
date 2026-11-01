// SPDX-License-Identifier: Apache-2.0
// Replaces the EPUB engine and native modules so ReaderScreen renders under jest-expo with real
// SQLite behind it. Import this file before ReaderScreen.
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ReaderProps } from '@epubjs-react-native/core';

import { initializeSavedHighlights, type HighlightDatabase } from '../../../../../src/storage/saved-highlights';
import { initializeLastReadingPosition, type PositionDatabase } from '../../../../../src/storage/reading-position';
import type { OpenBook } from '../reader-screen';

type TestDatabase = HighlightDatabase & PositionDatabase;

let mockLatestProps: ReaderProps | null = null;
let mockCurrentDb: TestDatabase | null = null;

export const mockReader = {
  isLoading: false,
  injectJavascript: jest.fn(),
  addAnnotation: jest.fn(),
  removeAnnotationByCfi: jest.fn(),
};

jest.mock('@epubjs-react-native/core', () => ({
  Reader: (props: ReaderProps) => {
    mockLatestProps = props;
    return null;
  },
  ReaderProvider: ({ children }: { children: unknown }) => children,
  useReader: () => mockReader,
}));
jest.mock('@epubjs-react-native/expo-file-system', () => ({ useFileSystem: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 128, bottom: 34, left: 0, right: 0 }),
  SafeAreaView: jest.requireActual('react-native').View,
}));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockCurrentDb }));
jest.mock('../../highlight-export-destination', () => ({ systemFolderDestination: { pickFolder: jest.fn() } }));

/** The props the mocked engine last rendered with, or null if it has not rendered. */
export function latestReaderProps(): ReaderProps | null {
  return mockLatestProps;
}

export function makeBook(): OpenBook {
  return {
    name: 'fixture.epub',
    uri: 'file:///tmp/fixture.epub',
    id: 'sha256:' + 'a'.repeat(64),
    resumeCfi: null,
    release: jest.fn(),
  };
}

const openDirectories: string[] = [];
const openDatabases: { close(): void }[] = [];

/** Opens a fresh SQLite file in a temp directory with both schemas and makes it the app database. */
export async function openTestDatabase(): Promise<TestDatabase> {
  // Jest always treats .mjs as native ESM and cannot require it, so load the shared adapter through
  // Node's own loader (require of ESM). It only imports node:sqlite, so nothing needs transforming.
  const { NodeSqliteDatabase } = createRequire(__filename)('../../../../../tests/sqlite-adapter.mjs') as {
    NodeSqliteDatabase: new (filename: string) => TestDatabase & { close(): void };
  };
  const directory = mkdtempSync(join(tmpdir(), 'leafellow-reader-'));
  openDirectories.push(directory);
  const db = new NodeSqliteDatabase(join(directory, 'test.db'));
  openDatabases.push(db);
  await initializeLastReadingPosition(db);
  await initializeSavedHighlights(db);
  mockCurrentDb = db;
  return db;
}

/** Call from afterEach: closes databases, removes temp directories and clears engine state. */
export function resetEngineMock(): void {
  mockLatestProps = null;
  mockCurrentDb = null;
  for (const db of openDatabases.splice(0)) db.close();
  for (const directory of openDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  jest.clearAllMocks();
}
