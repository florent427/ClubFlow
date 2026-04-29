import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import {
  BottomActionBar,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatRelative,
  medicalCertState,
  memberDisplayName,
  memberInitials,
  palette,
  shadow,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { storage } from '../../lib/storage';
import {
  CLUB_MEMBER,
  CLUB_MEMBERS,
  DELETE_CLUB_MEMBER,
  SET_CLUB_MEMBER_STATUS,
  UPDATE_CLUB_MEMBER,
} from '../../lib/documents/members';
import type { MembersStackParamList } from '../../navigation/types';

type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

type MemberDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  pseudo: string | null;
  civility: string | null;
  phone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  birthDate: string | null;
  photoUrl: string | null;
  status: MemberStatus;
  medicalCertExpiresAt: string | null;
  telegramLinked: boolean;
  gradeLevel: { id: string; label: string } | null;
  family: { id: string; label: string | null } | null;
  customRoles: { id: string; label: string }[];
};

type Data = { clubMember: MemberDetail };

type Nav = NativeStackNavigationProp<MembersStackParamList, 'MemberDetail'>;
type Rt = RouteProp<MembersStackParamList, 'MemberDetail'>;

const STATUS_TONE: Record<MemberStatus, 'success' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  ARCHIVED: 'neutral',
};

const STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  ARCHIVED: 'Archivé',
};

function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';
}

