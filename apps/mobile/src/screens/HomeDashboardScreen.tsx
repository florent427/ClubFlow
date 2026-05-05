import { useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AnimatedPressable,
  Card,
  EmptyState,
  Pill,
  Skeleton,
} from '../components/ui';
import { ClubLogoBubble } from '../components/ClubLogoBubble';
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { MemberProfileSwitcher } from '../components/MemberProfileSwitcher';
import { MemberRoleToggle } from '../components/MemberRoleToggle';
import { RegisterChildMemberCta } from '../components/RegisterChildMemberCta';
import { RegisterSelfMemberCta } from '../components/RegisterSelfMemberCta';
import { SlotCard } from '../components/SlotCard';
import {
  CLUB,
  VIEWER_ADMIN_SWITCH,
  VIEWER_FAMILY_BILLING,
  VIEWER_ME,
  VIEWER_UPCOMING_SLOTS,
} from '../lib/viewer-documents';
import {
  VIEWER_ACTIVE_CART,
  type ViewerActiveCartData,
} from '../lib/cart-documents';
import {
  VIEWER_DOCUMENTS_TO_SIGN,
  type ViewerDocumentsToSignData,
} from '../lib/documents-graphql';
import type {
  ClubQueryData,
  ViewerAdminSwitchData,
  ViewerBillingData,
  ViewerMeData,
  ViewerUpcomingData,
} from '../lib/viewer-types';
import { formatEuroCents, medicalCertState } from '../lib/format';
import {
  gradients as defaultGradients,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../lib/theme';
import { useClubTheme } from '../lib/theme-context';
import type { MainTabParamList } from '../types/navigation';

export function HomeDashboardScreen() {
  const insets = useSafeAreaInsets();
  const clubTheme = useClubTheme();
  const gradients = clubTheme.isClubBranded
    ? clubTheme.gradients
    : defaultGradients;
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { data: adminSwitchData } = useQuery<ViewerAdminSwitchData>(
    VIEWER_ADMIN_SWITCH,
    { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' },
  );
  const { data: meData, loading: meLoading } = useQuery<ViewerMeData>(
    VIEWER_ME,
    { errorPolicy: 'all' },
  );
  const { data: clubData } = useQuery<ClubQueryData>(CLUB);

  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;
  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;
  const hasClubFamily = meData?.viewerMe?.hasClubFamily === true;

  const slotsQ = useQuery<ViewerUpcomingData>(VIEWER_UPCOMING_SLOTS, {
    skip: hideMemberModules,
    errorPolicy: 'all',
  });
  const billQ = useQuery<ViewerBillingData>(VIEWER_FAMILY_BILLING, {
    errorPolicy: 'all',
  });
  const docsToSignQ = useQuery<ViewerDocumentsToSignData>(
    VIEWER_DOCUMENTS_TO_SIGN,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );
  const docsToSignCount =
    docsToSignQ.data?.viewerDocumentsToSign?.length ?? 0;
  const cartQ = useQuery<ViewerActiveCartData>(VIEWER_ACTIVE_CART, {
    skip: !canManageMembershipCart,
    fetchPolicy: 'cache-and-network',
  });
  const cart = cartQ.data?.viewerActiveMembershipCart ?? null;
  const cartItemsCount =
    (cart?.items.length ?? 0) + (cart?.pendingItems.length ?? 0);
  const cartIsOpen = cart?.status === 'OPEN' && cartItemsCount > 0;

  const me = meData?.viewerMe;
  const adminSwitch = adminSwitchData?.viewerAdminSwitch;
  const clubName = clubData?.club?.name;
  const slots = slotsQ.data?.viewerUpcomingCourseSlots ?? [];
  const dashSlots = slots.slice(0, 3);
  const billing = billQ.data?.viewerFamilyBillingSummary;
  const isPayer = billing?.isPayerView ?? false;
  const openInvoices =
    billing?.invoices.filter((i) => i.balanceCents > 0) ?? [];
  const totalBalance = openInvoices.reduce((s, i) => s + i.balanceCents, 0);
  const totalPaid =
    billing?.invoices.reduce((s, i) => s + i.totalPaidCents, 0) ?? 0;
  const nowMs = Date.now();
  const hasOverdue = openInvoices.some(
    (i) => i.dueAt && new Date(i.dueAt).getTime() < nowMs,
  );

  const cert = medicalCertState(me?.medicalCertExpiresAt ?? null);

  const greeting = getGreeting();

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* === HERO PREMIUM === */}
        <LinearGradient
          colors={gradients.hero.colors}
          start={gradients.hero.start}
          end={gradients.hero.end}
          style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
        >
          {/* Cercles décoratifs */}
          <View style={[styles.circle, styles.circle1]} />
          <View style={[styles.circle, styles.circle2]} />

          <View style={styles.heroHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroEyebrow}>
                {clubName?.toUpperCase() ?? 'ESPACE MEMBRE'}
              </Text>
              <Text style={styles.heroGreeting}>{greeting},</Text>
              <Text style={styles.heroName}>
                {meLoading ? '…' : me?.firstName ?? 'membre'} 👋
              </Text>
            </View>
            {/*
              Stack vertical à droite : logo club en haut + bouton admin
              en dessous (si l'utilisateur a un accès back-office).
              `<ClubLogoBubble>` gère le fallback automatique vers les
              initiales du club si l'image ne charge pas (URL invalide,
              404, hors-ligne…) — évite le cercle blanc vide.
            */}
            <View style={styles.heroTrailing}>
              <ClubLogoBubble size={48} variant="light" />
              {adminSwitch?.canAccessClubBackOffice === true ? (
                <MemberRoleToggle
                  canAccessClubBackOffice
                  adminWorkspaceClubId={adminSwitch.adminWorkspaceClubId}
                  variant="header"
                />
              ) : null}
              {/* Bouton panier d'adhésion : visible uniquement pour le
                  payeur (canManageMembershipCart). Badge rouge avec le
                  nombre d'items quand > 0. Tap → onglet Panier. */}
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
          </View>

          <MemberProfileSwitcher onDark />
        </LinearGradient>

        {/* === CONTENT (chevauche légèrement le hero) === */}
        <View style={styles.content}>
          {/* Pills statut */}
          <View style={styles.pillsRow}>
            {!hideMemberModules ? (
              <>
                <Pill
                  icon="school-outline"
                  tone={me?.gradeLevelLabel ? 'primary' : 'neutral'}
                  label={me?.gradeLevelLabel ?? 'Grade non renseigné'}
                />
                {/*
                  Le certificat médical n'est affiché que si :
                   - le club l'a marqué comme requis dans son catalogue
                     champs adhérent (cf. ClubMemberFieldCatalogSetting
                     fieldKey=MEDICAL_CERT_EXPIRES_AT, required=true)
                   - OU le membre a déjà saisi un certificat valide
                     (auquel cas on garde la pill verte "à jour")
                  Évite d'inquiéter inutilement les adhérents des clubs
                  où le certif n'est pas une obligation.
                */}
                {(clubData?.club?.requiresMedicalCertificate || cert.ok) ? (
                  <Pill
                    icon="shield-checkmark-outline"
                    tone={cert.ok ? 'success' : 'warning'}
                    label={cert.label}
                  />
                ) : null}
                {me?.telegramLinked ? (
                  <Pill
                    icon="send-outline"
                    tone="success"
                    label="Telegram relié"
                  />
                ) : null}
              </>
            ) : null}
            {billing?.isHouseholdGroupSpace && isPayer ? (
              <Pill
                icon="people-outline"
                tone="info"
                label="Espace familial partagé"
                onPress={() => navigation.navigate('Famille')}
              />
            ) : null}
          </View>

          {/* === BANNIÈRE DOCUMENTS À SIGNER === */}
          {docsToSignCount > 0 ? (
            <AnimatedPressable
              onPress={() => navigation.navigate('Documents')}
              accessibilityRole="button"
              accessibilityLabel={`${docsToSignCount} document à signer`}
              style={styles.docsBanner}
            >
              <View style={styles.docsBannerIcon}>
                <Ionicons
                  name="alert-circle"
                  size={22}
                  color={palette.warningText}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.docsBannerTitle}>
                  {docsToSignCount} document
                  {docsToSignCount > 1 ? 's' : ''} à signer
                </Text>
                <Text style={styles.docsBannerSub}>
                  Signez maintenant pour finaliser votre adhésion.
                </Text>
              </View>
              <View style={styles.docsBannerCta}>
                <Text style={styles.docsBannerCtaText}>Signer</Text>
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={palette.warningText}
                />
              </View>
            </AnimatedPressable>
          ) : null}

          <JoinFamilyByPayerEmailCta variant="dashboard" />

          {/* === BANNIÈRE PANIER EN COURS (payeur uniquement) === */}
          {cartIsOpen ? (
            <AnimatedPressable
              onPress={() => navigation.navigate('Panier' as never)}
              accessibilityRole="button"
              accessibilityLabel={`Panier d'adhésion : ${cartItemsCount} membre${
                cartItemsCount > 1 ? 's' : ''
              }, total ${formatEuroCents(cart?.totalCents ?? 0)}`}
              haptic
              style={styles.cartBanner}
            >
              <View style={styles.cartBannerIcon}>
                <Ionicons
                  name="basket"
                  size={22}
                  color={palette.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartBannerTitle}>
                  Panier d&rsquo;adhésion ({cartItemsCount})
                </Text>
                <Text style={styles.cartBannerSub}>
                  Total {formatEuroCents(cart?.totalCents ?? 0)} —{' '}
                  {cart?.canValidate
                    ? 'prêt à valider'
                    : 'à compléter'}
                </Text>
              </View>
              <View style={styles.cartBannerCta}>
                <Text style={styles.cartBannerCtaText}>Voir</Text>
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={palette.primary}
                />
              </View>
            </AnimatedPressable>
          ) : null}

          {/* === ACTIONS PAYEUR (inscriptions famille) ===
              Visible pour tout membre qui peut gérer un panier d'adhésion
              (typiquement le PAYER du foyer). Permet d'inscrire un enfant
              ou d'inviter un autre membre sans devoir basculer vers
              l'espace contact. Un Member-PAYER peut donc avoir SON espace
              membre + ses CTAs famille au même endroit. */}
          {canManageMembershipCart ? (
            <Card title="Inscriptions famille">
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
          ) : null}

          {/* === KPIs FACTURES (payeur uniquement) === */}
          {isPayer ? (
            <View style={styles.kpiRow}>
              {/*
                Les 2 tiles sont cliquables → tab "Famille" qui regroupe
                les factures + actions de paiement (Stripe checkout par
                facture, géré dans FamilyScreen.tsx). Évite le frustration
                "vignette d'apparence interactive mais sans tap".
              */}
              <KpiTile
                icon="wallet-outline"
                label="Reste à payer"
                value={
                  billQ.loading && !billing
                    ? null
                    : formatEuroCents(totalBalance)
                }
                gradient="warm"
                emphasized={totalBalance > 0}
                onPress={() => navigation.navigate('Famille')}
                accessibilityLabel={`Reste à payer ${formatEuroCents(totalBalance)} — voir mes factures`}
              />
              <KpiTile
                icon="checkmark-circle-outline"
                label="Déjà réglé"
                value={
                  billQ.loading && !billing
                    ? null
                    : formatEuroCents(totalPaid)
                }
                gradient="cool"
                onPress={() => navigation.navigate('Famille')}
                accessibilityLabel={`Déjà réglé ${formatEuroCents(totalPaid)} — voir mes factures`}
              />
            </View>
          ) : null}

          {/* === MON PROGRAMME === */}
          {!hideMemberModules ? (
            <Card title="Mon programme">
              {meLoading ? (
                <View style={{ gap: spacing.sm }}>
                  <Skeleton width="60%" height={20} />
                  <Skeleton width="40%" height={14} />
                </View>
              ) : me?.gradeLevelLabel ? (
                <View style={{ gap: spacing.md }}>
                  <View style={styles.programRow}>
                    <LinearGradient
                      colors={gradients.primary.colors}
                      start={gradients.primary.start}
                      end={gradients.primary.end}
                      style={styles.gradeIcon}
                    >
                      <Ionicons name="school" size={22} color="#ffffff" />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.programGrade}>
                        {me.gradeLevelLabel}
                      </Text>
                      <Text style={styles.programGradeSub}>
                        Votre grade actuel
                      </Text>
                    </View>
                    <AnimatedPressable
                      onPress={() => navigation.navigate('Progression')}
                      accessibilityRole="link"
                      accessibilityLabel="Voir ma progression"
                      style={styles.linkChevron}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={palette.primary}
                      />
                    </AnimatedPressable>
                  </View>
                </View>
              ) : (
                <EmptyState
                  icon="book-outline"
                  title="Grade à compléter"
                  description="Le club configurera votre grade prochainement."
                />
              )}
            </Card>
          ) : null}

          {/* === PROCHAINS COURS === */}
          {!hideMemberModules ? (
            <Card
              title="Prochains cours"
              headerRight={
                slots.length > 3 ? (
                  <AnimatedPressable
                    onPress={() => navigation.navigate('Planning')}
                    accessibilityRole="link"
                    accessibilityLabel="Voir tous les cours"
                  >
                    <Text style={styles.linkText}>Tout voir →</Text>
                  </AnimatedPressable>
                ) : null
              }
            >
              {slotsQ.loading && dashSlots.length === 0 ? (
                <View style={{ gap: spacing.md }}>
                  <Skeleton height={64} borderRadius={radius.lg} />
                  <Skeleton height={64} borderRadius={radius.lg} />
                </View>
              ) : slotsQ.error ? (
                <EmptyState
                  icon="alert-circle-outline"
                  title="Planning indisponible"
                  description="Module ou droits insuffisants."
                />
              ) : dashSlots.length === 0 ? (
                <EmptyState
                  icon="calendar-outline"
                  title="Aucun cours à venir"
                  description="Les prochains créneaux planifiés apparaîtront ici."
                />
              ) : (
                <View style={{ gap: spacing.md }}>
                  {dashSlots.map((s) => (
                    <SlotCard key={s.id} slot={s} />
                  ))}
                </View>
              )}
            </Card>
          ) : null}

          {/* === FACTURES (uniquement payeurs) === */}
          {isPayer ? (
            <Card
              title="Mes factures"
              headerRight={
                hasOverdue ? <Pill tone="danger" label="En retard" /> : null
              }
            >
              {billQ.loading && !billing ? (
                <View style={{ gap: spacing.sm }}>
                  <Skeleton height={48} borderRadius={radius.md} />
                  <Skeleton height={48} borderRadius={radius.md} />
                </View>
              ) : billQ.error ? (
                <EmptyState
                  icon="alert-circle-outline"
                  title="Facturation indisponible"
                  description="Module ou droits insuffisants."
                />
              ) : openInvoices.length === 0 ? (
                <View style={styles.allClearRow}>
                  <View style={styles.allClearIcon}>
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={palette.success}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.allClearTitle}>Tout est à jour</Text>
                    <Text style={styles.allClearSub}>
                      Aucun solde en attente.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {openInvoices.slice(0, 3).map((inv) => {
                    const overdue =
                      inv.dueAt && new Date(inv.dueAt).getTime() < nowMs;
                    return (
                      <View key={inv.id} style={styles.invoiceLine}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.invoiceLabel} numberOfLines={1}>
                            {inv.label}
                          </Text>
                          {overdue ? (
                            <Text style={styles.invoiceOverdue}>
                              Échue
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.invoiceAmt}>
                          {formatEuroCents(inv.balanceCents)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
              <AnimatedPressable
                onPress={() => navigation.navigate('Famille')}
                accessibilityRole="link"
                accessibilityLabel="Voir toutes les factures"
                style={styles.viewAllRow}
              >
                <View style={styles.viewAllInner}>
                  <Text style={styles.linkText}>
                    Voir toutes les factures
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={palette.primary}
                  />
                </View>
              </AnimatedPressable>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

function KpiTile({
  icon,
  label,
  value,
  gradient,
  emphasized,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  gradient: keyof typeof defaultGradients;
  emphasized?: boolean;
  /** Si fourni, la tile devient cliquable et navigue vers l'écran cible. */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const clubTheme = useClubTheme();
  const grads = clubTheme.isClubBranded
    ? clubTheme.gradients
    : defaultGradients;
  const grad = grads[gradient];

  const content = (
    <>
      <LinearGradient
        colors={grad.colors}
        start={grad.start}
        end={grad.end}
        style={styles.kpiIconBubble}
      >
        <Ionicons name={icon} size={18} color="#ffffff" />
      </LinearGradient>
      <Text style={styles.kpiLabel}>{label}</Text>
      {value === null ? (
        <Skeleton width="60%" height={26} />
      ) : (
        <Text style={styles.kpiValue}>{value}</Text>
      )}
      {onPress ? (
        <View style={styles.kpiChevron} pointerEvents="none">
          <Ionicons
            name="chevron-forward"
            size={14}
            color={palette.muted}
          />
        </View>
      ) : null}
    </>
  );

  // Si onPress, on wrap dans un Pressable pour la nav + feedback tactile.
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={({ pressed }) => [
          styles.kpi,
          emphasized && shadow.md,
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        ]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.kpi, emphasized && shadow.md]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  scroll: { paddingBottom: spacing.xxxl },

  hero: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.huge,
    overflow: 'hidden',
  },
  circle: { position: 'absolute', borderRadius: 1000 },
  circle1: {
    width: 220,
    height: 220,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -60,
    right: -60,
  },
  circle2: {
    width: 160,
    height: 160,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -40,
    left: -50,
  },

  heroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroTrailing: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  heroEyebrow: {
    ...typography.eyebrow,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: spacing.sm,
  },
  heroGreeting: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
  },
  heroName: {
    ...typography.displayLg,
    color: '#ffffff',
    marginTop: spacing.xxs,
  },

  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.lg,
    // Faible chevauchement (12dp dans le hero) — gardons l'effet card
    // flottante sans noyer les premières pills dans le gradient.
    marginTop: -spacing.md,
  },

  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  // === KPIs ===
  kpiRow: { flexDirection: 'row', gap: spacing.md },
  kpi: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    position: 'relative',
    ...shadow.sm,
  },
  kpiIconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: { ...typography.caption, color: palette.muted },
  kpiValue: { ...typography.metric, color: palette.ink },
  // Chevron discret en haut à droite des KPIs cliquables — signale
  // l'interactivité sans surcharger.
  kpiChevron: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },

  // === Programme ===
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gradeIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programGrade: { ...typography.h3, color: palette.ink },
  programGradeSub: { ...typography.small, color: palette.muted },
  linkChevron: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // === Factures ===
  allClearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.successBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  allClearIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allClearTitle: { ...typography.bodyStrong, color: palette.successText },
  allClearSub: { ...typography.small, color: palette.successText },

  invoiceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.bgAlt,
    borderRadius: radius.md,
  },
  invoiceLabel: { ...typography.bodyStrong, color: palette.ink },
  invoiceOverdue: {
    ...typography.caption,
    color: palette.danger,
    marginTop: 2,
  },
  invoiceAmt: { ...typography.bodyStrong, color: palette.ink },

  viewAllRow: {
    marginTop: spacing.sm,
  },
  viewAllInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  linkText: { ...typography.bodyStrong, color: palette.primary },

  // === Bouton panier dans le hero (header trailing) ===
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

  // === Bannière panier d'adhésion ===
  cartBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
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
  cartBannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.3)',
  },
  cartBannerCtaText: {
    ...typography.smallStrong,
    color: palette.primary,
    fontSize: 12,
  },

  // === Bannière documents à signer ===
  docsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.warningBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.warningBorder,
  },
  docsBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docsBannerTitle: {
    ...typography.bodyStrong,
    color: palette.warningText,
  },
  docsBannerSub: {
    ...typography.small,
    color: palette.warningText,
    marginTop: 2,
  },
  docsBannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: palette.warningBorder,
  },
  docsBannerCtaText: {
    ...typography.smallStrong,
    color: palette.warningText,
    fontSize: 12,
  },
});
