import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_VITRINE_SETTINGS,
  UPDATE_CLUB_VITRINE_SETTINGS,
} from '../../lib/documents/vitrine';

type SettingsData = {
  clubVitrineSettings: {
    customDomain: string | null;
    vitrinePublished: boolean;
  } | null;
};

const ADMIN_WEB_URL =
  process.env.EXPO_PUBLIC_ADMIN_APP_URL ?? 'https://clubflow.local';

export function VitrineSettingsScreen() {
  const { data, loading } = useQuery<SettingsData>(CLUB_VITRINE_SETTINGS, {
    errorPolicy: 'all',
  });

  const [customDomain, setCustomDomain] = useState('');
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (data?.clubVitrineSettings) {
      setCustomDomain(data.clubVitrineSettings.customDomain ?? '');
      setPublished(data.clubVitrineSettings.vitrinePublished);
    }
  }, [data]);

  const [updateSettings, updateState] = useMutation(
    UPDATE_CLUB_VITRINE_SETTINGS,
    { refetchQueries: [{ query: CLUB_VITRINE_SETTINGS }] },
  );

  const handleSave = async () => {
    try {
      await updateSettings({
        variables: {
          input: {
            customDomain:
              customDomain.trim().length > 0 ? customDomain.trim() : null,
            vitrinePublished: published,
          },
        },
      });
      Alert.alert('Réglages enregistrés', 'Les paramètres vitrine sont à jour.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible d\'enregistrer.');
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="PARAMÈTRES"
        title="Réglages vitrine"
        subtitle="Domaine et publication"
        showBack
        compact
      />

      <View style={styles.body}>
        {loading && !data ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <>
            <Card title="Publication">
              <View style={styles.fields}>
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>Statut</Text>
                  <Pill
                    label={published ? 'En ligne' : 'Hors ligne'}
                    tone={published ? 'success' : 'neutral'}
                    icon={published ? 'globe' : 'globe-outline'}
                    onPress={() => setPublished((v) => !v)}
                  />
                </View>
                <Text style={styles.hint}>
                  Bascule l'état de publication du site vitrine. Hors ligne,
                  une page de maintenance est affichée aux visiteurs.
                </Text>
              </View>
            </Card>

            <Card title="Domaine personnalisé">
              <View style={styles.fields}>
                <TextField
                  label="Domaine"
                  value={customDomain}
                  onChangeText={setCustomDomain}
                  placeholder="club.exemple.fr"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={styles.hint}>
                  Laisser vide pour utiliser le sous-domaine ClubFlow par
                  défaut. La configuration DNS doit être effectuée séparément.
                </Text>
              </View>
            </Card>

            <Button
              label="Enregistrer"
              variant="primary"
              icon="checkmark-circle-outline"
              onPress={handleSave}
              loading={updateState.loading}
              fullWidth
            />

            <Button
              label="Ouvrir l'éditeur web"
              variant="ghost"
              icon="open-outline"
              onPress={() => {
                void Linking.openURL(`${ADMIN_WEB_URL}/vitrine`);
              }}
              fullWidth
            />
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
  },
  fields: { gap: spacing.md },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  kvLabel: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  hint: {
    ...typography.small,
    color: palette.muted,
  },
});
