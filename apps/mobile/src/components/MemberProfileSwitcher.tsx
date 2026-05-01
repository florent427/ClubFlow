import { useMutation, useQuery } from '@apollo/client/react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  SELECT_VIEWER_CONTACT_PROFILE,
  SELECT_VIEWER_PROFILE,
  VIEWER_PROFILES,
} from '../lib/documents';
import { VIEWER_ME } from '../lib/viewer-documents';
import type {
  SelectContactProfileData,
  SelectProfileData,
  ViewerProfilesQueryData,
  ViewerProfile,
} from '../lib/auth-types';
import type { ViewerMeData } from '../lib/viewer-types';
import { absolutizeMediaUrl } from '../lib/absolutize-url';
import * as storage from '../lib/storage';
import { clearAllPinUnlocks } from './PinGate';
import { palette, radius, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

type Props = {
  /** Si true, adapte les couleurs pour un fond sombre / hero gradient. */
  onDark?: boolean;
};

function profileKey(p: {
  memberId: string | null;
  contactId: string | null;
}): string {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return '';
}

function isActiveProfile(
  p: ViewerProfile,
  me: ViewerMeData['viewerMe'],
): boolean {
  if (me.isContactProfile) {
    return p.contactId === me.id && !p.memberId;
  }
  return p.memberId === me.id;
}

function initialsOf(p: ViewerProfile): string {
  const f = p.firstName?.charAt(0) ?? '';
  const l = p.lastName?.charAt(0) ?? '';
  const out = `${f}${l}`.toUpperCase();
  return out.length > 0 ? out : '?';
}

/**
 * Couleur d'avatar déterministe à partir du nom — pour avoir un visuel
 * stable et reconnaissable même sans photo.
 */
function avatarColor(seed: string): string {
  const palette = [
    '#6366f1', // indigo
    '#0ea5e9', // sky
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

/**
 * Sélecteur de profil — affiche le profil actif sous forme de **pill
 * avec avatar** dans le hero du HomeDashboard. Tap → ouvre une bottom
 * sheet listant tous les profils accessibles (membres du foyer + soi).
 *
 * Améliorations vs ancien design :
 *  - Avatar (photo ou initiales colorées) au lieu de chip texte
 *  - Modal plein écran picker → tous les profils visibles d'un coup
 *    (plus de scroll horizontal qui tronque les noms longs)
 *  - Indication "principal" pour le payeur du foyer
 */
export function MemberProfileSwitcher({ onDark = false }: Props = {}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const rootNav =
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>() ??
    navigation;
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const { data: profData } = useQuery<ViewerProfilesQueryData>(VIEWER_PROFILES, {
    fetchPolicy: 'cache-and-network',
  });

  const [selectMember, { loading: loadingM }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);
  const [selectContact, { loading: loadingC }] =
    useMutation<SelectContactProfileData>(SELECT_VIEWER_CONTACT_PROFILE);

  const [pickerOpen, setPickerOpen] = useState(false);
  const loading = loadingM || loadingC;
  const me = meData?.viewerMe;
  const profiles = profData?.viewerProfiles ?? [];
  const activeProfile = profiles.find((p) => me && isActiveProfile(p, me));

  async function switchTo(p: ViewerProfile) {
    if (me && isActiveProfile(p, me)) {
      setPickerOpen(false);
      return;
    }
    try {
      if (p.memberId) {
        const { data } = await selectMember({
          variables: { memberId: p.memberId },
        });
        const tok = data?.selectActiveViewerProfile?.accessToken;
        if (!tok) return;
        await storage.setMemberSession(tok, p.clubId);
      } else if (p.contactId) {
        const { data } = await selectContact({
          variables: { contactId: p.contactId },
        });
        const tok = data?.selectActiveViewerContactProfile?.accessToken;
        if (!tok) return;
        await storage.setMemberSession(tok, p.clubId);
      } else {
        return;
      }
      setPickerOpen(false);
      // Reset les unlocks PIN avant le switch — le nouveau profil
      // (s'il a un PIN) DOIT redemander le code (cf. UX requirement
      // "active à chaque retour sur le profil protégé").
      clearAllPinUnlocks();
      rootNav.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }),
      );
    } catch {
      /* ignore */
    }
  }

  if (profiles.length <= 1) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, onDark && styles.labelOnDark]}>
        Profil actif
      </Text>
      <Pressable
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Profil actif : ${activeProfile?.firstName ?? ''} ${activeProfile?.lastName ?? ''}. Toucher pour changer.`}
        style={({ pressed }) => [
          styles.activeChip,
          onDark && styles.activeChipOnDark,
          pressed && styles.pressed,
        ]}
        disabled={loading}
      >
        {activeProfile ? (
          <Avatar profile={activeProfile} size={32} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.activeName,
              onDark && styles.activeNameOnDark,
            ]}
            numberOfLines={1}
          >
            {activeProfile
              ? `${activeProfile.firstName} ${activeProfile.lastName}`
              : 'Sélectionner'}
          </Text>
          <Text
            style={[
              styles.activeHint,
              onDark && styles.activeHintOnDark,
            ]}
          >
            {profiles.length} profils disponibles
          </Text>
        </View>
        <Ionicons
          name="chevron-down"
          size={18}
          color={onDark ? 'rgba(255,255,255,0.85)' : palette.body}
        />
      </Pressable>

      {/*
        Modal plein écran (style bottom sheet via marginTop) — affiche
        tous les profils dans une grille verticale. Tap → switch + close.
      */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPickerOpen(false)}
            accessibilityLabel="Fermer le sélecteur de profil"
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Choisir un profil</Text>
            <Text style={styles.sheetSubtitle}>
              Basculer sur l'espace d'une autre personne du foyer.
            </Text>

            <View style={styles.list}>
              {profiles.map((p) => {
                const active = me ? isActiveProfile(p, me) : false;
                const fullName = `${p.firstName} ${p.lastName}`;
                return (
                  <Pressable
                    key={profileKey(p)}
                    onPress={() => void switchTo(p)}
                    disabled={loading || active}
                    accessibilityRole="button"
                    accessibilityLabel={`Basculer sur ${fullName}`}
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.row,
                      active && styles.rowActive,
                      pressed && !active && styles.rowPressed,
                    ]}
                  >
                    <Avatar profile={p} size={48} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {fullName}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {p.isPrimaryProfile
                          ? 'Profil principal'
                          : p.contactId && !p.memberId
                            ? 'Espace contact'
                            : 'Adhérent'}
                      </Text>
                    </View>
                    {active ? (
                      <View style={styles.activeBadge}>
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color="#ffffff"
                        />
                      </View>
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={palette.muted}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {loading ? (
              <ActivityIndicator
                style={styles.spinner}
                color={palette.primary}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Avatar circulaire — photo si dispo, sinon initiales sur fond coloré. */
function Avatar({
  profile,
  size,
}: {
  profile: ViewerProfile;
  size: number;
}) {
  const photoUrl = absolutizeMediaUrl(profile.photoUrl);
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#ffffff',
        }}
        accessibilityIgnoresInvertColors
      />
    );
  }
  const seed = profileKey(profile) || profile.firstName + profile.lastName;
  return (
    <View
      style={[
        styles.fallbackAvatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColor(seed),
        },
      ]}
    >
      <Text
        style={[
          styles.fallbackInitials,
          { fontSize: Math.round(size * 0.4) },
        ]}
      >
        {initialsOf(profile)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  label: {
    ...typography.eyebrow,
    color: palette.muted,
    marginBottom: spacing.sm,
  },
  labelOnDark: {
    color: 'rgba(255, 255, 255, 0.85)',
  },

  /* ─── Pill profil actif ─── */
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.lg,
  },
  activeChipOnDark: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  activeName: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  activeNameOnDark: {
    color: palette.ink,
  },
  activeHint: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 1,
  },
  activeHintOnDark: {
    color: palette.muted,
  },
  pressed: { opacity: 0.85 },

  /* ─── Avatar fallback ─── */
  fallbackAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackInitials: {
    color: '#ffffff',
    fontWeight: '700',
  },

  /* ─── Bottom sheet picker ─── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.h2,
    color: palette.ink,
  },
  sheetSubtitle: {
    ...typography.small,
    color: palette.muted,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  rowActive: {
    backgroundColor: palette.primaryLight,
    borderColor: palette.primary,
  },
  rowPressed: { opacity: 0.85 },
  rowName: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  rowSub: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },
  activeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: { marginTop: spacing.sm },
});
