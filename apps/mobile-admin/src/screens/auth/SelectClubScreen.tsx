import { useApolloClient } from '@apollo/client/react';
import {
  Card,
  ScreenContainer,
  ScreenHero,
  palette,
  radius,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { VIEWER_ADMIN_SWITCH } from '../../lib/documents/auth';
import { storage } from '../../lib/storage';
import {
  profileDisplayName,
  type LoginProfile,
} from '../../lib/auth-types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SelectClub'>;
type R = RouteProp<RootStackParamList, 'SelectClub'>;

type AdminSwitchData = {
  viewerAdminSwitch: {
    canAccessClubBackOffice: boolean;
    adminWorkspaceClubId: string | null;
  };
};

/**
 * Lorsqu'un compte a accès à plusieurs clubs, on regroupe les profils
 * par clubId et on affiche une carte par club.
 */
type ClubGroup = {
  clubId: string;
  primaryProfile: LoginProfile;
  profileCount: number;
};

export function SelectClubScreen() {
  const navigation = useNavigation<Nav>();
  const client = useApolloClient();
  const { profiles } = useRoute<R>().params;
  const [submittingClubId, setSubmittingClubId] = useState<string | null>(null);

  const groups = useMemo<ClubGroup[]>(() => {
    const map = new Map<string, ClubGroup>();
    for (const p of profiles) {
      const existing = map.get(p.clubId);
      if (!existing) {
        map.set(p.clubId, {
          clubId: p.clubId,
          primaryProfile: p,
          profileCount: 1,
        });
      } else {
        existing.profileCount += 1;
        if (p.isPrimaryProfile) existing.primaryProfile = p;
      }
    }
    return Array.from(map.values());
  }, [profiles]);

  const onPick = async (g: ClubGroup) => {
    setSubmittingClubId(g.clubId);
    try {
      await storage.setClubId(g.clubId);
      if (g.primaryProfile.memberId) {
        await storage.setActiveMemberId(g.primaryProfile.memberId);
      }
      await client.resetStore().catch(() => {});
      const r = await client.query<AdminSwitchData>({
        query: VIEWER_ADMIN_SWITCH,
        fetchPolicy: 'network-only',
      });
      if (!r.data?.viewerAdminSwitch?.canAccessClubBackOffice) {
        await storage.clearAuth();
        Alert.alert(
          'Accès refusé',
          'Vous n\'avez pas les droits pour administrer ce club.',
        );
        navigation.replace('Login');
        return;
      }
      navigation.replace('Main');
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Connexion impossible.',
      );
    } finally {
      setSubmittingClubId(null);
    }
  };

  return (
    <ScreenContainer scroll padding={0}>
      <ScreenHero
        eyebrow="CHOIX DU CLUB"
        title="Quel club gérer ?"
        subtitle="Vous administrez plusieurs structures."
        compact
      />
      <View style={styles.list}>
        {groups.map((g) => (
          <Pressable
            key={g.clubId}
            onPress={() => void onPick(g)}
            disabled={submittingClubId !== null}
            style={({ pressed }) => [
              pressed && { opacity: 0.85 },
              submittingClubId !== null &&
                submittingClubId !== g.clubId && { opacity: 0.4 },
            ]}
          >
            <Card padding={spacing.md}>
              <View style={styles.rowInner}>
                <View style={styles.logoWrap}>
                  <Text style={styles.logoFallback}>
                    {profileDisplayName(g.primaryProfile)
                      .split(' ')
                      .map((s) => s[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clubName} numberOfLines={1}>
                    Club {g.clubId.slice(0, 8)}
                  </Text>
                  <Text style={styles.role} numberOfLines={1}>
                    {profileDisplayName(g.primaryProfile)}
                    {g.profileCount > 1
                      ? ` · ${g.profileCount} profils`
                      : ''}
                  </Text>
                  {submittingClubId === g.clubId ? (
                    <Text style={styles.connecting}>Connexion…</Text>
                  ) : null}
                </View>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoFallback: {
    ...typography.h3,
    color: palette.primary,
  },
  clubName: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  role: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
  connecting: {
    ...typography.small,
    color: palette.primary,
    marginTop: 2,
  },
});
