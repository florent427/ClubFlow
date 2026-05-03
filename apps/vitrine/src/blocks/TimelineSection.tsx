import { SectionHeader } from './SectionHeader';
import { EditableList } from '@/components/edit/EditableList';
import type { EditContext } from '@/lib/edit-context';
import styles from './TimelineSection.module.css';

export interface TimelineItem {
  year: string;
  title: string;
  description?: string;
}

export interface TimelineSectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  items: TimelineItem[];
  __editSectionId?: string;
  __edit?: EditContext;
}

export function TimelineSection({
  label,
  title,
  titleEm,
  items,
  __editSectionId,
  __edit,
}: TimelineSectionProps) {
  const sectionId = __editSectionId ?? '';
  const edit = __edit;
  return (
    <section className="section">
      <div className="container">
        {title ? (
          <SectionHeader
            label={label}
            title={title}
            titleEm={titleEm}
            align="center"
            sectionId={sectionId}
            edit={edit}
          />
        ) : null}
        <EditableList
          sectionId={sectionId}
          listField="items"
          items={items}
          edit={edit}
          addLabel="Ajouter un jalon"
          newItemTemplate={{ year: '', title: '', description: '' }}
          itemSchema={[
            { key: 'year', label: 'Année' },
            { key: 'title', label: 'Titre' },
            { key: 'description', label: 'Description', type: 'textarea' },
          ]}
        >
          <ol className={styles.timeline}>
            {items.map((it, i) => (
              <li key={i} className={styles.item}>
                <span className={styles.year}>{it.year}</span>
                <h3 className={styles.title}>{it.title}</h3>
                {it.description ? (
                  <p className={styles.desc}>{it.description}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </EditableList>
      </div>
    </section>
  );
}
