import { EditableText } from '@/components/edit/EditableText';
import { EditableCta } from '@/components/edit/EditableCta';
import type { EditContext } from '@/lib/edit-context';
import styles from './CTABandSection.module.css';

export interface CTABandSectionProps {
  eyebrow?: string;
  title: string;
  titleEm?: string;
  subtitle?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  __editSectionId?: string;
  __edit?: EditContext;
}

export function CTABandSection({
  eyebrow,
  title,
  titleEm,
  subtitle,
  primary,
  secondary,
  __editSectionId,
  __edit,
}: CTABandSectionProps) {
  const sectionId = __editSectionId ?? '';
  const edit = __edit;
  return (
    <section className={styles.band}>
      <div className="container">
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
        <h2 className={styles.title}>
          <EditableText sectionId={sectionId} field="title" value={title} edit={edit} />
          {titleEm ? (
            <>
              {' '}
              <EditableText
                as="em"
                sectionId={sectionId}
                field="titleEm"
                value={titleEm}
                edit={edit}
              />
            </>
          ) : null}
        </h2>
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
        <div className={styles.ctas}>
          {primary ? (
            <EditableCta
              sectionId={sectionId}
              prefix="primary"
              label={primary.label}
              href={primary.href}
              edit={edit}
              className="btn btn--filled"
            />
          ) : null}
          {secondary ? (
            <EditableCta
              sectionId={sectionId}
              prefix="secondary"
              label={secondary.label}
              href={secondary.href}
              edit={edit}
              className="btn"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
