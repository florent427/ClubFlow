import type { VitrineSection } from '@/lib/vitrine-page';
import type { EditContext } from '@/lib/edit-context';
import { HeroSection, type HeroSectionProps } from '@/blocks/HeroSection';
import { PageHero, type PageHeroProps } from '@/blocks/PageHero';
import {
  ManifestoSection,
  type ManifestoSectionProps,
} from '@/blocks/ManifestoSection';
import {
  CardsGridSection,
  type CardsGridSectionProps,
} from '@/blocks/CardsGridSection';
import {
  TwoColumnSection,
  type TwoColumnSectionProps,
} from '@/blocks/TwoColumnSection';
import { StatsSection, type StatsSectionProps } from '@/blocks/StatsSection';
import {
  TimelineSection,
  type TimelineSectionProps,
} from '@/blocks/TimelineSection';
import {
  CTABandSection,
  type CTABandSectionProps,
} from '@/blocks/CTABandSection';
import {
  RichTextSection,
  type RichTextSectionProps,
} from '@/blocks/RichTextSection';
import {
  PlanningSection,
  type PlanningSectionProps,
} from '@/blocks/PlanningSection';
import {
  GallerySection,
  type GallerySectionProps,
} from '@/blocks/GallerySection';
import {
  ContactSection,
  type ContactSectionProps,
} from '@/blocks/ContactSection';
import {
  FeaturedArticlesSection,
  type FeaturedArticlesSectionProps,
} from '@/blocks/FeaturedArticlesSection';
import {
  AnnouncementsSection,
  type AnnouncementsSectionProps,
} from '@/blocks/AnnouncementsSection';
import {
  SksrHero,
  SksrManifesto,
  SksrVoie,
  SksrCoursPreview,
  SksrDojoSplit,
  SksrActuPreview,
  SksrCtaBand,
  SksrTimeline,
  SksrTwoCol,
  SksrStatsBand,
  SksrValues,
} from '@/blocks/sksr';
import {
  SksrPlanning,
  SksrDisciplines,
  SksrDojoIntro,
  SksrSpec,
  SksrEquipment,
  SksrEtiquette,
  SksrTarifs,
  SksrInfoBand,
  SksrInscription,
  SksrSensei,
  SksrTeachers,
  SksrLineage,
  SksrGallery,
  SksrNews,
  SksrCalendar,
  SksrPalmares,
  SksrResults,
  SksrChampsBand,
  SksrContact,
  SksrMap,
} from '@/blocks/sksr-pages';

interface Props {
  sections: VitrineSection[];
  clubSlug: string;
  dynamicData?: {
    articles?: FeaturedArticlesSectionProps['articles'];
    announcements?: AnnouncementsSectionProps['items'];
    galleryPhotos?: GallerySectionProps['photos'];
  };
  edit?: EditContext;
}

