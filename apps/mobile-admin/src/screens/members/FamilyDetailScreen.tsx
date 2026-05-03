import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_FAMILIES,
  DELETE_CLUB_FAMILY,
} from '../../lib/documents/members';
import type { MembersStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MembersStackParamList, 'FamilyDetail'>;
type Rt = RouteProp<MembersStackParamList, 'FamilyDetail'>;

type FamilyLink = {
  id: string;
  memberId: string | null;
  contactId: string | null;
  linkRole: 'PAYER' | 'MEMBER' | 'CONTACT_PAYER' | string;
};

type Family = {
  id: string;
  label: string | null;
  householdGroupId: string | null;
  needsPayer: boolean;
  links: FamilyLink[];
};

type Data = { clubFamilies: Family[] };

export function FamilyDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const familyId = route.params.familyId;

  const { data, loading, error, refetch } = useQuery<Data>(CLUB_FAMILIES, {
    errorPolicy: 'all',
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFamily, deleteState] = useMutation(DELETE_CLUB_FAMILY, {
    refetchQueries: [{ query: CLUB_FAMILIES }],
  });

  const family = data?.clubFamilies?.find((f) => f.id === familyId) ?? null;

  const handleDelete = () => {
    void deleteFamily({ variables: { familyId } })
      .then(() => {
        setDeleteOpen(false);
        Alert.alert('Foyer supprimé', 'Le foyer a été supprimé.');
        navigation.goBack();
      })
      .catch((err: unknown) => {
        setDeleteOpen(false);
        Alert.alert(
          'Erreur',
          err instanceof Error ? err.message : 'Suppression impossible.',
        );
      });
  };

  if (loading && !data) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero eyebrow="FAMILLE" title="Chargement…" showBack compact />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!family) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero eyebrow="FAMILLE" title="Introuvable" showBack compact />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert-circle-outline"
            title="Foyer introuvable"
            description={
              error?.message ?? 'Ce foyer a peut-être été supprimé.'
            }
          />
        </View>
      </ScreenContainer>
    );
  }

  const payers = family.links.filter(
    (l) => l.linkRole === 'PAYER' || l.linkRole === 'CONTACT_PAYER',
  );
  const otherMembers = family.links.filter(
    (l) => l.linkRole !== 'PAYER' && l.linkRole !== 'CONTACT_PAYER',
  );

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="FAMILLE"
        title={family.label ?? 'Foyer'}
        subtitle={`${family.links.length} lien${family.links.length > 1 ? 's' : ''}`}
        showBack
      />

      <View style={styles.content}>
        <Card title="Informations">
          <View style={styles.row}>
            <Text style={styles.lineLabel}>Nom</Text>
            <Text style={styles.lineValue} numberOfLines={2}>
              {family.label ?? '—'}
            </Text>
          </View>
          {family.needsPayer ? (
            <View style={styles.row}>
              <Text style={styles.lineLabel}>Statut</Text>
              <Pill
                label="Payeur manquant"
                tone="warning"
                icon="alert-outline"
              />
            </View>
          ) : null}
        </Card>

        <Card title={`Payeur${payers.length > 1 ? 's' : ''}`}>
          {payers.length === 0 ? (
            <Text style={styles.emptyText}>Aucun payeur désigné.</Text>
          ) : (
            payers.map((p) => (
              <View key={p.id} style={styles.linkRow}>
                <Pill
                  label={p.linkRole === 'CONTACT_PAYER' ? 'Contact' : 'Membre'}
                  tone={p.linkRole === 'CONTACT_PAYER' ? 'info' : 'primary'}
                />
                <Text style={styles.linkValue} numberOfLines={1}>
                  {p.memberId
                    ? `Membre #${p.memberId.slice(0, 8)}`
                    : p.contactId
                      ? `Contact #${p.contactId.slice(0, 8)}`
                      : '—'}
                </Text>
              </View>
            ))
          )}
        </Card>

        <Card title="Membres rattachés">
          {otherMembers.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucun adhérent supplémentaire dans ce foyer.
            </Text>
          ) : (
            otherMembers.map((m) => (
              <View key={m.id} style={styles.linkRow}>
                <Pill label={m.linkRole} tone="neutral" />
                <Text style={styles.linkValue} numberOfLines={1}>
                  {m.memberId
                    ? `Membre #${m.memberId.slice(0, 8)}`
                    : m.contactId
                      ? `Contact #${m.contactId.slice(0, 8)}`
                      : '—'}
                </Text>
              </View>
            ))
          )}
        </Card>

        <Card title="Actions">
          <View style={styles.actions}>
            <Button
              label="Modifier (bientôt)"
              icon="create-outline"
              variant="secondary"
              onPress={() =>
                Alert.alert('Bientôt', 'L\'édition de foyer arrive bientôt.')
              }
              fullWidth
              disabled
            />
            <Button
              label="Supprimer le foyer"
              icon="trash-outline"
              variant="danger"
              onPress={() => setDeleteOpen(true)}
              fullWidth
            />
          </View>
        </Card>
      </View>

      <ConfirmSheet
        visible={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer ce foyer ?"
        message={`Le foyer « ${family.label ?? 'Foyer'} » sera dissous. Les adhérents resteront mais perdront leur rattachement familial.`}
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading}
      />
    </ScreenContainer>
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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkValue: {
    ...typography.body,
    color: palette.body,
    flex: 1,
  },
  emptyText: {
    ...typography.small,
    color: palette.muted,
    paddingVertical: spacing.sm,
  },
  actions: { gap: spacing.sm },
});
