'use client';

import { useMemo, useState } from 'react';
import { Lightbox } from './Lightbox';

export interface GalleryPhotoItem {
  id: string;
  url: string;
  title: string;
  label?: string | null;
  /** 'dojo' | 'kata' | 'kumite' | 'compet' | 'stage' ou autre tag */
  tag: string;
  /** 1..6 — taille du tile dans la masonry */
  size: 1 | 2 | 3 | 4 | 5 | 6;
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Tout' },
  { key: 'dojo', label: 'Dojo' },
  { key: 'kata', label: 'Kata' },
  { key: 'kumite', label: 'Kumite' },
  { key: 'compet', label: 'Compétition' },
  { key: 'stage', label: 'Stages' },
];

interface Props {
  photos: GalleryPhotoItem[];
  /** Override liste de filtres (optionnel — sinon filtres SKSR par défaut). */
  filters?: Array<{ key: string; label: string }>;
}

/**
 * Grille masonry 12 colonnes + lightbox — port fidèle de `galerie.html`.
 *  - variantes de taille s-1 à s-6
 *  - filtrage par tag, navigation prev/next cycle sur les visibles uniquement
 */
export function SksrGalleryGrid({ photos, filters = FILTERS }: Props) {
  const [filter, setFilter] = useState<string>('all');
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const visibleIndices = useMemo(
    () =>
      photos
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => filter === 'all' || p.tag === filter)
        .map(({ i }) => i),
    [photos, filter],
  );

  const lightboxPhotos = useMemo(
    () => photos.map((p) => ({ url: p.url, title: p.title, label: p.label })),
    [photos],
  );

  function navigate(nextIndex: number) {
    if (openIdx === null || visibleIndices.length === 0) return;
    // on restreint la nav aux éléments actuellement visibles
    const currentPos = visibleIndices.indexOf(openIdx);
    if (currentPos === -1) {
      setOpenIdx(visibleIndices[0]);
      return;
    }
    const dir = nextIndex > openIdx ? 1 : -1;
    const newPos =
      (currentPos + dir + visibleIndices.length) % visibleIndices.length;
    setOpenIdx(visibleIndices[newPos]);
  }

  return (
    <>
      <div className="gallery__filters reveal d2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? 'on' : ''}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="gallery__grid">
        {photos.map((p, i) => {
          const hidden = filter !== 'all' && p.tag !== filter;
          return (
            <div
              key={p.id}
              className={`gal-item s-${p.size}${hidden ? ' hidden' : ''}`}
              data-tag={p.tag}
              onClick={() => setOpenIdx(i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setOpenIdx(i);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.title} />
              <div className="gal-item__cap">
                <span className="gal-item__tag">{p.tag}</span>
                <div className="gal-item__title">{p.title}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Lightbox
        photos={lightboxPhotos}
        openIndex={openIdx}
        onClose={() => setOpenIdx(null)}
        onNavigate={navigate}
      />
    </>
  );
}
