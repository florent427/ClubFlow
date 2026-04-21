import Link from 'next/link';
import { SectionHeader } from './SectionHeader';
import { EditableList } from '@/components/edit/EditableList';
import type { EditContext } from '@/lib/edit-context';
import styles from './CardsGridSection.module.css';

export interface CardsGridCard {
  title: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string | null;
  priceLabel?: string;
  tags?: string[];
  kanji?: string;
  cta?: { label: string; href: string };
}

export interface CardsGridSectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  intro?: string;
  cards: CardsGridCard[];
  columns?: 2 | 3 | 4;
  __editSectionId?: string;
  __edit?: EditContext;
}

export function CardsGridSection({
  label,
  title,
  titleEm,
  intro,
  cards,
  columns = 3,
  __editSectionId,
  __edit,
}: CardsGridSectionProps) {
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
            intro={intro}
            sectionId={sectionId}
            edit={edit}
          />
        ) : null}
        <EditableList
          sectionId={sectionId}
          listField="cards"
          items={cards}
          edit={edit}
          addLabel="Ajouter une carte"
          newItemTemplate={{
            title: 'Nouvelle carte',
            subtitle: '',
            body: '',
            kanji: '',
          }}
          itemSchema={[
            { key: 'title', label: 'Titre' },
            { key: 'subtitle', label: 'Sous-titre' },
            { key: 'body', label: 'Texte', type: 'textarea' },
            { key: 'priceLabel', label: 'Prix (optionnel)' },
            { key: 'kanji', label: 'Kanji (optionnel)' },
          ]}
        >
          <div
            className={styles.grid}
            style={{
              gridTemplateColumns: `repeat(auto-fit, minmax(${columns === 4 ? 220 : columns === 3 ? 260 : 320}px, 1fr))`,
            }}
          >
            {cards.map((card, i) => (
              <article key={`${card.title}-${i}`} className={styles.card}>
                {card.imageUrl ? (
                  <div
                    className={styles.image}
                    style={{ backgroundImage: `url(${card.imageUrl})` }}
                  />
                ) : null}
                <div className={styles.body}>
                  {card.kanji ? (
                    <span className={styles.kanji}>{card.kanji}</span>
                  ) : null}
                  {card.subtitle ? (
                    <span className={styles.subtitle}>{card.subtitle}</span>
                  ) : null}
                  <h3 className={styles.title}>{card.title}</h3>
                  {card.body ? (
                    <p className={styles.text}>{card.body}</p>
                  ) : null}
                  {card.priceLabel ? (
                    <div className={styles.price}>{card.priceLabel}</div>
                  ) : null}
                  {card.tags && card.tags.length > 0 ? (
                    <div className={styles.tags}>
                      {card.tags.map((t) => (
                        <span key={t} className={styles.tag}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {card.cta ? (
                    <Link href={card.cta.href} className={styles.cta}>
                      {card.cta.label} →
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </EditableList>
      </div>
    </section>
  );
}
