import { EditableText } from '@/components/edit/EditableText';
import { EditableList } from '@/components/edit/EditableList';
import type { EditContext } from '@/lib/edit-context';
import styles from './ManifestoSection.module.css';

export interface ManifestoSectionProps {
  kanji?: string;
  title?: string;
  paragraphs?: string[];
  quote?: string;
  attribution?: string;
  __editSectionId?: string;
  __edit?: EditContext;
}

export function ManifestoSection({
  kanji,
  title,
  paragraphs,
  quote,
  attribution,
  __editSectionId,
  __edit,
}: ManifestoSectionProps) {
  const sectionId = __editSectionId ?? '';
  const edit = __edit;
  return (
    <section className={`section ${styles.manifesto}`}>
      <div className="container">
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
        {title ? (
          <EditableText
            as="h2"
            className={styles.title}
            sectionId={sectionId}
            field="title"
            value={title}
            edit={edit}
          />
        ) : null}
        <EditableList
          sectionId={sectionId}
          listField="paragraphs"
          items={paragraphs ?? []}
          edit={edit}
          addLabel="Ajouter un paragraphe"
          newItemTemplate={{ value: '' }}
          itemSchema={[
            { key: 'value', label: 'Paragraphe', type: 'textarea' },
          ]}
        >
          <>
            {paragraphs?.map((p, i) => (
              <p key={i} className={styles.paragraph}>
                {typeof p === 'string'
                  ? p
                  : (p as { value?: string }).value ?? ''}
              </p>
            ))}
          </>
        </EditableList>
        {quote ? (
          <blockquote className={styles.quote}>
            <EditableText
              as="p"
              sectionId={sectionId}
              field="quote"
              value={quote}
              edit={edit}
            />
            {attribution ? (
              <cite>
                —{' '}
                <EditableText
                  sectionId={sectionId}
                  field="attribution"
                  value={attribution}
                  edit={edit}
                />
              </cite>
            ) : null}
          </blockquote>
        ) : null}
      </div>
    </section>
  );
}
