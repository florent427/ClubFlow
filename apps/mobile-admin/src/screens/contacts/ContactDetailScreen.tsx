import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  memberInitials,
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
  CLUB_CONTACTS,
  DELETE_CLUB_CONTACT,
  PROMOTE_CONTACT_TO_MEMBER,
} from '../../lib/documents/contacts';
import type { MembersStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MembersStackParamList, 'ContactDetail'>;
type Rt = RouteProp<MembersStackParamList, 'ContactDetail'>;

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  linkedMemberId: string | null;
  canDeleteContact: boolean;
};

type Data = { clubContacts: Contact[] };

export function ContactDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const contactId = route.params.contactId;

  const { data, loading, error, refetch } = useQuery<Data>(CLUB_CONTACTS, {
    errorPolicy: 'all',
  });

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [promote, promoteState] = useMutation(PROMOTE_CONTACT_TO_MEMBER, {
    refetchQueries: [{ query: CLUB_CONTACTS }],
  });
  const [deleteContact, deleteState] = useMutation(DELETE_CLUB_CONTACT, {
    refetchQueries: [{ query: CLUB_CONTACTS }],
  });

  const contact = data?.clubContacts?.find((c) => c.id === contactId) ?? null;

  const handlePromote = () => {
    void promote({ variables: { id: contactId } })
      .then(() => {
        setPromoteOpen(false);
        Alert.alert(
          'Contact promu',
          'Le contact a été promu en adhérent.',
        );
        navigation.goBack();
      })
      .catch((err: unknown) => {
        setPromoteOpen(false);
        Alert.alert(
          'Erreur',
          err instanceof Error ? err.message : 'Promotion impossible.',
        );
      });
  };

  const handleDelete = () => {
    void deleteContact({ variables: { id: contactId } })
      .then(() => {
        setDeleteOpen(false);
        Alert.alert('Contact supprimé', 'Le contact a été supprimé.');
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
        <ScreenHero eyebrow="CONTACT" title="Chargement…" showBack compact />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!contact) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero eyebrow="CONTACT" title="Introuvable" showBack compact />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert-circle-outline"
            title="Contact introuvable"
            description={
              error?.message ?? 'Ce contact a peut-être été supprimé.'
            }
          />
        </View>
      </ScreenContainer>
    );
  }

  const fullName =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    'Sans nom';
  const initials = memberInitials(contact);

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="CONTACT"
        title={fullName}
        subtitle={contact.email}
        showBack
      />

      <View style={styles.avatarBlock}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.statusRow}>
          {contact.emailVerified ? (
            <Pill
              label="Vérifié"
              tone="success"
              icon="shield-checkmark-outline"
            />
          ) : (
            <Pill label="Non vérifié" tone="warning" icon="alert-outline" />
          )}
          {contact.linkedMemberId ? (
            <Pill
              label={`Lié au membre #${contact.linkedMemberId.slice(0, 8)}`}
              tone="primary"
              icon="link-outline"
            />
          ) : null}
        </View>
      </View>

      <View style={styles.content}>
        <Card title="Coordonnées">
          <View style={styles.row}>
            <Text style={styles.lineLabel}>Prénom</Text>
            <Text style={styles.lineValue}>{contact.firstName || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.lineLabel}>Nom</Text>
            <Text style={styles.lineValue}>{contact.lastName || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.lineLabel}>Email</Text>
            <Text style={styles.lineValue} numberOfLines={1}>
              {contact.email}
            </Text>
          </View>
        </Card>

        <Card title="Actions">
          <View style={styles.actions}>
            {!contact.linkedMemberId ? (
              <Button
                label="Promouvoir en adhérent"
                icon="person-add-outline"
                variant="primary"
                onPress={() => setPromoteOpen(true)}
                fullWidth
              />
            ) : null}
            {contact.canDeleteContact ? (
              <Button
                label="Supprimer le contact"
                icon="trash-outline"
                variant="danger"
                onPress={() => setDeleteOpen(true)}
                fullWidth
              />
            ) : null}
            {contact.linkedMemberId && !contact.canDeleteContact ? (
              <Text style={styles.helpText}>
                Ce contact est lié à un adhérent et ne peut pas être supprimé
                directement.
              </Text>
            ) : null}
          </View>
        </Card>
      </View>

      <ConfirmSheet
        visible={promoteOpen}
        onCancel={() => setPromoteOpen(false)}
        onConfirm={handlePromote}
        title="Promouvoir en adhérent ?"
        message={`${fullName} sera converti en fiche adhérent du club.`}
        confirmLabel="Promouvoir"
        loading={promoteState.loading}
      />
      <ConfirmSheet
        visible={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer ce contact ?"
        message={`Le contact ${fullName} sera définitivement supprimé.`}
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
  avatarBlock: {
    alignItems: 'center',
    marginTop: -spacing.xxl,
    gap: spacing.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: palette.muted,
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
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
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
  actions: { gap: spacing.sm },
  helpText: {
    ...typography.small,
    color: palette.muted,
    paddingTop: spacing.sm,
  },
});
