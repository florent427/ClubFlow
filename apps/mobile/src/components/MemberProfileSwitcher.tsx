import { useMutation, useQuery } from '@apollo/client/react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import * as storage from '../lib/storage';
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

export function MemberProfileSwitcher({ onDark = false }: Props = {}) {
  const navigation = useNavigation();
  const rootNav =
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>() ??
    navigation;
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const { data: profData } = useQuery<ViewerProfilesQueryData>(VIEWER_PROFILES, {
    fetchPolicy: 'cache-first',
  });

  const [selectMember, { loading: loadingM }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);
  const [selectContact, { loading: loadingC }] =
    useMutation<SelectContactProfileData>(SELECT_VIEWER_CONTACT_PROFILE);

  const loading = loadingM || loadingC;
  const me = meData?.viewerMe;
  const profiles = profData?.viewerProfiles ?? [];

  async function switchTo(p: ViewerProfile) {
    if (me && isActiveProfile(p, me)) return;
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {profiles.map((p) => {
          const active = me ? isActiveProfile(p, me) : false;
          const label = `${p.firstName} ${p.lastName}`;
          return (
            <Pressable
              key={profileKey(p)}
              style={({ pressed }) => [
                styles.chip,
                onDark && styles.chipOnDark,
                active && (onDark ? styles.chipOnDarkActive : styles.chipOn),
                pressed && styles.pressed,
              ]}
              onPress={() => void switchTo(p)}
              disabled={loading || active}
              accessibilityRole="button"
              accessibilityLabel={`Basculer sur ${label}`}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.chipText,
                  onDark && styles.chipTextOnDark,
                  active && (onDark ? styles.chipTextOnDarkActive : styles.chipTextOn),
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {loading ? (
        <ActivityIndicator
          style={styles.spin}
          size="small"
          color={onDark ? '#ffffff' : palette.primary}
        />
      ) : null}
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
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.lg,
  },
  chip: {
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.surface,
    minHeight: 36,
    maxWidth: 180,
  },
  chipOnDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  chipOn: {
    borderColor: palette.primary,
    backgroundColor: palette.primaryLight,
  },
  chipOnDarkActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  chipText: { ...typography.smallStrong, color: palette.body },
  chipTextOnDark: { color: '#ffffff' },
  chipTextOn: { color: palette.primaryDark },
  chipTextOnDarkActive: { color: palette.primary },
  pressed: { opacity: 0.8 },
  spin: { marginTop: spacing.sm },
});
