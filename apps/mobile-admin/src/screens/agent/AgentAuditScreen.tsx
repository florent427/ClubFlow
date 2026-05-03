import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  formatDateTime,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo } from 'react';
import { AGENT_AUDIT_LOG } from '../../lib/documents/agent';

type AuditEntry = {
  id: string;
  createdAt: string;
  toolName: string;
  status: string;
  riskLevel: string;
  errorMessage: string | null;
};

type Data = { agentAuditLog: AuditEntry[] };

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  SUCCESS: { label: 'Succès', color: palette.successText, bg: palette.successBg },
  FAILED: { label: 'Échec', color: palette.dangerText, bg: palette.dangerBg },
  PENDING: { label: 'En attente', color: palette.warningText, bg: palette.warningBg },
  REJECTED: { label: 'Refusé', color: palette.muted, bg: palette.bgAlt },
  CONFIRMED: { label: 'Confirmé', color: palette.successText, bg: palette.successBg },
};

export function AgentAuditScreen() {
  const { data, loading, refetch } = useQuery<Data>(AGENT_AUDIT_LOG, {
    variables: { limit: 100 },
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.agentAuditLog ?? [];
    return list.map((entry) => {
      const badge =
        STATUS_BADGE[entry.status] ?? {
          label: entry.status,
          color: palette.muted,
          bg: palette.bgAlt,
        };
      return {
        key: entry.id,
        title: entry.toolName,
        subtitle: `${formatDateTime(entry.createdAt)}${entry.errorMessage ? ` · ${entry.errorMessage}` : ''}`,
        badge,
      };
    });
  }, [data]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="AUDIT"
        title="Journal de l'agent"
        subtitle="Actions exécutées par Aïko"
        showBack
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucune action enregistrée"
        emptySubtitle="Le journal d'audit s'enrichira au fil des interactions avec l'agent."
        emptyIcon="shield-checkmark-outline"
      />
    </ScreenContainer>
  );
}
