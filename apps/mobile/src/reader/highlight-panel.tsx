// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ExportFlowState } from '../../../../src/storage/highlight-export-flow';
import type { SavedHighlight } from '../../../../src/storage/saved-highlights';
import { styles } from './reader-theme';
import { isExportBusy, plural } from './use-export-flow';
import type { ListState } from './use-highlights';

/** The open highlights list: load state, the export entry point (or `exportCard` in preview) and one row per highlight. */
export function HighlightPanel({
  listState, highlights, exportState, exportResult, canExport, jump, deletingId, closing, readyGeneration,
  onRetry, onStartExport, onGoTo, onDelete, exportCard,
}: {
  listState: ListState;
  highlights: SavedHighlight[];
  exportState: ExportFlowState;
  exportResult: { message: string; failed: boolean } | null;
  canExport: boolean;
  jump: { id: string } | null;
  deletingId: string | null;
  closing: boolean;
  readyGeneration: number;
  onRetry: () => void;
  onStartExport: () => void;
  onGoTo: (highlight: SavedHighlight) => void;
  onDelete: (highlight: SavedHighlight) => void;
  exportCard: ReactNode;
}) {
  const exportBusy = isExportBusy(exportState);
  return (
    <View style={styles.highlightPanel}>
      {listState.status === 'error' ? (
        <View style={styles.highlightRow}>
          <Text accessibilityRole="alert" style={styles.errorText}>Saved highlights could not be read from this device.</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.rowButton}>
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
      {exportState.status === 'preview' ? exportCard : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Export this book’s ${plural(highlights.length)} to a folder you choose`}
          accessibilityState={{ disabled: !canExport, busy: exportBusy }}
          disabled={!canExport}
          testID="export-start"
          onPress={onStartExport}
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
              onPress={() => onGoTo(highlight)}
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
              onPress={() => onDelete(highlight)}
              style={styles.rowButton}
            >
              <Text style={styles.deleteText}>{deletingId === highlight.id ? 'Deleting…' : 'Delete'}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
