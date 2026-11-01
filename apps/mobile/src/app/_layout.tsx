// SPDX-License-Identifier: Apache-2.0
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router';

import { DatabaseErrorBoundary } from '../database-error-boundary';
import { initializeLastReadingPosition } from '../../../../src/storage/reading-position';
import { initializeSavedHighlights } from '../../../../src/storage/saved-highlights';

async function initializeDatabase(database: SQLiteDatabase): Promise<void> {
  await initializeLastReadingPosition(database);
  await initializeSavedHighlights(database);
}

export default function RootLayout() {
  return (
    <DatabaseErrorBoundary>
      <SQLiteProvider databaseName="leafellow.db" onInit={initializeDatabase}>
        {/* ReaderProvider is mounted per open book in index.tsx so engine state never outlives a book. */}
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      </SQLiteProvider>
    </DatabaseErrorBoundary>
  );
}
