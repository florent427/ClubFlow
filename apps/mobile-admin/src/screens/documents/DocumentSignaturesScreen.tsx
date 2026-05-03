import { useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  absolutizeMediaUrl,
  formatDateTime,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import {
  CLUB_DOCUMENT,
  CLUB_DOCUMENT_SIGNATURES,
} from '../../lib/documents/documents';
import type { DocumentsStackParamList } from '../../navigation/types';

type Signature = {
  id: string;
  version: number;
  userId: string;
  memberId: string | null;
  signedAssetUrl: string | null;
  signedSha256: string;
  ipAddress: string | null;
  userAgent: string | null;
  signerDisplayName: string | null;
  signedAt: string;
  invalidatedAt: string | null;
};

type SignaturesData = { clubDocumentSignatures: Signature[] };
type DocData = {
  clubDocument: {
    id: string;
    name: string;
    version: number;
  } | null;
};

type Route = RouteProp<DocumentsStackParamList, 'DocumentSignatures'>;

const STATUS_BADGE: Record<
  'valid' | 'invalid',
  { label: string; color: string; bg: string }
> = {
  valid: {
    label: 'Valide',
    color: palette.successText,
    bg: palette.successBg,
  },
  invalid: {
    label: 'Obsolète',
    color: palette.muted,
    bg: palette.bgAlt,
  },
};

export function DocumentSignaturesScreen() {
  const route = useRoute<Route>();
  const { documentId } = route.params;
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const {
    data,
    loading,
    refetch,
  } = useQuery<SignaturesData>(CLUB_DOCUMENT_SIGNATURES, {
    variables: { documentId },
    errorPolicy: 'all',
  });
  const { data: docData } = useQuery<DocData>(CLUB_DOCUMENT, {
    variables: { id: documentId },
    errorPolicy: 'all',
  });

  const signatures = data?.clubDocumentSignatures ?? [];
  const doc = docData?.clubDocument ?? null;

  const filtered = useMemo(() => {
    if (statusFilter === 'valid')
      return signatures.filter((s) => s.invalidatedAt == null);
    if (statusFilter === 'invalid')
      return signatures.filter((s) => s.invalidatedAt != null);
    return signatures;
  }, [signatures, statusFilter]);

  const rows = useMemo<DataTableRow[]>(() => {
    return filtered.map((s) => {
      const isValid = s.invalidatedAt == null;
      const baseSubtitle = `v${s.version} · ${formatDateTime(s.signedAt)}`;
      return {
        key: s.id,
        title:
          s.signerDisplayName ?? `Utilisateur ${s.userId.slice(0, 8)}`,
        subtitle: isValid ? baseSubtitle : `${baseSubtitle} · Obsolète`,
        badge: isValid ? STATUS_BADGE.valid : STATUS_BADGE.invalid,
        trailing: (
          <Ionicons
            name="download-outline"
            size={20}
            color={palette.mutedSoft}
          />
        ),
      };
    });
  }, [filtered]);

  const handleOpenSigned = async (id: string) => {
    const sig = signatures.find((s) => s.id === id);
    if (!sig) return;
    // Réécrit `localhost` → IP LAN via EXPO_PUBLIC_API_BASE pour le
    // téléphone (cf. helper absolutizeMediaUrl).
    const resolved = absolutizeMediaUrl(sig.signedAssetUrl);
    if (!resolved) {
      Alert.alert('Indisponible', 'L\'URL du PDF signé est introuvable.');
      return;
    }
    try {
      await Linking.openURL(resolved);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le PDF signé.');
    }
  };

  return (
    <ScreenContainer scroll={false} padding={0}>
      <ScreenHero
        eyebrow="SIGNATURES"
        title={doc ? doc.name : 'Signatures'}
        subtitle={
          doc
            ? `v${doc.version} · ${signatures.length} signature${
                signatures.length > 1 ? 's' : ''
              }`
            : undefined
        }
        compact
        showBack
      />
      <FilterChipBar
        chips={[
          { key: 'valid', label: 'Valides' },
          { key: 'invalid', label: 'Obsolètes' },
        ]}
        activeKey={statusFilter}
        onSelect={setStatusFilter}
        allLabel="Toutes"
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucune signature pour l'instant"
        emptySubtitle="Les signatures apparaîtront ici dès qu'un membre aura signé."
        emptyIcon="create-outline"
        onPressRow={(id) => void handleOpenSigned(id)}
      />
    </ScreenContainer>
  );
}
