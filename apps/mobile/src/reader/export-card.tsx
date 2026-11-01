// SPDX-License-Identifier: Apache-2.0
import { Pressable, Text, View } from 'react-native';

import { styles } from './reader-theme';
import { plural } from './use-export-flow';

/** The export preview: what the file contains, the acknowledgement, and confirm or cancel. */
export function ExportCard({ count, acknowledged, onToggle, onConfirm, onCancel }: {
  count: number;
  acknowledged: boolean;
  onToggle: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.exportCard}>
      <Text accessibilityRole="header" style={styles.selectionLabel}>EXPORT THIS BOOK’S HIGHLIGHTS</Text>
      <Text style={styles.exportText}>
        {plural(count)} from this book only, as one JSON file. It contains the exact highlighted passages, any notes, their positions in this EPUB and the book’s content hash. It does not contain the book itself.
      </Text>
      <Text style={styles.exportText}>
        Leafellow writes the file only to the folder you choose next and does not upload it. If that folder belongs to a cloud or synced storage provider, that provider may sync it.
      </Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acknowledged }}
        accessibilityLabel="I understand the exported file leaves Leafellow’s private storage"
        testID="export-acknowledge"
        onPress={onToggle}
        style={styles.checkRow}
      >
        <Text style={styles.checkBox}>{acknowledged ? '☑' : '☐'}</Text>
        <Text style={styles.exportText}>I understand the file leaves Leafellow’s private storage.</Text>
      </Pressable>
      <View style={styles.exportActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose a folder and export ${plural(count)}`}
          accessibilityState={{ disabled: !acknowledged }}
          disabled={!acknowledged}
          testID="export-confirm"
          onPress={onConfirm}
          style={({ pressed }) => [styles.saveButton, styles.exportButton, pressed && styles.pressed, !acknowledged && styles.disabled]}
        >
          <Text style={styles.saveButtonText}>Choose folder and export</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel export" onPress={onCancel} style={styles.rowButton}>
          <Text style={styles.rowButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
