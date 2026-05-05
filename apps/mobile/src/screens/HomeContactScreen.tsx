import { useQuery } from '@apollo/client/react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AnimatedPressable,
  Button,
  Card,
  Pill,
  ScreenHero,
} from '../components/ui';
import { ClubLogoBubble } from '../components/ClubLogoBubble';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { RegisterChildMemberCta } from '../components/RegisterChildMemberCta';
import { RegisterSelfMemberCta } from '../components/RegisterSelfMemberCta';
import { VIEWER_ME } from '../lib/viewer-documents';
import {
  VIEWER_ACTIVE_CART,
  type ViewerActiveCartData,
} from '../lib/cart-documents';
import * as storage from '../lib/storage';
import type { ViewerMeData } from '../lib/viewer-types';
import { palette, radius, spacing, typography } from '../lib/theme';
import { formatEuroCents } from '../lib/format';
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
  const canManageMembershipCart = me?.canManageMembershipCart === true;
  const cartQ = useQuery<ViewerActiveCartData>(VIEWER_ACTIVE_CART, {
    skip: !canManageMembershipCart,
    fetchPolicy: 'cache-and-network',
  });
  const cart = cartQ.data?.viewerActiveMembershipCart ?? null;
  const cartItemsCount =
    (cart?.items.length ?? 0) + (cart?.pendingItems.length ?? 0);
  const cartIsOpen = cart?.status === 'OPEN' && cartItemsCount > 0;

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
        trailing={
          /* Stack vertical : logo + bouton panier (si payeur). On
             repasse explicitement ClubLogoBubble car en passant
             `trailing` on perd le default auto. */
          <View style={styles.heroTrailing}>
            <ClubLogoBubble size={44} variant="light" />
            {canManageMembershipCart ? (
              <AnimatedPressable
                onPress={() => navigation.navigate('Panier' as never)}
                accessibilityRole="button"
                accessibilityLabel={
                  cartItemsCount > 0
                    ? `Panier d'adhésion : ${cartItemsCount} élément${
                        cartItemsCount > 1 ? 's' : ''
                      }`
                    : "Ouvrir le panier d'adhésion"
                }
                haptic
                style={styles.cartIconBtn}
              >
                <Ionicons name="basket" size={22} color="#ffffff" />
                {cartItemsCount > 0 ? (
                  <View style={styles.cartIconBadge}>
                    <Text style={styles.cartIconBadgeText}>
                      {cartItemsCount > 9 ? '9+' : cartItemsCount}
                    </Text>
                  </View>
                ) : null}
              </AnimatedPressable>
            ) : null}
          </View>
        }
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
      <JoinFamilyByPayerEmailCta variant="dashboard" />

      {/* === BANNIÈRE PANIER (si déjà des items) === */}
      {cartIsOpen ? (
        <AnimatedPressable
          onPress={() => navigation.navigate('Panier' as never)}
          accessibilityRole="button"
          accessibilityLabel={`Panier d'adhésion : ${cartItemsCount} membre${
            cartItemsCount > 1 ? 's' : ''
          }`}
          haptic
          style={styles.cartBanner}
        >
          <View style={styles.cartBannerIcon}>
            <Ionicons name="basket" size={22} color={palette.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cartBannerTitle}>
              Panier d&rsquo;adhésion ({cartItemsCount})
            </Text>
            <Text style={styles.cartBannerSub}>
              Total {formatEuroCents(cart?.totalCents ?? 0)} —{' '}
              {cart?.canValidate ? 'prêt à valider' : 'à compléter'}
            </Text>
          </View>
          <Pill label="Voir" tone="primary" />
        </AnimatedPressable>
      ) : null}

      {/* Actions principales */}
      <Card title="Que souhaitez-vous faire ?">
        <View style={{ gap: spacing.sm }}>
          <RegisterChildMemberCta
            onSuccess={() => {
              void cartQ.refetch();
              navigation.navigate('Panier' as never);
            }}
          />
          <RegisterSelfMemberCta
            onSuccess={() => {
              void cartQ.refetch();
              navigation.navigate('Panier' as never);
            }}
          />
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
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

  heroTrailing: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  cartIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartIconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cartIconBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },

  cartBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  cartBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBannerTitle: { ...typography.bodyStrong, color: palette.ink },
  cartBannerSub: {
    ...typography.small,
    color: palette.body,
    marginTop: 2,
  },
});