export function VitrinePageRenderer({
  sections,
  clubSlug,
  dynamicData,
  edit,
}: Props) {
  return (
    <>
      {sections.map((section) => {
        const { id, type, props } = section;
        const editProps = { __editSectionId: id, __edit: edit };
        switch (type) {
          case 'hero':
            return (
              <HeroSection
                key={id}
                {...(props as unknown as HeroSectionProps)}
                {...editProps}
              />
            );
          case 'pageHero':
            return (
              <PageHero
                key={id}
                {...(props as unknown as PageHeroProps)}
                {...editProps}
              />
            );
          case 'manifesto':
            return (
              <ManifestoSection
                key={id}
                {...(props as unknown as ManifestoSectionProps)}
                {...editProps}
              />
            );
          case 'cardsGrid':
            return (
              <CardsGridSection
                key={id}
                {...(props as unknown as CardsGridSectionProps)}
                {...editProps}
              />
            );
          case 'twoColumn':
            return (
              <TwoColumnSection
                key={id}
                {...(props as unknown as TwoColumnSectionProps)}
                {...editProps}
              />
            );
          case 'stats':
            return (
              <StatsSection
                key={id}
                {...(props as unknown as StatsSectionProps)}
                {...editProps}
              />
            );
          case 'timeline':
            return (
              <TimelineSection
                key={id}
                {...(props as unknown as TimelineSectionProps)}
                {...editProps}
              />
            );
          case 'ctaBand':
            return (
              <CTABandSection
                key={id}
                {...(props as unknown as CTABandSectionProps)}
                {...editProps}
              />
            );
          case 'richText':
            return (
              <RichTextSection
                key={id}
                {...(props as unknown as RichTextSectionProps)}
                {...editProps}
              />
            );
          case 'planning':
            return (
              <PlanningSection
                key={id}
                {...(props as unknown as PlanningSectionProps)}
                {...editProps}
              />
            );
          case 'gallery': {
            const baseProps = props as unknown as GallerySectionProps;
            return (
              <GallerySection
                key={id}
                {...baseProps}
                photos={dynamicData?.galleryPhotos?.length ? dynamicData.galleryPhotos : baseProps.photos}
                {...editProps}
              />
            );
          }
          case 'contact':
            return (
              <ContactSection
                key={id}
                {...(props as unknown as Omit<ContactSectionProps, 'clubSlug'>)}
                clubSlug={clubSlug}
                {...editProps}
              />
            );
          case 'featuredArticles': {
            const baseProps =
              props as unknown as FeaturedArticlesSectionProps;
            return (
              <FeaturedArticlesSection
                key={id}
                {...baseProps}
                articles={dynamicData?.articles?.length ? dynamicData.articles : baseProps.articles}
                {...editProps}
              />
            );
          }
          case 'announcements': {
            const baseProps = props as unknown as AnnouncementsSectionProps;
            return (
              <AnnouncementsSection
                key={id}
                {...baseProps}
                items={dynamicData?.announcements ?? baseProps.items}
                {...editProps}
              />
            );
          }
          // ==========================================================
          // SKSR blocks — design fidèle au template dojo d'origine
          // ==========================================================
          case 'sksrHero':
            return <SksrHero key={id} {...(props as any)} {...editProps} />;
          case 'sksrManifesto':
            return <SksrManifesto key={id} {...(props as any)} {...editProps} />;
          case 'sksrVoie':
            return <SksrVoie key={id} {...(props as any)} {...editProps} />;
          case 'sksrCoursPreview':
            return <SksrCoursPreview key={id} {...(props as any)} {...editProps} />;
          case 'sksrDojoSplit':
            return <SksrDojoSplit key={id} {...(props as any)} {...editProps} />;
          case 'sksrActuPreview': {
            const baseProps = props as any;
            return (
              <SksrActuPreview
                key={id}
                {...baseProps}
                articles={dynamicData?.articles?.length ? dynamicData.articles : baseProps.articles}
                {...editProps}
              />
            );
          }
          case 'sksrCtaBand':
            return <SksrCtaBand key={id} {...(props as any)} {...editProps} />;
          case 'sksrTimeline':
            return <SksrTimeline key={id} {...(props as any)} {...editProps} />;
          case 'sksrTwoCol':
            return <SksrTwoCol key={id} {...(props as any)} {...editProps} />;
          case 'sksrStatsBand':
            return <SksrStatsBand key={id} {...(props as any)} {...editProps} />;
          case 'sksrValues':
            return <SksrValues key={id} {...(props as any)} {...editProps} />;
          case 'sksrPlanning':
            return <SksrPlanning key={id} {...(props as any)} {...editProps} />;
          case 'sksrDisciplines':
            return <SksrDisciplines key={id} {...(props as any)} {...editProps} />;
          case 'sksrDojoIntro':
            return <SksrDojoIntro key={id} {...(props as any)} {...editProps} />;
          case 'sksrSpec':
            return <SksrSpec key={id} {...(props as any)} {...editProps} />;
          case 'sksrEquipment':
            return <SksrEquipment key={id} {...(props as any)} {...editProps} />;
          case 'sksrEtiquette':
            return <SksrEtiquette key={id} {...(props as any)} {...editProps} />;
          case 'sksrTarifs':
            return <SksrTarifs key={id} {...(props as any)} {...editProps} />;
          case 'sksrInfoBand':
            return <SksrInfoBand key={id} {...(props as any)} {...editProps} />;
          case 'sksrInscription':
            return <SksrInscription key={id} {...(props as any)} {...editProps} />;
          case 'sksrSensei':
            return <SksrSensei key={id} {...(props as any)} {...editProps} />;
          case 'sksrTeachers':
            return <SksrTeachers key={id} {...(props as any)} {...editProps} />;
          case 'sksrLineage':
            return <SksrLineage key={id} {...(props as any)} {...editProps} />;
          case 'sksrGallery': {
            const baseProps = props as any;
            return (
              <SksrGallery
                key={id}
                {...baseProps}
                photos={dynamicData?.galleryPhotos?.length ? dynamicData.galleryPhotos : baseProps.photos}
                {...editProps}
              />
            );
          }
          case 'sksrNews': {
            const baseProps = props as any;
            return (
              <SksrNews
                key={id}
                {...baseProps}
                articles={dynamicData?.articles?.length ? dynamicData.articles : baseProps.articles}
                {...editProps}
              />
            );
          }
          case 'sksrCalendar':
            return <SksrCalendar key={id} {...(props as any)} {...editProps} />;
          case 'sksrPalmares':
            return <SksrPalmares key={id} {...(props as any)} {...editProps} />;
          case 'sksrResults':
            return <SksrResults key={id} {...(props as any)} {...editProps} />;
          case 'sksrChampsBand':
            return <SksrChampsBand key={id} {...(props as any)} {...editProps} />;
          case 'sksrContact':
            return (
              <SksrContact
                key={id}
                {...(props as any)}
                clubSlug={clubSlug}
                {...editProps}
              />
            );
          case 'sksrMap':
            return <SksrMap key={id} {...(props as any)} {...editProps} />;

          default:
            return (
              <div
                key={id}
                style={{
                  padding: '1rem 2rem',
                  color: 'var(--muted)',
                  fontSize: 12,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}
              >
                [Bloc non reconnu : {type}]
              </div>
            );
        }
      })}
    </>
  );
}
