// SPDX-License-Identifier: Apache-2.0
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function WebPreviewScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.wordmark}>leafellow</Text>
        <Text accessibilityRole="header" style={styles.title}>Mobile reader prototype</Text>
        <Text style={styles.body}>
          The current feasibility slice targets Android and iOS EPUB rendering. The web reader and PDF support remain on the roadmap.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F3E8' },
  content: { flex: 1, justifyContent: 'center', padding: 28, gap: 20, maxWidth: 560, width: '100%', alignSelf: 'center' },
  wordmark: { color: '#173F35', fontSize: 23, fontWeight: '700' },
  title: { color: '#18312B', fontSize: 32, lineHeight: 40, fontWeight: '600' },
  body: { color: '#5D6D60', fontSize: 16, lineHeight: 25 },
});
