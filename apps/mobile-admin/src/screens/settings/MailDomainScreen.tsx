import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo } from 'react';
import { CLUB_SENDING_DOMAINS } from '../../lib/documents/settings';

type VerifStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'PARTIAL'
  | 'FAILED'
  | 'UNKNOWN';

type Domain = {
  id: string;
  fqdn: string;
  purpose: string;
  verificationStatus: VerifStatus;
};

type Data = { clubSendingDomains: Domain[] };

const STATUS_BADGE: Record<
  VerifStatus,
  { label: string; color: string; bg: string }
> = {
  VERIFIED: {
    label: 'Vérifié',
    color: palette.successText,
    bg: palette.successBg,
  },
  PENDING: {
    label: 'En attente',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  PARTIAL: {
    label: 'Partiel',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  FAILED: {
    label: 'Échec',
    color: palette.dangerText,
    bg: palette.dangerBg,
  },
  UNKNOWN: { label: 'Inconnu', color: palette.muted, bg: palette.bgAlt },
};

const PURPOSE_LABELS: Record<string, string> = {
  TRANSACTIONAL: 'Transactionnel',
  MARKETING: 'Marketing',
  ALL: 'Tous emails',
};

export function MailDomainScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_SENDING_DOMAINS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubSendingDomains ?? [];
    return list.map((d) => ({
      key: d.id,
      title: d.fqdn,
      subtitle: PURPOSE_LABELS[d.purpose] ?? d.purpose,
      badge:
        STATUS_BADGE[d.verificationStatus] ?? STATUS_BADGE.UNKNOWN,
    }));
  }, [data]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="RÉGLAGES"
        title="Email"
        subtitle="Domaines d'envoi"
        showBack
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun domaine"
        emptySubtitle="Ajoutez un domaine d'envoi pour vos emails transactionnels."
        emptyIcon="mail-outline"
      />
    </ScreenContainer>
  );
}
