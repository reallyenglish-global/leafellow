// SPDX-License-Identifier: Apache-2.0
import { Component, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { DANGER, INK, PAPER } from './reader/reader-theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

// Catches render errors from the app's screens, inside the database provider, so they are not
// reported with the database wording that DatabaseErrorBoundary reserves for open/init failures.
export class RenderErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text accessibilityRole="header" style={styles.title}>Something went wrong in Leafellow</Text>
        <Text style={styles.body}>
          This screen hit an error it could not recover from. Restart the app to continue. Your saved reading positions and highlights are not affected.
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
