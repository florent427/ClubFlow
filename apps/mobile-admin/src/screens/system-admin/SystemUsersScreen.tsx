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
 * La gestion globale des utilisateurs (recherche transverse, fusion de
 * comptes, suspension) reste sur l'admin web — trop dense pour un
 * écran mobile. On propose ici un raccourci.
 */
export function SystemUsersScreen() {
  return (
    <ScreenContainer scroll padding={0}>
      <ScreenHero
        eyebrow="UTILISATEURS"
        title="Tous les utilisateurs"
        subtitle="Vue plate-forme"
        showBack
        compact
      />
      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <EmptyState
          icon="people-circle-outline"
          title="Gestion globale disponible sur l'admin web"
          description="La recherche transverse, la fusion de comptes et la suspension d'utilisateurs sont disponibles sur le tableau de bord web. Les administrateurs système peuvent y accéder depuis n'importe quel club."
          action={
            <Button
              label="Ouvrir l'admin web"
              icon="open-outline"
              onPress={() => {
                void Linking.openURL(`${ADMIN_WEB_URL}/admin/users`);
              }}
            />
          }
        />
      </Card>
    </ScreenContainer>
  );
}
