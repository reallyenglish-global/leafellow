// SPDX-License-Identifier: Apache-2.0
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { PendingSelection } from '../../../../src/reader/highlight-selection';
import { styles } from './reader-theme';

export function SelectionCard({ selection, canSave, saving, listReady, onSave }: {
  selection: PendingSelection;
  canSave: boolean;
  saving: boolean;
  listReady: boolean;
  onSave: () => void;
}) {
  return (
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
        onPress={onSave}
        style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, !canSave && styles.disabled]}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving…' : listReady ? 'Save highlight' : 'Waiting for saved highlights…'}
        </Text>
      </Pressable>
      <Text style={styles.selectionHint}>Highlights are stored locally on this device; no automatic upload. AI explanations are not connected in this prototype.</Text>
    </View>
  );
}
