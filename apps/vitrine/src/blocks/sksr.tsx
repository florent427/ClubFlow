/**
 * Blocks SKSR — port fidèle du site original.
 *
 * Chaque block utilise les classes CSS portées dans `sksr-pages.css`. Le
 * contenu est passé via `sectionsJson` et reste éditable via les
 * composants Editable* (EditableText / EditableList / EditableImage /
 * EditableCta). Les champs array (items, paragraphs, cards) sont
 * wrappés dans EditableList.
 *
 * Pour économiser un fichier par block, tous les composants SKSR sont
 * regroupés ici. Chaque export est nommé `SksrXxx` pour éviter les
 * collisions avec les anciens blocks génériques (toujours présents pour
 * rétrocompat).
 */

import Link from 'next/link';
import { EditableText } from '@/components/edit/EditableText';
import { EditableImage } from '@/components/edit/EditableImage';
import { EditableList } from '@/components/edit/EditableList';
import { EditableCta } from '@/components/edit/EditableCta';
import { CounterNumber } from '@/components/sksr/CounterNumber';
import type { EditContext } from '@/lib/edit-context';

type EditProps = {
  __editSectionId?: string;
  __edit?: EditContext;
};

function useEditIds(props: EditProps) {
  return {
    sectionId: props.__editSectionId ?? '',
    edit: props.__edit,
  };
}

// ============================================================================
// INDEX — hero (split/full/minimal), manifesto, voie, cours-preview,
//          dojo-split, actu, cta-band
// ============================================================================

export interface SksrHeroProps extends EditProps {
  label?: string;
  titleTop?: string;
  titleG1?: string;
  titleG2?: string;
  titleR?: string;
  subtitle?: string;
  ctaPrimary?: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
  metaItems?: Array<{ value: number; label: string }>;
  kanjiBg?: string;
  visualImageUrl?: string | null;
  logoUrl?: string | null;
}

export function SksrHero(props: SksrHeroProps) {
  const { sectionId, edit } = useEditIds(props);
  const {
    label,
    titleTop,
    titleG1,
    titleG2,
    titleR,
    subtitle,
    ctaPrimary,
    ctaSecondary,
    metaItems,
    kanjiBg,
    visualImageUrl,
    logoUrl,
  } = props;

  const heroContent = (
    <div className="hero__content">
      {kanjiBg ? <div className="hero__kanji-bg">{kanjiBg}</div> : null}
      {label !== undefined ? (
        <EditableText
          as="div"
          className="hero__label reveal"
          sectionId={sectionId}
          field="label"
          value={label}
          edit={edit}
        />
      ) : null}
      <h1 className="hero__title reveal d1">
        {titleTop ? (
          <>
            <EditableText
              sectionId={sectionId}
              field="titleTop"
              value={titleTop}
              edit={edit}
            />{' '}
          </>
        ) : null}
        {titleG1 ? (
          <span className="g">
            <EditableText
              sectionId={sectionId}
              field="titleG1"
              value={titleG1}
              edit={edit}
            />
          </span>
        ) : null}
        <br />
        {titleG2 ? (
          <>
            par{' '}
            <span className="g">
              <EditableText
                sectionId={sectionId}
                field="titleG2"
                value={titleG2}
                edit={edit}
              />
            </span>
            <br />
          </>
        ) : null}
        {titleR ? (
          <span className="r">
            <EditableText
              sectionId={sectionId}
              field="titleR"
              value={titleR}
              edit={edit}
            />
          </span>
        ) : null}
      </h1>
      {subtitle !== undefined ? (
        <EditableText
          as="p"
          className="hero__sub reveal d2"
          sectionId={sectionId}
          field="subtitle"
          value={subtitle}
          edit={edit}
        />
      ) : null}
      {(ctaPrimary || ctaSecondary) && (
        <div className="hero__cta-row reveal d3">
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
      {metaItems && metaItems.length > 0 ? (
        <EditableList
          sectionId={sectionId}
          listField="metaItems"
          items={metaItems}
          edit={edit}
          addLabel="Ajouter un KPI"
          newItemTemplate={{ value: 0, label: '' }}
          itemSchema={[
            { key: 'value', label: 'Valeur (nombre)', type: 'number' },
            { key: 'label', label: 'Libellé' },
          ]}
        >
          <div className="hero__meta reveal d4">
            {metaItems.map((m, i) => (
              <div key={i} className="hero__meta-item">
                <div className="hero__meta-val">
                  <CounterNumber target={Number(m.value) || 0} />
                </div>
                <div className="hero__meta-lbl">{m.label}</div>
              </div>
            ))}
          </div>
        </EditableList>
      ) : null}
    </div>
  );

  const body = (
    <section className="hero">
      {heroContent}
      <div className="hero__visual">
        {visualImageUrl ? (
          <img src={visualImageUrl} alt="" />
        ) : (
          <svg
            viewBox="0 0 800 1200"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              background: 'linear-gradient(160deg, #1c1915 0%, #0a0908 100%)',
            }}
          >
            <defs>
              <radialGradient id="heroGlow" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#c9a96a" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#c9a96a" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="800" height="1200" fill="url(#heroGlow)" />
            <text
              x="400"
              y="680"
              fontFamily="'Shippori Mincho', serif"
              fontSize="520"
              fill="#c9a96a"
              fillOpacity="0.08"
              textAnchor="middle"
              fontWeight="700"
            >
              空
            </text>
            <g stroke="#c9a96a" strokeOpacity="0.22" strokeWidth="1" fill="none">
              <circle cx="400" cy="600" r="260" />
              <circle cx="400" cy="600" r="320" />
            </g>
          </svg>
        )}
        {logoUrl ? <img src={logoUrl} className="hero__logo-big" alt="" /> : null}
      </div>
      {logoUrl ? (
        <img src={logoUrl} className="hero__logo-medallion" alt="" />
      ) : null}
      <div className="hero__scroll-ind">Scroll</div>
    </section>
  );

  return (
    <EditableImage
      sectionId={sectionId}
      field="visualImageUrl"
      value={visualImageUrl ?? null}
      edit={edit}
      label="Image du hero"
    >
      {body}
    </EditableImage>
  );
}

