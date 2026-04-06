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
import type { RootStackParamList } from '../types/navigation';

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

export function MemberProfileSwitcher() {
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
      <Text style={styles.label}>Profil actif</Text>
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
                active && styles.chipOn,
                pressed && styles.pressed,
              ]}
              onPress={() => void switchTo(p)}
              disabled={loading || active}
            >
              <Text style={[styles.chipText, active && styles.chipTextOn]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {loading ? (
        <ActivityIndicator style={styles.spin} size="small" color="#1565c0" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  chipOn: {
    borderColor: '#1565c0',
    backgroundColor: '#e3f2fd',
  },
  chipText: { fontSize: 14, color: '#333' },
  chipTextOn: { fontWeight: '700', color: '#0d47a1' },
  pressed: { opacity: 0.8 },
  spin: { marginTop: 8 },
});
