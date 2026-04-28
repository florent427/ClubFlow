import { useQuery } from '@apollo/client/react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Card, ScreenHero } from '../components/ui';
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { PromoteSelfToMemberCta } from '../components/PromoteSelfToMemberCta';
import { RegisterChildMemberCta } from '../components/RegisterChildMemberCta';
import { VIEWER_ME } from '../lib/viewer-documents';
import * as storage from '../lib/storage';
import type { ViewerMeData } from '../lib/viewer-types';
import { palette, radius, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

export function HomeContactScreen() {
  const navigation = useNavigation();
  const rootNav =
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>() ??
    navigation;

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const me = meData?.viewerMe;
  const hasClubFamily = me?.hasClubFamily === true;

  async function logout() {
    await storage.clearAuth();
    rootNav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }),
    );
  }

  async function chooseOtherProfile() {
    await storage.clearClubId();
    rootNav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'SelectProfile' }] }),
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="BIENVENUE"
        title="Votre espace"
        subtitle="Votre compte est actif. Voici ce que vous pouvez faire."
        gradient="hero"
        overlap
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
      <JoinFamilyByPayerEmailCta variant="dashboard" />

      {/* Actions principales */}
      <Card title="Que souhaitez-vous faire ?">
        <View style={{ gap: spacing.sm }}>
          <PromoteSelfToMemberCta />
          <RegisterChildMemberCta />
          {hasClubFamily ? <InviteFamilyMemberCta /> : null}
        </View>
      </Card>

      {/* Onboarding informatif */}
      <View style={{ gap: spacing.md }}>
        <InfoTile
          icon="receipt-outline"
          tone="info"
          title="Consulter les factures"
          description="Onglet Famille — visible si vous êtes payeur du foyer."
        />
        <InfoTile
          icon="people-outline"
          tone="info"
          title="Profils des enfants"
          description="Basculez entre profils dans les paramètres si vos enfants sont rattachés à votre compte."
        />
        <InfoTile
          icon="hourglass-outline"
          tone="warning"
          title="Espace membre complet"
          description="Planning, progression, réservations — disponibles dès que le club aura activé votre fiche sportive."
        />
      </View>

      {/* Session */}
      <Card title="Session">
        <View style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => void chooseOtherProfile()}
            style={({ pressed }) => [
              styles.sessionRow,
              pressed && styles.sessionRowPressed,
            ]}
            accessibilityRole="button"
          >
            <Ionicons name="people-outline" size={20} color={palette.primary} />
            <Text style={styles.sessionLabel}>Choisir un autre profil</Text>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} />
          </Pressable>
          <Button
            label="Se déconnecter"
            onPress={() => void logout()}
            variant="ghost"
            icon="log-out-outline"
            fullWidth
          />
        </View>
      </Card>
      </ScrollView>
    </View>
  );
}

function InfoTile({
  icon,
  tone,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'info' | 'warning';
  title: string;
  description: string;
}) {
  const bg = tone === 'info' ? palette.infoBg : palette.warningBg;
  const fg = tone === 'info' ? '#075985' : '#92400e';
  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <View style={[styles.tileIcon, { backgroundColor: 'white' }]}>
        <Ionicons name={icon} size={20} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tileTitle, { color: fg }]}>{title}</Text>
        <Text style={styles.tileDesc}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    marginTop: -spacing.xxl,
    gap: spacing.lg,
  },

  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: { ...typography.bodyStrong },
  tileDesc: {
    ...typography.small,
    color: palette.body,
    marginTop: spacing.xxs,
    lineHeight: 18,
  },

  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    minHeight: 48,
  },
  sessionRowPressed: { backgroundColor: palette.bgAlt },
  sessionLabel: {
    flex: 1,
    ...typography.bodyStrong,
    color: palette.ink,
  },
});
