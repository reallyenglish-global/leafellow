// SPDX-License-Identifier: Apache-2.0
import { ReaderProvider } from '@epubjs-react-native/core';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router';

import { initializeLastReadingPosition } from '../../../../src/storage/reading-position';

async function initializeDatabase(database: SQLiteDatabase): Promise<void> {
  await initializeLastReadingPosition(database);
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="leafellow.db" onInit={initializeDatabase}>
      <ReaderProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      </ReaderProvider>
    </SQLiteProvider>
  );
}
