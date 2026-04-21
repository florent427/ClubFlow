import { SectionHeader } from './SectionHeader';
import type { EditContext } from '@/lib/edit-context';
import styles from './GallerySection.module.css';

export interface GalleryPhoto {
  id: string;
  imageUrl: string;
  caption?: string | null;
  category?: string | null;
}

export interface GallerySectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  photos: GalleryPhoto[];
  __editSectionId?: string;
  __edit?: EditContext;
}

export function GallerySection({
  label,
  title,
  titleEm,
  photos,
  __editSectionId,
  __edit,
}: GallerySectionProps) {
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
        <div className={styles.grid}>
          {photos.map((p) => (
            <figure key={p.id} className={styles.tile}>
              <img src={p.imageUrl} alt={p.caption ?? ''} loading="lazy" />
              {p.caption ? (
                <figcaption className={styles.caption}>{p.caption}</figcaption>
              ) : null}
            </figure>
          ))}
        </div>
        {edit?.editMode ? (
          <p
            style={{
              textAlign: 'center',
              color: 'var(--muted)',
              marginTop: 16,
              fontSize: 13,
            }}
          >
            Ajoutez/supprimez des photos depuis <strong>Admin → Galerie</strong>.
          </p>
        ) : null}
      </div>
    </section>
  );
}
