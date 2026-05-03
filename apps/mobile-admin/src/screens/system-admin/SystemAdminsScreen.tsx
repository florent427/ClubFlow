import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import {
  SYSTEM_ADMINS,
  SYSTEM_DEMOTE_ADMIN,
} from '../../lib/documents/system-admin';

type SystemRole = 'ADMIN' | 'SUPER_ADMIN';

type SystemUser = {
  id: string;
  email: string;
  displayName: string;
  systemRole: SystemRole | null;
};

type Data = { systemAdmins: SystemUser[] };

const ROLE_BADGE: Record<SystemRole, { label: string; color: string; bg: string }> = {
  SUPER_ADMIN: {
    label: 'SUPER ADMIN',
    color: palette.dangerText,
    bg: palette.dangerBg,
  },
  ADMIN: {
    label: 'ADMIN',
    color: palette.primary,
    bg: palette.primaryLight,
  },
};

export function SystemAdminsScreen() {
  const { data, loading, refetch } = useQuery<Data>(SYSTEM_ADMINS, {
    errorPolicy: 'all',
  });

  const [actionTarget, setActionTarget] = useState<SystemUser | null>(null);
  const [confirmDemote, setConfirmDemote] = useState<SystemUser | null>(null);

  const [demoteAdmin, demoteState] = useMutation(SYSTEM_DEMOTE_ADMIN, {
    refetchQueries: [{ query: SYSTEM_ADMINS }],
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.systemAdmins ?? [];
    return list.map((u) => ({
      key: u.id,
      title: u.displayName || u.email,
      subtitle: u.email,
      badge: u.systemRole ? ROLE_BADGE[u.systemRole] : null,
    }));
  }, [data]);

  const userById = (id: string) =>
    data?.systemAdmins?.find((u) => u.id === id) ?? null;

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="ADMIN"
        title="Administrateurs système"
        subtitle={`${data?.systemAdmins?.length ?? 0} compte${
          (data?.systemAdmins?.length ?? 0) > 1 ? 's' : ''
        }`}
        showBack
        compact
      />

      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun administrateur système"
        emptySubtitle="Les promotions sont gérées par les SUPER ADMIN."
        emptyIcon="person-circle-outline"
        onLongPressRow={(id) => {
          const u = userById(id);
          if (u) setActionTarget(u);
        }}
        onPressRow={() => {
          Alert.alert(
            'Promotion d\'utilisateur',
            'La promotion d\'un utilisateur lambda en administrateur système est disponible sur l\'admin web (recherche par e-mail).',
          );
        }}
      />

      <BottomActionBar
        visible={actionTarget != null}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.displayName || actionTarget?.email}
        actions={
          actionTarget?.systemRole === 'ADMIN'
            ? [
                {
                  key: 'demote',
                  label: 'Rétrograder',
                  icon: 'remove-circle-outline',
                  tone: 'danger',
                },
              ]
            : [
                {
                  key: 'super-info',
                  label: 'SUPER ADMIN — non rétrogradable',
                  icon: 'shield-outline',
                  disabled: true,
                },
              ]
        }
        onAction={(key) => {
          if (key === 'demote' && actionTarget) {
            setConfirmDemote(actionTarget);
          }
          setActionTarget(null);
        }}
      />

      <ConfirmSheet
        visible={confirmDemote != null}
        onCancel={() => setConfirmDemote(null)}
        onConfirm={async () => {
          if (!confirmDemote) return;
          try {
            await demoteAdmin({ variables: { userId: confirmDemote.id } });
            setConfirmDemote(null);
          } catch (e: any) {
            Alert.alert('Erreur', e?.message ?? 'Rétrogradation impossible.');
          }
        }}
        title="Rétrograder cet administrateur ?"
        message={
          confirmDemote
            ? `${confirmDemote.displayName || confirmDemote.email} perdra ses droits d'administration plate-forme.`
            : undefined
        }
        confirmLabel="Rétrograder"
        destructive
        loading={demoteState.loading}
      />
    </ScreenContainer>
  );
}