export function MemberDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const memberId = route.params.memberId;

  const { data, loading, error, refetch } = useQuery<Data>(CLUB_MEMBER, {
    variables: { id: memberId },
    errorPolicy: 'all',
  });

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [setStatus, setStatusState] = useMutation(SET_CLUB_MEMBER_STATUS, {
    refetchQueries: [{ query: CLUB_MEMBERS }],
  });
  const [deleteMember, deleteState] = useMutation(DELETE_CLUB_MEMBER, {
    refetchQueries: [{ query: CLUB_MEMBERS }],
  });
  const [updateMember] = useMutation(UPDATE_CLUB_MEMBER);

  const handleArchive = () => {
    void setStatus({ variables: { id: memberId, status: 'ARCHIVED' } })
      .then(() => {
        setArchiveOpen(false);
        void refetch();
      })
      .catch(() => {
        setArchiveOpen(false);
      });
  };

  const handleDelete = () => {
    void deleteMember({ variables: { id: memberId } })
      .then(() => {
        setDeleteOpen(false);
        navigation.goBack();
      })
      .catch(() => {
        setDeleteOpen(false);
      });
  };

  const onPickPhoto = async (source: 'camera' | 'gallery') => {
    setPhotoSheet(false);

    // 1) Permissions
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Autorisation refusée',
        source === 'camera'
          ? 'Activez l\'accès à l\'appareil photo dans les réglages.'
          : 'Activez l\'accès à la galerie dans les réglages.',
      );
      return;
    }

    // 2) Sélection / capture
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    // 3) Upload + update
    setUploading(true);
    try {
      const token = await storage.getToken();
      const clubId = await storage.getClubId();
      if (!token || !clubId) {
        throw new Error('Session expirée. Reconnectez-vous.');
      }

      const form = new FormData();
      const fileName = asset.fileName ?? `member-${memberId}-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      form.append('file', {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);

      const url = `${getApiBaseUrl()}/media/upload?kind=image&ownerKind=MEMBER_PROFILE&ownerId=${encodeURIComponent(memberId)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `Upload échoué (HTTP ${res.status}). ${text.slice(0, 200)}`,
        );
      }
      const json = (await res.json()) as { id: string; publicUrl?: string };
      const photoUrl = json.publicUrl ?? `/media/${json.id}`;

      await updateMember({
        variables: {
          input: { id: memberId, photoUrl },
        },
      });
      await refetch();
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Téléversement impossible.',
      );
    } finally {
      setUploading(false);
    }
  };

  const onRemovePhoto = async () => {
    setPhotoSheet(false);
    setUploading(true);
    try {
      await updateMember({
        variables: { input: { id: memberId, photoUrl: null } },
      });
      await refetch();
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible de supprimer la photo.',
      );
    } finally {
      setUploading(false);
    }
  };

  if (loading && !data) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ADHÉRENT"
          title="Chargement…"
          showBack
          compact
        />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const member = data?.clubMember;
  if (!member) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ADHÉRENT"
          title="Introuvable"
          showBack
          compact
        />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert-circle-outline"
            title="Membre introuvable"
            description={
              error?.message ?? 'Ce membre a peut-être été supprimé.'
            }
          />
        </View>
      </ScreenContainer>
    );
  }

  const displayName = memberDisplayName(member);
  const initials = memberInitials(member);
  const cert = medicalCertState(member.medicalCertExpiresAt);
  const photoSrc = absolutizePhotoUrl(member.photoUrl);

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="ADHÉRENT"
        title={displayName}
        subtitle={member.email}
        showBack
      />

      {/* Avatar éditable + identité */}
      <View style={styles.avatarBlock}>
        <Pressable
          onPress={() => setPhotoSheet(true)}
          disabled={uploading}
          style={({ pressed }) => [
            styles.avatarPressable,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Modifier la photo de profil"
        >
          <View style={styles.avatar}>
            {photoSrc ? (
              <Image
                source={{ uri: photoSrc }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
            {uploading ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={palette.surface} />
              </View>
            ) : null}
          </View>
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={16} color={palette.surface} />
          </View>
        </Pressable>
        <View style={styles.statusRow}>
          <Pill
            label={STATUS_LABEL[member.status]}
            tone={STATUS_TONE[member.status]}
          />
          {member.telegramLinked ? (
            <Pill label="Telegram" tone="info" icon="paper-plane-outline" />
          ) : null}
        </View>
      </View>

      <View style={styles.content}>
        {/* Coordonnées */}
        <Card title="Coordonnées">
          <InfoLine label="Email" value={member.email} />
          <InfoLine label="Téléphone" value={member.phone ?? '—'} />
          {member.pseudo ? (
            <InfoLine label="Pseudo" value={member.pseudo} />
          ) : null}
          {member.addressLine || member.city ? (
            <InfoLine
              label="Adresse"
              value={[
                member.addressLine,
                [member.postalCode, member.city].filter(Boolean).join(' '),
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ) : null}
        </Card>

        {/* Profil sportif */}
        <Card title="Profil sportif">
          <InfoLine
            label="Grade"
            value={member.gradeLevel?.label ?? 'Non renseigné'}
          />
          {member.family ? (
            <View style={styles.row}>
              <Text style={styles.lineLabel}>Famille</Text>
              <Pill label={member.family.label ?? 'Foyer'} tone="primary" />
            </View>
          ) : null}
          <InfoLine
            label="Naissance"
            value={
              member.birthDate
                ? `${formatDateShort(member.birthDate)} (${formatRelative(member.birthDate)})`
                : 'Non renseignée'
            }
          />
          {member.customRoles.length > 0 ? (
            <View style={styles.row}>
              <Text style={styles.lineLabel}>Rôles</Text>
              <View style={styles.chips}>
                {member.customRoles.map((r) => (
                  <Pill key={r.id} label={r.label} tone="neutral" />
                ))}
              </View>
            </View>
          ) : null}
        </Card>

        {/* Médical */}
        <Card title="Suivi médical">
          <View style={styles.row}>
            <Text style={styles.lineLabel}>Certificat</Text>
            <Pill
              label={cert.label}
              tone={cert.ok ? 'success' : 'warning'}
              icon={cert.ok ? 'shield-checkmark-outline' : 'alert-outline'}
            />
          </View>
          {member.medicalCertExpiresAt ? (
            <InfoLine
              label="Expire le"
              value={formatDateShort(member.medicalCertExpiresAt)}
            />
          ) : null}
        </Card>

        {/* Actions */}
        <Card title="Actions">
          <View style={styles.actions}>
            {member.status !== 'ARCHIVED' ? (
              <Button
                label="Archiver le membre"
                icon="archive-outline"
                variant="secondary"
                onPress={() => setArchiveOpen(true)}
                fullWidth
              />
            ) : null}
            <Button
              label="Supprimer définitivement"
              icon="trash-outline"
              variant="danger"
              onPress={() => setDeleteOpen(true)}
              fullWidth
            />
          </View>
        </Card>
      </View>

      <BottomActionBar
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Photo de profil"
        actions={[
          {
            key: 'camera',
            label: 'Prendre une photo',
            icon: 'camera',
            tone: 'primary',
          },
          {
            key: 'gallery',
            label: 'Choisir depuis la galerie',
            icon: 'images-outline',
          },
          ...(member.photoUrl
            ? ([
                {
                  key: 'remove',
                  label: 'Supprimer la photo',
                  icon: 'trash-outline',
                  tone: 'danger',
                },
              ] as const)
            : []),
        ]}
        onAction={(key) => {
          if (key === 'camera') void onPickPhoto('camera');
          else if (key === 'gallery') void onPickPhoto('gallery');
          else if (key === 'remove') void onRemovePhoto();
        }}
      />

      <ConfirmSheet
        visible={archiveOpen}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
        title="Archiver ce membre ?"
        message={`${displayName} ne sera plus considéré comme adhérent actif. Cette action est réversible.`}
        confirmLabel="Archiver"
        loading={setStatusState.loading}
      />
      <ConfirmSheet
        visible={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer ce membre ?"
        message={`Toutes les données rattachées à ${displayName} seront définitivement perdues.`}
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading}
      />
    </ScreenContainer>
  );
}

/** Si l'API renvoie un chemin relatif (ex: /media/abc), on préfixe l'host. */
function absolutizePhotoUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${getApiBaseUrl()}${url.startsWith('/') ? url : `/${url}`}`;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    paddingVertical: spacing.huge,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.lg,
  },
  avatarBlock: {
    alignItems: 'center',
    marginTop: -spacing.xxl,
    gap: spacing.sm,
  },
  avatarPressable: {
    width: 96,
    height: 96,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: palette.surface,
    overflow: 'hidden',
    ...shadow.md,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    ...typography.displayLg,
    color: palette.surface,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: palette.surface,
    ...shadow.sm,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  lineLabel: {
    ...typography.small,
    color: palette.muted,
  },
  lineValue: {
    ...typography.bodyStrong,
    color: palette.ink,
    flexShrink: 1,
    textAlign: 'right',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    flex: 1,
    justifyContent: 'flex-end',
  },
  actions: {
    gap: spacing.sm,
  },
});
