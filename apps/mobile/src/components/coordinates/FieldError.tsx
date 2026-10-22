import { StyleSheet, Text } from 'react-native';
import { palette, typography } from '../../lib/theme';

/** Message d'erreur sous un groupe de champs (même rendu que TextField). */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

const styles = StyleSheet.create({
  error: { ...typography.small, color: palette.danger },
});
