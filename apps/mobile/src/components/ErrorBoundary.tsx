import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../lib/theme';

type Props = { children: ReactNode };

type State = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

/**
 * Error boundary global — capture les erreurs de rendu enfant et les
 * **affiche** au lieu de laisser React unmount silencieusement.
 *
 * Utile pour diagnostiquer les boucles de re-mount silencieuses où l'app
 * crashe sans red screen visible (ex. erreurs dans des Providers, ou
 * crashes asynchrones invisibles dans Expo Go).
 *
 * En dev : affiche le message + stack trace pour faciliter le debug.
 * En prod : afficherait juste un message générique (à brancher plus tard).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Crash capturé', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>Erreur de rendu</Text>
            <Text style={styles.message}>
              {this.state.error.message || 'Erreur inconnue'}
            </Text>
            {this.state.error.stack ? (
              <View style={styles.stackBox}>
                <Text style={styles.stackTitle}>Stack trace</Text>
                <Text style={styles.stackText}>{this.state.error.stack}</Text>
              </View>
            ) : null}
            {this.state.errorInfo?.componentStack ? (
              <View style={styles.stackBox}>
                <Text style={styles.stackTitle}>Component stack</Text>
                <Text style={styles.stackText}>
                  {this.state.errorInfo.componentStack}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#fee2e2',
    paddingTop: 60,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.h2,
    color: '#991b1b',
  },
  message: {
    ...typography.body,
    color: '#7f1d1d',
  },
  stackBox: {
    backgroundColor: '#ffffff',
    padding: spacing.md,
    borderRadius: 8,
    gap: spacing.xs,
  },
  stackTitle: {
    ...typography.smallStrong,
    color: palette.body,
  },
  stackText: {
    ...typography.caption,
    fontFamily: 'monospace',
    color: palette.ink,
  },
});
