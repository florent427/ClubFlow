import { SectionHeader } from './SectionHeader';
import type { EditContext } from '@/lib/edit-context';
import styles from './AnnouncementsSection.module.css';

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
}

export interface AnnouncementsSectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  items: AnnouncementItem[];
  emptyText?: string;
  __editSectionId?: string;
  __edit?: EditContext;
}

export function AnnouncementsSection({
  label,
  title,
  titleEm,
  items,
  emptyText,
  __editSectionId,
  __edit,
}: AnnouncementsSectionProps) {
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
            sectionId={sectionId}
            edit={edit}
          />
        ) : null}
        {items.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            {emptyText ?? 'Aucune annonce pour le moment.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {items.map((a) => (
              <li
                key={a.id}
                className={`${styles.item}${a.pinned ? ' ' + styles.pinned : ''}`}
              >
                {a.pinned ? (
                  <span className={styles.pin}>Épinglée</span>
                ) : null}
                <h3 className={styles.title}>{a.title}</h3>
                <p className={styles.body}>{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
