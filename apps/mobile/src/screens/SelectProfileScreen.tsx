import { useMutation, useQuery } from '@apollo/client/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnimatedPressable,
  EmptyState,
  GradientButton,
  Pill,
  ScreenHero,
} from '../components/ui';
import type {
  SelectContactProfileData,
  SelectProfileData,
  ViewerProfile,
  ViewerProfilesQueryData,
} from '../lib/auth-types';
import {
  SELECT_VIEWER_CONTACT_PROFILE,
  SELECT_VIEWER_PROFILE,
  VIEWER_PROFILES,
} from '../lib/documents';
import * as storage from '../lib/storage';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SelectProfile'>;

function profileRowKey(p: ViewerProfile): string {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return '';
}

function profileBadge(p: ViewerProfile): string | null {
  if (p.contactId && !p.memberId) return 'Espace contact';
  if (p.isPrimaryProfile) return 'Responsable facturation';
  return null;
}

function isUnauthorized(err: {
  message?: string;
  networkError?: unknown;
}): boolean {
  const msg = err.message?.toLowerCase() ?? '';
  if (msg.includes('unauthorized')) return true;
  const ne = err.networkError as { statusCode?: number } | undefined;
  if (ne?.statusCode === 401) return true;
  return false;
}

export function SelectProfileScreen({ navigation }: Props) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const autoPickedRef = useRef(false);

  const { data, loading, error } = useQuery<ViewerProfilesQueryData>(
    VIEWER_PROFILES,
    { skip: token === undefined || token === null },
  );

  const [selectProfile, { loading: selectingMember }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);
  const [selectContactProfile, { loading: selectingContact }] =
    useMutation<SelectContactProfileData>(SELECT_VIEWER_CONTACT_PROFILE);
  const selecting = selectingMember || selectingContact;

  useEffect(() => {
    void (async () => {
      if (await storage.hasMemberSession()) {
        navigation.replace('Main');
        return;
      }
      const t = await storage.getToken();
      if (!t) {
        navigation.replace('Login');
        return;
      }
      setToken(t);
    })();
  }, [navigation]);

  useEffect(() => {
    if (!error) return;
    if (!isUnauthorized(error)) return;
    void (async () => {
      await storage.clearAuth();
      navigation.replace('Login');
    })();
  }, [error, navigation]);

  async function pick(p: ViewerProfile) {
    if (p.memberId) {
      const { data: sel } = await selectProfile({
        variables: { memberId: p.memberId },
      });
      const newTok = sel?.selectActiveViewerProfile?.accessToken;
      if (!newTok) return;
      await storage.setMemberSession(newTok, p.clubId);
    } else if (p.contactId) {
      const { data: sel } = await selectContactProfile({
        variables: { contactId: p.contactId },
      });
      const newTok = sel?.selectActiveViewerContactProfile?.accessToken;
      if (!newTok) return;
      // Profile Contact PAYER → flag CONTACT_ONLY pour que MainScreen
      // route vers HomeContactScreen (avec CTAs Inscrire enfant / moi-même)
      // au lieu de HomeDashboardScreen (vue Member).
      await storage.setMemberContactSession(newTok, p.clubId);
    } else {
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }

  const profiles = data?.viewerProfiles ?? [];

  useEffect(() => {
    if (loading || autoPickedRef.current || profiles.length !== 1) return;
    autoPickedRef.current = true;
    void pick(profiles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profiles]);

  if (token === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (error && isUnauthorized(error)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.muted}>
          Session expirée — retour à la connexion…
        </Text>
      </View>
    );
  }

  if (!loading && profiles.length === 1 && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.muted}>Redirection en cours…</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="VOTRE COMPTE"
        title="Quel profil ?"
        subtitle="Plusieurs espaces sont liés à votre compte."
        compact
        overlap
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.list}>
          {loading ? (
            <View style={{ gap: spacing.md }}>
              <ProfileSkeleton />
              <ProfileSkeleton />
            </View>
          ) : profiles.length === 0 ? (
            <EmptyState
              icon="person-outline"
              title="Aucun profil disponible"
              description="Contactez votre club pour qu'il vous rattache à un espace."
              variant="card"
            />
          ) : (
            profiles.map((p) => {
              const badge = profileBadge(p);
              const isContact = p.contactId && !p.memberId;
              const initials = `${(p.firstName[0] ?? '?').toUpperCase()}${(
                p.lastName[0] ?? ''
              ).toUpperCase()}`;
              return (
                <AnimatedPressable
                  key={profileRowKey(p)}
                  onPress={() => void pick(p)}
                  disabled={selecting}
                  accessibilityRole="button"
                  accessibilityLabel={`Choisir ${p.firstName} ${p.lastName}`}
                  haptic
                  style={styles.card}
                >
                  <View style={styles.cardInner}>
                    <View
                      style={[
                        styles.avatar,
                        isContact && styles.avatarContact,
                      ]}
                    >
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>
                        {p.firstName} {p.lastName}
                      </Text>
                      {/* Nom du club visible en permanence pour différencier
                          les profils multi-clubs (parité web). */}
                      {p.clubName ? (
                        <Text style={styles.clubName} numberOfLines={1}>
                          {p.clubName}
                        </Text>
                      ) : null}
                      {badge ? (
                        <View style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }}>
                          <Pill
                            label={badge}
                            tone={isContact ? 'info' : 'primary'}
                            icon={isContact ? 'mail-outline' : 'star-outline'}
                          />
                        </View>
                      ) : null}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={palette.muted}
                    />
                  </View>
                </AnimatedPressable>
              );
            })
          )}
        </View>

        <View style={styles.footerActions}>
          <GradientButton
            label="Changer de compte"
            icon="log-out-outline"
            onPress={async () => {
              await storage.clearAuth();
              navigation.replace('Login');
            }}
            gradient="dark"
            glow="none"
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View style={[styles.card, { padding: spacing.lg }]}>
      <View style={styles.cardInner}>
        <View style={[styles.avatar, { backgroundColor: palette.bgAlt }]} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <View
            style={{
              height: 18,
              width: '60%',
              backgroundColor: palette.bgAlt,
              borderRadius: radius.sm,
            }}
          />
          <View
            style={{
              height: 12,
              width: '40%',
              backgroundColor: palette.bgAlt,
              borderRadius: radius.sm,
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  centered: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  muted: { ...typography.body, color: palette.muted },

  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    marginTop: -spacing.md,
  },
  list: { gap: spacing.md },

  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.md,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarContact: { backgroundColor: palette.cool },
  avatarText: {
    color: '#ffffff',
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 18,
  },
  name: { ...typography.h3, color: palette.ink },
  clubName: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },

  footerActions: {
    marginTop: spacing.xl,
  },
});
