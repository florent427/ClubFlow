import { useApolloClient, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  ScreenContainer,
  ScreenHero,
  VIEWER_PROFILES,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { storage } from '../../lib/storage';

type ViewerProfile = {
  memberId: string | null;
  contactId: string | null;
  clubId: string;
  firstName: string;
  lastName: string;
  isPrimaryProfile: boolean;
};

type Data = { viewerProfiles: ViewerProfile[] };

export function ProfileScreen() {
  const navigation = useNavigation();
  const client = useApolloClient();

  const { data, loading } = useQuery<Data>(VIEWER_PROFILES, {
    errorPolicy: 'all',
  });

  const [clubId, setClubId] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void storage.getClubId().then((id) => {
      if (!cancelled) setClubId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Récupère le profil correspondant au club courant si possible.
  const profile =
    data?.viewerProfiles?.find((p) => p.clubId === clubId) ??
    data?.viewerProfiles?.[0] ??
    null;

  const handleLogout = async () => {
    try {
      await storage.clearAuth();
      await client.resetStore().catch(() => {});
      setConfirmLogout(false);
      (navigation as unknown as {
        reset: (config: { index: number; routes: { name: string }[] }) => void;
      }).reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Déconnexion impossible.');
    }
  };

  const truncatedClubId = clubId
    ? `${clubId.slice(0, 8)}…${clubId.slice(-4)}`
    : '—';

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="PROFIL"
        title="Mon compte"
        subtitle={
          profile
            ? `${profile.firstName} ${profile.lastName}`.trim() || 'Profil'
            : undefined
        }
        showBack
        compact
      />

      <View style={styles.body}>
        <Card title="Identité">
          {loading && !profile ? (
            <Text style={styles.muted}>Chargement…</Text>
          ) : profile ? (
            <>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Prénom</Text>
                <Text style={styles.kvValue}>{profile.firstName || '—'}</Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Nom</Text>
                <Text style={styles.kvValue}>{profile.lastName || '—'}</Text>
              </View>
              {profile.isPrimaryProfile ? (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>Type</Text>
                  <Text style={styles.kvValue}>Profil principal</Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.muted}>Aucun profil disponible.</Text>
          )}
        </Card>

        <Card title="Session">
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Club courant</Text>
            <Text style={styles.kvValue}>{truncatedClubId}</Text>
          </View>
        </Card>

        <Button
          label="Se déconnecter"
          variant="danger"
          icon="log-out-outline"
          onPress={() => setConfirmLogout(true)}
          fullWidth
        />
      </View>

      <ConfirmSheet
        visible={confirmLogout}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => void handleLogout()}
        title="Se déconnecter ?"
        message="Vous devrez vous reconnecter pour accéder de nouveau à l'admin du club."
        confirmLabel="Déconnexion"
        destructive
      />
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
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  kvLabel: { ...typography.smallStrong, color: palette.muted },
  kvValue: { ...typography.body, color: palette.ink },
  muted: { ...typography.small, color: palette.muted },
});
