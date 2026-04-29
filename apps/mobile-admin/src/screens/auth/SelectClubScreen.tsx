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
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { storage } from '../../lib/storage';
import type { LoginProfile } from '../../lib/auth-types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SelectClub'>;
type R = RouteProp<RootStackParamList, 'SelectClub'>;

const ROLE_LABELS: Record<string, string> = {
  CLUB_ADMIN: 'Administrateur',
  BOARD: 'Membre du bureau',
  TREASURER: 'Trésorier·e',
  COMM_MANAGER: 'Communication',
};

export function SelectClubScreen() {
  const navigation = useNavigation<Nav>();
  const { profiles } = useRoute<R>().params;

  const onPick = async (p: LoginProfile) => {
    await storage.setClubId(p.club.id);
    await storage.setActiveMemberId(p.memberId);
    if (p.membershipRole) {
      await storage.raw.set('membership_role', p.membershipRole);
    }
    navigation.replace('Main');
  };

  return (
    <ScreenContainer scroll>
      <ScreenHero
        eyebrow="CHOIX DU CLUB"
        title="Quel club gérer ?"
        subtitle="Vous administrez plusieurs structures."
        compact
      />
      <View style={styles.list}>
        {profiles.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => void onPick(p)}
            style={({ pressed }) => [
              styles.row,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Card padding={spacing.md}>
              <View style={styles.rowInner}>
                <View style={styles.logoWrap}>
                  {p.club.logoUrl ? (
                    <Image
                      source={{ uri: p.club.logoUrl }}
                      style={styles.logo}
                    />
                  ) : (
                    <Text style={styles.logoFallback}>
                      {p.club.name.slice(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clubName} numberOfLines={1}>
                    {p.club.name}
                  </Text>
                  <Text style={styles.role} numberOfLines={1}>
                    {p.membershipRole
                      ? (ROLE_LABELS[p.membershipRole] ?? p.membershipRole)
                      : 'Admin système'}
                  </Text>
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
  row: {},
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: palette.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 48, height: 48 },
  logoFallback: {
    ...typography.h3,
    color: palette.body,
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
});
