import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo } from 'react';
import { CLUB_VITRINE_CATEGORIES } from '../../lib/documents/vitrine';

type Category = {
  id: string;
  name: string;
  slug: string;
  articleCount: number;
};

type Data = { clubVitrineCategories: Category[] };

export function VitrineCategoriesScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_VITRINE_CATEGORIES, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubVitrineCategories ?? [];
    return list.map((c) => ({
      key: c.id,
      title: c.name,
      subtitle: `/${c.slug}`,
      badge: {
        label: `${c.articleCount} article${c.articleCount > 1 ? 's' : ''}`,
        color: palette.primary,
        bg: palette.primaryLight,
      },
    }));
  }, [data]);

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="VITRINE"
        title="Catégories"
        subtitle={`${data?.clubVitrineCategories?.length ?? 0} catégories`}
        showBack
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucune catégorie"
        emptySubtitle="Créez une catégorie pour ranger vos articles."
        emptyIcon="folder-outline"
      />
    </ScreenContainer>
  );
}
