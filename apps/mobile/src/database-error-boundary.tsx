// SPDX-License-Identifier: Apache-2.0
import { Component, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { DANGER, INK, PAPER } from './reader/reader-theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

// SQLiteProvider rethrows its open/init failure during render when no onError is passed;
// this boundary is what catches it and keeps the app from failing to a blank screen.
export class DatabaseErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text accessibilityRole="header" style={styles.title}>Leafellow could not open its local data</Text>
        <Text style={styles.body}>
          Reading positions and highlights on this device could not be opened. If an older Leafellow was installed over a newer one, the newer app wrote data this version does not understand. Nothing was deleted.
        </Text>
        <Text accessibilityRole="alert" selectable style={styles.detail}>{error.message}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 26, backgroundColor: PAPER },
  title: { color: INK, fontSize: 28, lineHeight: 34, fontWeight: '600', marginBottom: 14 },
  body: { color: INK, fontSize: 16, lineHeight: 24, marginBottom: 18 },
  detail: { color: DANGER, fontSize: 13, lineHeight: 19, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});
