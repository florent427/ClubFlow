import { EditableText } from '@/components/edit/EditableText';
import type { EditContext } from '@/lib/edit-context';

export interface PageHeroProps {
  label?: string;
  kanji?: string;
  title: string;
  titleEm?: string;
  subtitle?: string;
  __editSectionId?: string;
  __edit?: EditContext;
}

export function PageHero({
  label,
  kanji,
  title,
  titleEm,
  subtitle,
  __editSectionId,
  __edit,
}: PageHeroProps) {
  const sectionId = __editSectionId ?? '';
  const edit = __edit;
  return (
    <section className="page-hero">
      {kanji ? (
        <div className="page-hero__kanji">
          <EditableText sectionId={sectionId} field="kanji" value={kanji} edit={edit} />
        </div>
      ) : null}
      <div className="container">
        {label !== undefined ? (
          <EditableText
            as="div"
            className="page-hero__label"
            sectionId={sectionId}
            field="label"
            value={label}
            edit={edit}
          />
        ) : null}
        <h1 className="page-hero__title">
          {title ? (
            <>
              <EditableText
                sectionId={sectionId}
                field="title"
                value={title}
                edit={edit}
              />
              {/* Pas d'espace si le titre se termine par une apostrophe
                  (ex. "L'équipe."). Espace sinon. */}
              {title.endsWith("'") || title.endsWith('’') ? null : ' '}
            </>
          ) : null}
          {titleEm ? (
            <EditableText
              as="em"
              sectionId={sectionId}
              field="titleEm"
              value={titleEm}
              edit={edit}
            />
          ) : null}
        </h1>
        {subtitle !== undefined ? (
          <EditableText
            as="p"
            className="page-hero__sub"
            sectionId={sectionId}
            field="subtitle"
            value={subtitle}
            edit={edit}
          />
        ) : null}
      </div>
    </section>
  );
}
