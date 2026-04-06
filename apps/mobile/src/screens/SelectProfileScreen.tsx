import { useMutation, useQuery } from '@apollo/client/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SelectProfile'>;

function profileRowKey(p: ViewerProfile): string {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return '';
}

function profileBadge(p: ViewerProfile): string | null {
  if (p.contactId && !p.memberId) return 'Espace Contact';
  if (p.isPrimaryProfile) return 'Responsable facturation';
  return null;
}

function profileSubline(p: ViewerProfile): string | null {
  if (p.contactId && !p.memberId) return 'Accès facturation uniquement';
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

function formatProfileQueryError(err: { message: string }): string {
  return err.message;
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
      if (!newTok) {
        return;
      }
      await storage.setMemberSession(newTok, p.clubId);
    } else if (p.contactId) {
      const { data: sel } = await selectContactProfile({
        variables: { contactId: p.contactId },
      });
      const newTok = sel?.selectActiveViewerContactProfile?.accessToken;
      if (!newTok) {
        return;
      }
      await storage.setMemberSession(newTok, p.clubId);
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
  }, [loading, profiles]);

  if (token === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error && isUnauthorized(error)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>Session invalide ou expirée. Retour à la connexion…</Text>
      </View>
    );
  }

  const errMsg = error ? formatProfileQueryError(error) : null;

  if (!loading && profiles.length === 1 && !errMsg) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Connexion en cours…</Text>
        <Text style={styles.hint}>Redirection automatique.</Text>
        <ActivityIndicator style={styles.spinner} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Choisir un profil</Text>
      <Text style={styles.subtitle}>
        Plusieurs espaces sont liés à votre compte. Sélectionnez celui avec
        lequel vous souhaitez naviguer.
      </Text>
      {loading ? <Text style={styles.hint}>Chargement des profils…</Text> : null}
      {errMsg ? <Text style={styles.error}>{errMsg}</Text> : null}
      {!loading && profiles.length === 0 && !errMsg ? (
        <Text style={styles.error}>Aucun profil disponible.</Text>
      ) : null}
      {profiles.map((p) => {
        const badge = profileBadge(p);
        const subline = profileSubline(p);
        return (
          <View key={profileRowKey(p)} style={styles.card}>
            <Text style={styles.name}>
              {p.firstName} {p.lastName}
            </Text>
            {badge ? <Text style={styles.badge}>{badge}</Text> : null}
            {subline ? <Text style={styles.subline}>{subline}</Text> : null}
            <Button
              title="Utiliser ce profil"
              onPress={() => void pick(p)}
              disabled={selecting}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  container: {
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 16,
  },
  hint: {
    marginBottom: 8,
    color: '#555',
  },
  error: {
    color: '#b00020',
    marginBottom: 8,
  },
  spinner: {
    marginTop: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  badge: {
    fontSize: 13,
    color: '#1565c0',
    marginBottom: 4,
  },
  subline: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
});
