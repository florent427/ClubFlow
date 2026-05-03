import { notFound } from 'next/navigation';
import { resolveCurrentClub } from '@/lib/club-resolution';
import { fetchVitrinePage } from '@/lib/vitrine-page';
import {
  fetchAnnouncements,
  fetchArticles,
  fetchGalleryPhotos,
} from '@/lib/page-fetchers';
import { getEditJwt, isEditModeActive } from '@/lib/edit-mode';
import type { EditContext } from '@/lib/edit-context';
import { VitrinePageRenderer } from './VitrinePageRenderer';
import { EditHistoryProvider } from './edit/EditHistoryProvider';
import { UndoRedoBar } from './edit/UndoRedoBar';
import { PublishPageButton } from './edit/PublishPageButton';

interface Props {
  slug:
    | 'index'
    | 'club'
    | 'cours'
    | 'dojo'
    | 'tarifs'
    | 'equipe'
    | 'galerie'
    | 'actualites'
    | 'competitions'
    | 'contact';
  include?: {
    articles?: boolean;
    announcements?: boolean;
    galleryPhotos?: boolean;
  };
}

export async function VitrinePageShell({ slug, include }: Props) {
  const club = await resolveCurrentClub();
  const page = await fetchVitrinePage(club.slug, slug);
  if (!page) {
    notFound();
  }

  const dynamicData: {
    articles?: Awaited<ReturnType<typeof fetchArticles>>;
    announcements?: Awaited<ReturnType<typeof fetchAnnouncements>>;
    galleryPhotos?: Awaited<ReturnType<typeof fetchGalleryPhotos>>;
  } = {};
  if (include?.articles) {
    dynamicData.articles = await fetchArticles(club.slug);
  }
  if (include?.announcements) {
    dynamicData.announcements = await fetchAnnouncements(club.slug);
  }
  if (include?.galleryPhotos) {
    dynamicData.galleryPhotos = await fetchGalleryPhotos(club.slug);
  }

  // Edit context — résolu côté serveur depuis le cookie admin.
  const editModeOn = await isEditModeActive();
  const editJwt = editModeOn ? await getEditJwt() : null;
  const apiUrl =
    process.env.VITRINE_PUBLIC_API_URL ??
    process.env.VITRINE_API_URL ??
    'http://localhost:3000/graphql';
  const edit: EditContext =
    editModeOn && editJwt
      ? {
          editMode: true,
          editJwt,
          pageId: page.id,
          apiUrl,
        }
      : { editMode: false };

  const renderer = (
    <VitrinePageRenderer
      sections={page.sections}
      clubSlug={club.slug}
      edit={edit}
      dynamicData={{
        articles: dynamicData.articles?.map((a) => ({
          slug: a.slug,
          title: a.title,
          excerpt: a.excerpt,
          coverImageUrl: a.coverImageUrl,
          publishedAt: a.publishedAt,
        })),
        announcements: dynamicData.announcements,
        galleryPhotos: dynamicData.galleryPhotos?.map((p) => ({
          id: p.id,
          imageUrl: p.imageUrl,
          caption: p.caption,
          category: p.category,
        })),
      }}
    />
  );

  if (edit.editMode) {
    return (
      <EditHistoryProvider edit={edit}>
        {renderer}
        <UndoRedoBar />
        <PublishPageButton
          edit={edit}
          pageStatus={page.status}
          pageSlug={page.slug}
        />
      </EditHistoryProvider>
    );
  }
  return renderer;
}
