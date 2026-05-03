import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { CLUB_VITRINE_PAGES } from '../../lib/documents/vitrine';
import type { VitrineStackParamList } from '../../navigation/types';

type Page = {
  id: string;
  slug: string;
  templateKey: string;
  status: 'DRAFT' | 'PUBLISHED';
  seoTitle: string | null;
  updatedAt: string;
};

type Data = { clubVitrinePages: Page[] };

type Nav = NativeStackNavigationProp<VitrineStackParamList, 'Pages'>;

const STATUS_BADGE = {
  DRAFT: { label: 'Brouillon', color: palette.warningText, bg: palette.warningBg },
  PUBLISHED: { label: 'Publiée', color: palette.successText, bg: palette.successBg },
} as const;

export function VitrinePagesScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refetch } = useQuery<Data>(CLUB_VITRINE_PAGES, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubVitrinePages ?? [];
    return list.map((p) => ({
      key: p.slug,
      title: p.seoTitle ?? p.slug,
      subtitle: `/${p.slug} · ${formatDateShort(p.updatedAt)}`,
      badge: STATUS_BADGE[p.status],
    }));
  }, [data]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="VITRINE"
        title="Pages"
        subtitle={`${data?.clubVitrinePages?.length ?? 0} pages`}
        showBack
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucune page"
        emptySubtitle="Les pages de votre vitrine apparaîtront ici."
        emptyIcon="document-text-outline"
        onPressRow={(slug) =>
          navigation.navigate('PageEditor', { slug })
        }
      />
    </ScreenContainer>
  );
}