export interface SksrManifestoProps extends EditProps {
  kanji?: string;
  kanjiSub?: string;
  lead?: string;
  leadEm?: string;
  sub?: string;
  subEm?: string;
  signature?: string;
}

export function SksrManifesto(props: SksrManifestoProps) {
  const { sectionId, edit } = useEditIds(props);
  return (
    <section className="manifesto">
      <div className="manifesto__grid">
        <div className="manifesto__left reveal">
          {props.kanji ? (
            <div className="manifesto__kanji">
              <EditableText
                sectionId={sectionId}
                field="kanji"
                value={props.kanji}
                edit={edit}
              />
            </div>
          ) : null}
          {props.kanjiSub ? (
            <div className="manifesto__kanji-sub">
              <EditableText
                sectionId={sectionId}
                field="kanjiSub"
                value={props.kanjiSub}
                edit={edit}
              />
            </div>
          ) : null}
        </div>
        <div>
          {props.lead ? (
            <EditableText
              as="p"
              className="manifesto__text reveal d1"
              sectionId={sectionId}
              field="lead"
              value={props.lead}
              edit={edit}
            />
          ) : null}
          {props.sub ? (
            <EditableText
              as="p"
              className="manifesto__text reveal d2"
              sectionId={sectionId}
              field="sub"
              value={props.sub}
              edit={edit}
            />
          ) : null}
          {props.signature ? (
            <EditableText
              as="div"
              className="manifesto__signature reveal d3"
              sectionId={sectionId}
              field="signature"
              value={props.signature}
              edit={edit}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export interface SksrVoieProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  intro?: string;
  items?: Array<{
    num: string;
    kanji: string;
    name: string;
    nameJp: string;
    desc: string;
  }>;
}

export function SksrVoie(props: SksrVoieProps) {
  const { sectionId, edit } = useEditIds(props);
  const items = props.items ?? [];
  return (
    <section className="voie">
      <div className="voie__head">
        <div className="reveal">
          {props.label ? (
            <div className="section-label">
              <EditableText
                sectionId={sectionId}
                field="label"
                value={props.label}
                edit={edit}
              />
            </div>
          ) : null}
          <h2 className="section-title">
            <EditableText
              sectionId={sectionId}
              field="title"
              value={props.title ?? ''}
              edit={edit}
            />
            <br />
            <em>
              <EditableText
                sectionId={sectionId}
                field="titleEm"
                value={props.titleEm ?? ''}
                edit={edit}
              />
            </em>
          </h2>
        </div>
        {props.intro ? (
          <EditableText
            as="p"
            className="voie__intro reveal d2"
            sectionId={sectionId}
            field="intro"
            value={props.intro}
            edit={edit}
          />
        ) : null}
      </div>
      <EditableList
        sectionId={sectionId}
        listField="items"
        items={items}
        edit={edit}
        addLabel="Ajouter un précepte"
        newItemTemplate={{ num: '', kanji: '', name: '', nameJp: '', desc: '' }}
        itemSchema={[
          { key: 'num', label: 'Numéro (ex. 01)' },
          { key: 'kanji', label: 'Kanji' },
          { key: 'name', label: 'Nom (FR)' },
          { key: 'nameJp', label: 'Nom (JP romanisé)' },
          { key: 'desc', label: 'Description', type: 'textarea' },
        ]}
      >
        <div className="voie__list">
          {items.map((it, i) => (
            <div
              key={i}
              className={`voie__item reveal${i > 0 ? ' d' + i : ''}`}
            >
              <div className="voie__num">{it.num}</div>
              <div className="voie__kanji">{it.kanji}</div>
              <div className="voie__name">
                {it.name}
                <small>{it.nameJp}</small>
              </div>
              <div className="voie__desc">{it.desc}</div>
            </div>
          ))}
        </div>
      </EditableList>
    </section>
  );
}

export interface SksrCoursPreviewProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  kanjiBg?: string;
  cards?: Array<{
    age: string;
    ageRange?: string;
    ageUnit: string;
    name: string;
    desc: string;
  }>;
}

export function SksrCoursPreview(props: SksrCoursPreviewProps) {
  const { sectionId, edit } = useEditIds(props);
  const cards = props.cards ?? [];
  return (
    <section className="cours-preview">
      {props.kanjiBg ? (
        <div className="cours-preview__kanji">{props.kanjiBg}</div>
      ) : null}
      <div className="cours-preview__head">
        <div className="reveal">
          {props.label ? (
            <div className="section-label">{props.label}</div>
          ) : null}
          <h2 className="section-title">
            <EditableText
              sectionId={sectionId}
              field="title"
              value={props.title ?? ''}
              edit={edit}
            />
            <br />
            <em>
              <EditableText
                sectionId={sectionId}
                field="titleEm"
                value={props.titleEm ?? ''}
                edit={edit}
              />
            </em>
          </h2>
        </div>
      </div>
      <EditableList
        sectionId={sectionId}
        listField="cards"
        items={cards}
        edit={edit}
        addLabel="Ajouter un groupe"
        newItemTemplate={{
          age: '',
          ageRange: '',
          ageUnit: '',
          name: '',
          desc: '',
        }}
        itemSchema={[
          { key: 'age', label: 'Âge début (ex. 6)' },
          { key: 'ageRange', label: 'Range (ex. −12)' },
          { key: 'ageUnit', label: 'Libellé unité' },
          { key: 'name', label: 'Nom du groupe' },
          { key: 'desc', label: 'Description', type: 'textarea' },
        ]}
      >
        <div className="cours-preview__grid">
          {cards.map((c, i) => (
            <div key={i} className={`cours-card reveal${i > 0 ? ' d' + i : ''}`}>
              <div className="cours-card__age">
                {c.age}
                {c.ageRange ? (
                  <span style={{ fontSize: '.5em', color: 'var(--muted)' }}>
                    {c.ageRange}
                  </span>
                ) : null}
              </div>
              <div className="cours-card__age-unit">{c.ageUnit}</div>
              <h3 className="cours-card__name">{c.name}</h3>
              <p className="cours-card__desc">{c.desc}</p>
              <Link href="/cours" className="cours-card__link">
                Voir les horaires
              </Link>
            </div>
          ))}
        </div>
      </EditableList>
    </section>
  );
}

export interface SksrDojoSplitProps extends EditProps {
  imageUrl?: string | null;
  stamp?: string;
  label?: string;
  title?: string;
  titleEm?: string;
  lead?: string;
  items?: Array<{ key: string; val: string }>;
  ctaLabel?: string;
  ctaHref?: string;
}

export function SksrDojoSplit(props: SksrDojoSplitProps) {
  const { sectionId, edit } = useEditIds(props);
  const items = props.items ?? [];
  return (
    <section className="dojo-split">
      <EditableImage
        sectionId={sectionId}
        field="imageUrl"
        value={props.imageUrl ?? null}
        edit={edit}
        label="Image dojo"
      >
        <div className="dojo-split__image">
          {props.imageUrl ? (
            <img src={props.imageUrl} alt="Dojo" />
          ) : (
            <div style={{ background: 'var(--ink-2)', width: '100%', height: '100%' }} />
          )}
          {props.stamp ? (
            <div className="dojo-split__stamp">{props.stamp}</div>
          ) : null}
        </div>
      </EditableImage>
      <div className="dojo-split__content">
        {props.label ? (
          <div className="section-label reveal">
            <EditableText
              sectionId={sectionId}
              field="label"
              value={props.label}
              edit={edit}
            />
          </div>
        ) : null}
        <h2 className="section-title reveal d1">
          <EditableText
            sectionId={sectionId}
            field="title"
            value={props.title ?? ''}
            edit={edit}
          />
          <br />
          <em>
            <EditableText
              sectionId={sectionId}
              field="titleEm"
              value={props.titleEm ?? ''}
              edit={edit}
            />
          </em>
        </h2>
        {props.lead ? (
          <EditableText
            as="p"
            className="reveal d2"
            sectionId={sectionId}
            field="lead"
            value={props.lead}
            edit={edit}
          />
        ) : null}
        <EditableList
          sectionId={sectionId}
          listField="items"
          items={items}
          edit={edit}
          addLabel="Ajouter une ligne"
          newItemTemplate={{ key: '', val: '' }}
          itemSchema={[
            { key: 'key', label: 'Libellé gauche' },
            { key: 'val', label: 'Valeur droite' },
          ]}
        >
          <ul className="dojo-split__list reveal d3">
            {items.map((it, i) => (
              <li key={i}>
                <span>{it.key}</span>
                <span>{it.val}</span>
              </li>
            ))}
          </ul>
        </EditableList>
        {props.ctaHref ? (
          <div style={{ marginTop: 40 }} className="reveal d4">
            <Link href={props.ctaHref} className="btn">
              {props.ctaLabel ?? 'En savoir plus'}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export interface SksrActuPreviewProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  seeAllLabel?: string;
  seeAllHref?: string;
  articles?: Array<{
    slug: string;
    title: string;
    date: string;
    tag: string;
    kanji?: string;
    coverImageUrl?: string | null;
    featured?: boolean;
  }>;
}

export function SksrActuPreview(props: SksrActuPreviewProps) {
  const articles = props.articles ?? [];
  return (
    <section className="actu">
      <div className="actu__head">
        <div className="reveal">
          {props.label ? (
            <div className="section-label">{props.label}</div>
          ) : null}
          <h2 className="section-title">
            {props.title}
            <br />
            <em>{props.titleEm}</em>
          </h2>
        </div>
        {props.seeAllHref ? (
          <Link href={props.seeAllHref} className="btn reveal d2">
            {props.seeAllLabel ?? 'Toutes les actualités'}
          </Link>
        ) : null}
      </div>
      <div className="actu__grid">
        {articles.map((a, i) => (
          <Link
            key={a.slug}
            href={`/blog/${a.slug}`}
            className={`actu-card${a.featured ? ' featured' : ''} reveal${i > 0 ? ' d' + i : ''}`}
          >
            <div className="actu-card__img">
              <span className="actu-card__tag">{a.tag}</span>
              {a.coverImageUrl ? (
                <img src={a.coverImageUrl} alt={a.title} />
              ) : (
                <svg
                  viewBox="0 0 800 500"
                  preserveAspectRatio="xMidYMid slice"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    background: 'linear-gradient(135deg, #1c1915, #0a0908)',
                  }}
                >
                  <text
                    x="400"
                    y="330"
                    fontFamily="'Shippori Mincho', serif"
                    fontSize="260"
                    fill="#c9a96a"
                    fillOpacity="0.12"
                    textAnchor="middle"
                    fontWeight="700"
                  >
                    {a.kanji ?? '新'}
                  </text>
                </svg>
              )}
            </div>
            <div className="actu-card__date">{a.date}</div>
            <h3 className="actu-card__title">{a.title}</h3>
          </Link>
        ))}
      </div>
    </section>
  );
}

export interface SksrCtaBandProps extends EditProps {
  kanjiBg?: string;
  label?: string;
  titleLineA?: string;
  titleLineAEm?: string;
  titleLineB?: string;
  titleLineBEm?: string;
  sub?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}

export function SksrCtaBand(props: SksrCtaBandProps) {
  const { sectionId, edit } = useEditIds(props);
  return (
    <section className="cta-band">
      {props.kanjiBg ? <div className="cta-band__kanji">{props.kanjiBg}</div> : null}
      <div className="cta-band__inner">
        {props.label ? (
          <EditableText
            as="div"
            className="cta-band__label reveal"
            sectionId={sectionId}
            field="label"
            value={props.label}
            edit={edit}
          />
        ) : null}
        <h2 className="cta-band__title reveal d1">
          {props.titleLineA} <em>{props.titleLineAEm}</em>
          <br />
          {props.titleLineB} <em>{props.titleLineBEm}</em>
        </h2>
        {props.sub ? (
          <EditableText
            as="p"
            className="cta-band__sub reveal d2"
            sectionId={sectionId}
            field="sub"
            value={props.sub}
            edit={edit}
          />
        ) : null}
        <div className="cta-band__row reveal d3">
          {props.primary ? (
            <EditableCta
              sectionId={sectionId}
              prefix="primary"
              label={props.primary.label}
              href={props.primary.href}
              edit={edit}
              className="btn btn--filled"
            />
          ) : null}
          {props.secondary ? (
            <EditableCta
              sectionId={sectionId}
              prefix="secondary"
              label={props.secondary.label}
              href={props.secondary.href}
              edit={edit}
              className="btn"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CLUB — timeline, two-col, stats-band, values
// ============================================================================

export interface SksrTimelineProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  items?: Array<{ year: string; title: string; desc: string }>;
}

export function SksrTimeline(props: SksrTimelineProps) {
  const { sectionId, edit } = useEditIds(props);
  const items = props.items ?? [];
  return (
    <section className="timeline">
      <div className="timeline__head">
        {props.label ? (
          <div className="section-label reveal">{props.label}</div>
        ) : null}
        <h2 className="section-title reveal d1">
          {props.title}
          <br />
          <em>{props.titleEm}</em>
        </h2>
      </div>
      <div className="timeline__track">
        <div className="timeline__line" />
        <EditableList
          sectionId={sectionId}
          listField="items"
          items={items}
          edit={edit}
          addLabel="Ajouter un jalon"
          newItemTemplate={{ year: '', title: '', desc: '' }}
          itemSchema={[
            { key: 'year', label: 'Année (ex. 09)' },
            { key: 'title', label: 'Titre' },
            { key: 'desc', label: 'Description', type: 'textarea' },
          ]}
        >
          <div className="timeline__items">
            {items.map((it, i) => (
              <div
                key={i}
                className={`tl-item reveal${i > 0 ? ' d' + i : ''}`}
              >
                <div className="tl-item__year">{it.year}</div>
                <div className="tl-item__dot" />
                <div className="tl-item__title">{it.title}</div>
                <div className="tl-item__desc">{it.desc}</div>
              </div>
            ))}
          </div>
        </EditableList>
      </div>
    </section>
  );
}

export interface SksrTwoColProps extends EditProps {
  label?: string;
  title?: string;
  titleEm1?: string;
  titleEm2?: string;
  paragraphs?: string[];
  quote?: string;
  quoteAuthor?: string;
  imageUrl?: string | null;
  stamp?: string;
}

export function SksrTwoCol(props: SksrTwoColProps) {
  const { sectionId, edit } = useEditIds(props);
  const paragraphs = props.paragraphs ?? [];
  return (
    <section className="two-col">
      <div className="reveal">
        {props.label ? (
          <div className="section-label">{props.label}</div>
        ) : null}
        <h2>
          {props.title} <em>{props.titleEm1}</em>
          {props.titleEm2 ? (
            <>
              , un accueil <em>{props.titleEm2}</em>
            </>
          ) : null}
          .
        </h2>
        <EditableList
          sectionId={sectionId}
          listField="paragraphs"
          items={paragraphs}
          edit={edit}
          addLabel="Ajouter un paragraphe"
          newItemTemplate={{ value: '' }}
          itemSchema={[
            { key: 'value', label: 'Paragraphe', type: 'textarea' },
          ]}
        >
          <>
            {paragraphs.map((p, i) => (
              <p key={i}>
                {typeof p === 'string' ? p : (p as { value?: string }).value ?? ''}
              </p>
            ))}
          </>
        </EditableList>
        {props.quote ? (
          <p
            style={{ color: 'var(--accent)', fontStyle: 'italic' }}
          >
            « {props.quote} »
            {props.quoteAuthor ? (
              <>
                <br />
                <small style={{ fontStyle: 'normal', color: 'var(--muted)' }}>
                  — {props.quoteAuthor}
                </small>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      <EditableImage
        sectionId={sectionId}
        field="imageUrl"
        value={props.imageUrl ?? null}
        edit={edit}
        label="Visuel"
      >
        <div className="two-col__visual reveal d2">
          {props.stamp ? (
            <div className="two-col__stamp">{props.stamp}</div>
          ) : null}
          {props.imageUrl ? (
            <img src={props.imageUrl} alt="" />
          ) : (
            <svg
              viewBox="0 0 800 1000"
              preserveAspectRatio="xMidYMid slice"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                background: 'linear-gradient(135deg, #1c1915, #0a0908)',
              }}
            >
              <text
                x="400"
                y="620"
                fontFamily="'Shippori Mincho', serif"
                fontSize="460"
                fill="#c9a96a"
                fillOpacity="0.12"
                textAnchor="middle"
                fontWeight="700"
              >
                流
              </text>
              <g
                stroke="#c9a96a"
                strokeOpacity="0.2"
                fill="none"
                strokeWidth="1"
              >
                <circle cx="400" cy="500" r="280" />
                <circle cx="400" cy="500" r="340" />
              </g>
            </svg>
          )}
        </div>
      </EditableImage>
    </section>
  );
}

export interface SksrStatsBandProps extends EditProps {
  items?: Array<{ value: number; label: string }>;
}

export function SksrStatsBand(props: SksrStatsBandProps) {
  const { sectionId, edit } = useEditIds(props);
  const items = props.items ?? [];
  return (
    <section className="stats-band">
      <EditableList
        sectionId={sectionId}
        listField="items"
        items={items}
        edit={edit}
        addLabel="Ajouter une stat"
        newItemTemplate={{ value: 0, label: '' }}
        itemSchema={[
          { key: 'value', label: 'Valeur (nombre)', type: 'number' },
          { key: 'label', label: 'Libellé' },
        ]}
      >
        <div className="stats-band__grid">
          {items.map((s, i) => (
            <div
              key={i}
              className={`stat reveal${i > 0 ? ' d' + i : ''}`}
            >
              <div className="stat__num">
                <CounterNumber target={Number(s.value) || 0} />
              </div>
              <div className="stat__lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </EditableList>
    </section>
  );
}

export interface SksrValuesProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  items?: Array<{ kanji: string; name: string; desc: string }>;
}

export function SksrValues(props: SksrValuesProps) {
  const { sectionId, edit } = useEditIds(props);
  const items = props.items ?? [];
  return (
    <section className="values">
      <div className="values__head">
        {props.label ? (
          <div className="section-label reveal">{props.label}</div>
        ) : null}
        <h2 className="section-title reveal d1">
          {props.title}
          <br />
          <em>{props.titleEm}</em>
        </h2>
      </div>
      <EditableList
        sectionId={sectionId}
        listField="items"
        items={items}
        edit={edit}
        addLabel="Ajouter une valeur"
        newItemTemplate={{ kanji: '', name: '', desc: '' }}
        itemSchema={[
          { key: 'kanji', label: 'Kanji' },
          { key: 'name', label: 'Nom (FR)' },
          { key: 'desc', label: 'Description', type: 'textarea' },
        ]}
      >
        <div className="values__grid">
          {items.map((v, i) => (
            <div key={i} className={`value reveal${i > 0 ? ' d' + i : ''}`}>
              <div className="value__kanji">{v.kanji}</div>
              <h3 className="value__name">{v.name}</h3>
              <p className="value__desc">{v.desc}</p>
            </div>
          ))}
        </div>
      </EditableList>
    </section>
  );
}
