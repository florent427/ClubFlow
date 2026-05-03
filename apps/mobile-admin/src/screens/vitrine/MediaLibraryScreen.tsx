import {
  Button,
  Card,
  EmptyState,
  ScreenContainer,
  ScreenHero,
  spacing,
} from '@clubflow/mobile-shared';
import { Linking } from 'react-native';

const ADMIN_WEB_URL =
  process.env.EXPO_PUBLIC_ADMIN_APP_URL ?? 'https://clubflow.local';

/**
 * La médiathèque complète (upload, organisation par dossiers, recherche)
 * n'est disponible que sur l'admin web pour la v1. Sur mobile, on
 * propose un raccourci d'ouverture.
 */
export function MediaLibraryScreen() {
  return (
    <ScreenContainer scroll padding={0}>
      <ScreenHero
        eyebrow="MÉDIATHÈQUE"
        title="Médias"
        subtitle="Toutes les images du club"
        showBack
        compact
      />
      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <EmptyState
          icon="folder-open-outline"
          title="Médiathèque accessible depuis l'admin web"
          description="L'organisation et la recherche dans tous les médias est disponible sur le tableau de bord web. Sur mobile, vous pouvez ajouter des photos directement depuis la galerie vitrine ou un article."
          action={
            <Button
              label="Ouvrir l'admin web"
              icon="open-outline"
              onPress={() => {
                void Linking.openURL(`${ADMIN_WEB_URL}/medias`);
              }}
            />
          }
        />
      </Card>
    </ScreenContainer>
  );
}
