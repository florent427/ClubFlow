import { useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { CLUB_AI_SETTINGS } from '../../lib/documents/settings';

type Data = {
  clubAiSettings: {
    apiKeyMasked: string | null;
    hasApiKey: boolean;
    textModel: string;
    imageModel: string;
    tokensInputUsed: number;
    tokensOutputUsed: number;
    imagesGenerated: number;
  } | null;
};

const ADMIN_WEB_URL =
  process.env.EXPO_PUBLIC_ADMIN_APP_URL ?? 'https://clubflow.local';

export function AiSettingsScreen() {
  const { data, loading } = useQuery<Data>(CLUB_AI_SETTINGS, {
    errorPolicy: 'all',
  });

  const settings = data?.clubAiSettings ?? null;

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="IA"
        title="Configuration IA"
        subtitle="Modèles, clé API, usage"
        showBack
        compact
      />
      <View style={styles.body}>
        {loading && !settings ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : !settings ? (
          <Card>
            <EmptyState
              icon="sparkles-outline"
              title="IA non configurée"
              description="Configurez votre fournisseur de modèles et votre clé API depuis l'admin web."
              action={
                <Button
                  label="Ouvrir l'admin web"
                  icon="open-outline"
                  onPress={() => {
                    void Linking.openURL(`${ADMIN_WEB_URL}/parametres/ia`);
                  }}
                />
              }
            />
          </Card>
        ) : (
          <>
            <Card title="Modèles">
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Modèle texte</Text>
                <Text style={styles.kvValue} numberOfLines={1}>
                  {settings.textModel}
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Modèle image</Text>
                <Text style={styles.kvValue} numberOfLines={1}>
                  {settings.imageModel}
                </Text>
              </View>
            </Card>

            <Card title="Clé API">
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Statut</Text>
                <Pill
                  label={settings.hasApiKey ? 'Configurée' : 'Manquante'}
                  tone={settings.hasApiKey ? 'success' : 'warning'}
                  icon={settings.hasApiKey ? 'key' : 'key-outline'}
                />
              </View>
              {settings.apiKeyMasked ? (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>Clé</Text>
                  <Text style={styles.kvValue}>{settings.apiKeyMasked}</Text>
                </View>
              ) : null}
            </Card>

            <Card title="Consommation">
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Tokens entrée</Text>
                <Text style={styles.kvValue}>
                  {settings.tokensInputUsed.toLocaleString('fr-FR')}
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Tokens sortie</Text>
                <Text style={styles.kvValue}>
                  {settings.tokensOutputUsed.toLocaleString('fr-FR')}
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Images générées</Text>
                <Text style={styles.kvValue}>
                  {settings.imagesGenerated.toLocaleString('fr-FR')}
                </Text>
              </View>
            </Card>

            <Button
              label="Configurer (admin web)"
              variant="ghost"
              icon="open-outline"
              onPress={() => {
                void Linking.openURL(`${ADMIN_WEB_URL}/parametres/ia`);
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
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  kvLabel: { ...typography.smallStrong, color: palette.muted },
  kvValue: {
    ...typography.body,
    color: palette.ink,
    flexShrink: 1,
    textAlign: 'right',
  },
});
