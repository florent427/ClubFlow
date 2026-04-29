import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo } from 'react';
import { CLUB_MEMBER_FIELD_LAYOUT } from '../../lib/documents/settings';

type CatalogField = {
  id: string;
  fieldKey: string;
  showOnForm: boolean;
  required: boolean;
  sortOrder: number;
};

type CustomField = {
  id: string;
  code: string;
  label: string;
  type: string;
  required: boolean;
  sortOrder: number;
  visibleToMember: boolean;
};

type Layout = {
  catalogSettings: CatalogField[];
  customFieldDefinitions: CustomField[];
};

type Data = { clubMemberFieldLayout: Layout | null };

const FIELD_KEY_LABELS: Record<string, string> = {
  FIRST_NAME: 'Prénom',
  LAST_NAME: 'Nom',
  PSEUDO: 'Pseudo',
  EMAIL: 'Email',
  PHONE: 'Téléphone',
  BIRTHDATE: 'Date de naissance',
  GENDER: 'Genre',
  ADDRESS_LINE: 'Adresse',
  POSTAL_CODE: 'Code postal',
  CITY: 'Ville',
  COUNTRY: 'Pays',
  CIVILITY: 'Civilité',
  GRADE_LEVEL: 'Grade',
  MEDICAL_CERT_EXPIRES_AT: 'Certificat médical',
  PHOTO: 'Photo',
};

export function MemberFieldsScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_MEMBER_FIELD_LAYOUT, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const layout = data?.clubMemberFieldLayout;
    if (!layout) return [];
    const out: DataTableRow[] = [];

    const catalog = [...(layout.catalogSettings ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (const f of catalog) {
      out.push({
        key: `cat-${f.id}`,
        title: FIELD_KEY_LABELS[f.fieldKey] ?? f.fieldKey,
        subtitle: `${f.fieldKey}${f.required ? ' · obligatoire' : ''}`,
        badge: f.showOnForm
          ? {
              label: 'Visible',
              color: palette.successText,
              bg: palette.successBg,
            }
          : { label: 'Masqué', color: palette.muted, bg: palette.bgAlt },
      });
    }

    const custom = [...(layout.customFieldDefinitions ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (const f of custom) {
      out.push({
        key: `custom-${f.id}`,
        title: f.label,
        subtitle: `${f.type}${f.required ? ' · obligatoire' : ''}${f.visibleToMember ? ' · visible adhérent' : ''}`,
        badge: {
          label: 'Personnalisé',
          color: palette.primary,
          bg: palette.primaryLight,
        },
      });
    }

    return out;
  }, [data]);

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="RÉGLAGES"
        title="Champs adhérents"
        subtitle="Formulaire d'inscription"
        showBack
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun champ"
        emptySubtitle="Configurez les champs visibles sur les fiches adhérents."
        emptyIcon="list-outline"
      />
    </ScreenContainer>
  );
}
