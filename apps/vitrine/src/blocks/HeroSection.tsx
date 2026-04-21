import { EditableText } from '@/components/edit/EditableText';
import { EditableImage } from '@/components/edit/EditableImage';
import { EditableList } from '@/components/edit/EditableList';
import { EditableCta } from '@/components/edit/EditableCta';
import type { EditContext } from '@/lib/edit-context';
import styles from './HeroSection.module.css';

export interface HeroSectionProps {
  eyebrow?: string;
  kanji?: string;
  title: string;
  titleEm?: string;
  subtitle?: string;
  backgroundImageUrl?: string | null;
  ctaPrimary?: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
  metaItems?: Array<{ label: string; value: string }>;
  __editSectionId?: string;
  __edit?: EditContext;
}

export function HeroSection({
  eyebrow,
  kanji,
  title,
  titleEm,
  subtitle,
  backgroundImageUrl,
  ctaPrimary,
  ctaSecondary,
  metaItems,
  __editSectionId,
  __edit,
}: HeroSectionProps) {
  const sectionId = __editSectionId ?? '';
  const edit = __edit;

  const body = (
    <section
      className={styles.hero}
      style={
        backgroundImageUrl
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(10,9,8,0.1), rgba(10,9,8,0.85)), url(${backgroundImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {kanji ? (
        <div className={styles.kanji}>
          <EditableText
            sectionId={sectionId}
            field="kanji"
            value={kanji}
            edit={edit}
          />
        </div>
      ) : null}
      <div className="container">
        <div className={styles.inner}>
          {eyebrow !== undefined ? (
            <EditableText
              as="span"
              className={styles.eyebrow}
              sectionId={sectionId}
              field="eyebrow"
              value={eyebrow}
              edit={edit}
            />
          ) : null}
          <h1 className={styles.title}>
            <EditableText
              sectionId={sectionId}
              field="title"
              value={title}
              edit={edit}
            />
            {titleEm ? (
              <>
                <br />
                <EditableText
                  as="em"
                  sectionId={sectionId}
                  field="titleEm"
                  value={titleEm}
                  edit={edit}
                />
              </>
            ) : null}
          </h1>
          {subtitle !== undefined ? (
            <EditableText
              as="p"
              className={styles.subtitle}
              sectionId={sectionId}
              field="subtitle"
              value={subtitle}
              edit={edit}
            />
          ) : null}
          {(ctaPrimary || ctaSecondary) && (
            <div className={styles.ctas}>
              {ctaPrimary ? (
                <EditableCta
                  sectionId={sectionId}
                  prefix="ctaPrimary"
                  label={ctaPrimary.label}
                  href={ctaPrimary.href}
                  edit={edit}
                  className="btn btn--filled"
                />
              ) : null}
              {ctaSecondary ? (
                <EditableCta
                  sectionId={sectionId}
                  prefix="ctaSecondary"
                  label={ctaSecondary.label}
                  href={ctaSecondary.href}
                  edit={edit}
                  className="btn"
                />
              ) : null}
            </div>
          )}
          <EditableList
            sectionId={sectionId}
            listField="metaItems"
            items={metaItems ?? []}
            edit={edit}
            addLabel="Ajouter un KPI"
            newItemTemplate={{ label: '', value: '' }}
            itemSchema={[
              { key: 'label', label: 'Libellé' },
              { key: 'value', label: 'Valeur' },
            ]}
          >
            {metaItems && metaItems.length > 0 ? (
              <dl className={styles.meta}>
                {metaItems.map((m, i) => (
                  <div key={i} className={styles.metaItem}>
                    <dt>{m.label}</dt>
                    <dd>{m.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <></>
            )}
          </EditableList>
        </div>
      </div>
    </section>
  );

  return (
    <EditableImage
      sectionId={sectionId}
      field="backgroundImageUrl"
      value={backgroundImageUrl ?? null}
      edit={edit}
      label="Image de fond"
    >
      {body}
    </EditableImage>
  );
}
