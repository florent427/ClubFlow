import { useMutation, useQuery } from '@apollo/client/react';
import {
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
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_MEMBER,
  CLUB_MEMBERS,
  DELETE_CLUB_MEMBER,
  SET_CLUB_MEMBER_STATUS,
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

  const [setStatus, setStatusState] = useMutation(SET_CLUB_MEMBER_STATUS, {
    refetchQueries: [{ query: CLUB_MEMBERS }],
  });
  const [deleteMember, deleteState] = useMutation(DELETE_CLUB_MEMBER, {
    refetchQueries: [{ query: CLUB_MEMBERS }],
  });

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

      {/* Avatar + identité (chevauche le hero) */}
      <View style={styles.avatarBlock}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
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
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: palette.surface,
  },
  avatarText: {
    ...typography.h1,
    color: palette.surface,
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
