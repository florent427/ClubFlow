import { EditableText } from '@/components/edit/EditableText';
import { EditableImage } from '@/components/edit/EditableImage';
import { EditableList } from '@/components/edit/EditableList';
import type { EditContext } from '@/lib/edit-context';
import styles from './TwoColumnSection.module.css';

export interface TwoColumnSectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  paragraphs?: string[];
  imageUrl?: string | null;
  imageCaption?: string;
  imageSide?: 'left' | 'right';
  __editSectionId?: string;
  __edit?: EditContext;
}

export function TwoColumnSection({
  label,
  title,
  titleEm,
  paragraphs,
  imageUrl,
  imageCaption,
  imageSide = 'right',
  __editSectionId,
  __edit,
}: TwoColumnSectionProps) {
  const sectionId = __editSectionId ?? '';
  const edit = __edit;

  const textCol = (
    <div className={styles.text} key="text">
      {label ? (
        <EditableText
          as="span"
          className="section-label"
          sectionId={sectionId}
          field="label"
          value={label}
          edit={edit}
        />
      ) : null}
      {title ? (
        <h2 className="section-title">
          <EditableText
            sectionId={sectionId}
            field="title"
            value={title}
            edit={edit}
          />
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
      ) : null}
      <EditableList
        sectionId={sectionId}
        listField="paragraphs"
        items={paragraphs ?? []}
        edit={edit}
        addLabel="Ajouter un paragraphe"
        newItemTemplate={{ value: '' }}
        itemSchema={[{ key: 'value', label: 'Paragraphe', type: 'textarea' }]}
      >
        <>
          {paragraphs?.map((p, i) => (
            <p key={i}>{typeof p === 'string' ? p : (p as { value?: string }).value ?? ''}</p>
          ))}
        </>
      </EditableList>
    </div>
  );

  const imgCol = (
    <div className={styles.imageWrap} key="image">
      <EditableImage
        sectionId={sectionId}
        field="imageUrl"
        value={imageUrl ?? null}
        edit={edit}
        label="Image"
      >
        {imageUrl ? (
          <div
            className={styles.image}
            style={{ backgroundImage: `url(${imageUrl})` }}
            role="img"
            aria-label={imageCaption}
          />
        ) : (
          <div
            className={styles.image}
            style={{ background: 'var(--ink-2)' }}
          />
        )}
      </EditableImage>
      {imageCaption ? (
        <EditableText
          as="p"
          className={styles.caption}
          sectionId={sectionId}
          field="imageCaption"
          value={imageCaption}
          edit={edit}
        />
      ) : null}
    </div>
  );

  return (
    <section className="section">
      <div className="container">
        <div className={styles.grid}>
          {imageSide === 'left' ? [imgCol, textCol] : [textCol, imgCol]}
        </div>
      </div>
    </section>
  );
}
