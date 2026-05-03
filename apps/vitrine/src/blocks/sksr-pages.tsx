/**
 * Blocks SKSR — 2ème vague : cours (planning), dojo (intro/spec/equipment/
 * etiquette), tarifs, équipe, galerie, actualités, compétitions, contact.
 */

import Link from 'next/link';
import { EditableText } from '@/components/edit/EditableText';
import { EditableImage } from '@/components/edit/EditableImage';
import { EditableList } from '@/components/edit/EditableList';
import { CounterNumber } from '@/components/sksr/CounterNumber';
import { SksrPlanningGrid } from '@/components/sksr/SksrPlanningGrid';
import { SksrGalleryGrid } from '@/components/sksr/SksrGalleryGrid';
import { ContactForm } from '@/components/ContactForm';
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
// COURS — planning grid (6 jours × tranches horaires) + disciplines
// ============================================================================

export interface SksrPlanningProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  slots?: Array<{
    day: number;
    hourIdx: number;
    span: number;
    type: string;
    name: string;
    meta: string;
  }>;
}

export function SksrPlanning(props: SksrPlanningProps) {
  const { sectionId, edit } = useEditIds(props);
  const slots = props.slots ?? [];
  return (
    <section className="planning">
      <div className="planning__head">
        <div className="reveal">
          {props.label ? (
            <EditableText
              className="section-label"
              sectionId={sectionId}
              field="label"
              value={props.label}
              edit={edit}
            />
          ) : null}
          {props.title || props.titleEm ? (
            <h2 className="section-title">
              {props.title ? (
                <EditableText
                  sectionId={sectionId}
                  field="title"
                  value={props.title}
                  edit={edit}
                />
              ) : null}
              {props.titleEm ? (
                <>
                  <br />
                  <EditableText
                    as="em"
                    sectionId={sectionId}
                    field="titleEm"
                    value={props.titleEm}
                    edit={edit}
                  />
                </>
              ) : null}
            </h2>
          ) : null}
        </div>
      </div>
      <EditableList
        sectionId={sectionId}
        listField="slots"
        items={slots}
        edit={edit}
        addLabel="Ajouter un créneau"
        newItemTemplate={{
          day: 0,
          hourIdx: 0,
          span: 4,
          type: 'adults',
          name: '',
          meta: '',
        }}
        itemSchema={[
          { key: 'day', label: 'Jour (0=Lun … 5=Sam)' },
          { key: 'hourIdx', label: 'Index horaire' },
          { key: 'span', label: 'Durée (×15min)' },
          { key: 'type', label: 'Type (mini/junior/teens/adults/masters/cross/athle/comp)' },
          { key: 'name', label: 'Nom' },
          { key: 'meta', label: 'Méta (horaire, tranche d\u2019âge…)' },
        ]}
      >
        <SksrPlanningGrid slots={slots} />
      </EditableList>
      <div className="legend reveal d4">
        <div className="legend__item">
          <span className="legend__swatch" style={{ background: '#c9a96a' }} />
          Baby Karaté 4–5
        </div>
        <div className="legend__item">
          <span className="legend__swatch" style={{ background: '#b2332a' }} />
          Enfants 6–12
        </div>
        <div className="legend__item">
          <span className="legend__swatch" style={{ background: '#4a7ca8' }} />
          Ados 13–17
        </div>
        <div className="legend__item">
          <span className="legend__swatch" style={{ background: '#e8c97a' }} />
          Adultes
        </div>
        <div className="legend__item">
          <span className="legend__swatch" style={{ background: '#ffffff' }} />
          Adultes avancés
        </div>
        <div className="legend__item">
          <span className="legend__swatch" style={{ background: '#2a8c5f' }} />
          Cross Training
        </div>
        <div className="legend__item">
          <span className="legend__swatch" style={{ background: '#d94c3f' }} />
          Compétition
        </div>
      </div>
    </section>
  );
}

export interface SksrDisciplinesProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  items?: Array<{
    kanji: string;
    name: string;
    nameSub: string;
    desc: string;
    level: string;
  }>;
}

export function SksrDisciplines(props: SksrDisciplinesProps) {
  const { sectionId, edit } = useEditIds(props);
  const items = props.items ?? [];
  return (
    <section className="disciplines">
      <div className="disciplines__head">
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
        addLabel="Ajouter une discipline"
        newItemTemplate={{
          kanji: '',
          name: '',
          nameSub: '',
          desc: '',
          level: '',
        }}
        itemSchema={[
          { key: 'kanji', label: 'Kanji' },
          { key: 'name', label: 'Nom (FR)' },
          { key: 'nameSub', label: 'Sous-titre' },
          { key: 'desc', label: 'Description', type: 'textarea' },
          { key: 'level', label: 'Niveau requis' },
        ]}
      >
        <div className="disciplines__list">
          {items.map((d, i) => (
            <div
              key={i}
              className={`disc reveal${i > 0 ? ' d' + i : ''}`}
            >
              <div className="disc__kanji">{d.kanji}</div>
              <div className="disc__name">
                {d.name}
                <small>{d.nameSub}</small>
              </div>
              <div className="disc__desc">{d.desc}</div>
              <div className="disc__level">{d.level}</div>
            </div>
          ))}
        </div>
      </EditableList>
    </section>
  );
}

// ============================================================================
// DOJO — dojo-intro, spec, equipment, etiquette
// ============================================================================

export interface SksrDojoIntroProps extends EditProps {
  imageUrl?: string | null;
  stamp?: string;
  label?: string;
  title?: string;
  titleEm?: string;
  paragraphs?: string[];
}

export function SksrDojoIntro(props: SksrDojoIntroProps) {
  const { sectionId, edit } = useEditIds(props);
  const paragraphs = props.paragraphs ?? [];
  return (
    <section className="dojo-intro">
      <EditableImage
        sectionId={sectionId}
        field="imageUrl"
        value={props.imageUrl ?? null}
        edit={edit}
        label="Image dojo"
      >
        <div className="dojo-intro__img reveal">
          {props.stamp ? <div className="dojo-intro__stamp">{props.stamp}</div> : null}
          {props.imageUrl ? <img src={props.imageUrl} alt="Dojo" /> : null}
        </div>
      </EditableImage>
      <div className="reveal d1">
        {props.label ? (
          <div className="section-label">{props.label}</div>
        ) : null}
        <h2 className="section-title">
          {props.title}
          <br />
          <em>{props.titleEm}</em>
        </h2>
        <EditableList
          sectionId={sectionId}
          listField="paragraphs"
          items={paragraphs}
          edit={edit}
          addLabel="Ajouter un paragraphe"
          newItemTemplate={{ value: '' }}
          itemSchema={[{ key: 'value', label: 'Texte', type: 'textarea' }]}
        >
          <>
            {paragraphs.map((p, i) => (
              <p key={i}>
                {typeof p === 'string'
                  ? p
                  : (p as { value?: string }).value ?? ''}
              </p>
            ))}
          </>
        </EditableList>
      </div>
    </section>
  );
}

export interface SksrSpecProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  cards?: Array<{
    icon: string;
    value: string;
    valueUnit?: string;
    label: string;
    desc: string;
  }>;
}

export function SksrSpec(props: SksrSpecProps) {
  const { sectionId, edit } = useEditIds(props);
  const cards = props.cards ?? [];
  return (
    <section className="spec">
      <div className="spec__head">
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
        listField="cards"
        items={cards}
        edit={edit}
        addLabel="Ajouter une spec"
        newItemTemplate={{ icon: '', value: '', valueUnit: '', label: '', desc: '' }}
        itemSchema={[
          { key: 'icon', label: 'Icône (kanji)' },
          { key: 'value', label: 'Valeur' },
          { key: 'valueUnit', label: 'Unité (optionnel)' },
          { key: 'label', label: 'Libellé' },
          { key: 'desc', label: 'Description', type: 'textarea' },
        ]}
      >
        <div className="spec__grid">
          {cards.map((c, i) => (
            <div
              key={i}
              className={`spec-card reveal${i > 0 ? ' d' + i : ''}`}
            >
              <div className="spec-card__icon">{c.icon}</div>
              <div className="spec-card__val">
                {c.value}
                {c.valueUnit ? <small>{c.valueUnit}</small> : null}
              </div>
              <div className="spec-card__lbl">{c.label}</div>
              <div className="spec-card__desc">{c.desc}</div>
            </div>
          ))}
        </div>
      </EditableList>
    </section>
  );
}

export interface SksrEquipmentProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  items?: Array<{
    kanjiBg: string;
    tag: string;
    name: string;
    desc: string;
  }>;
}

export function SksrEquipment(props: SksrEquipmentProps) {
  const { sectionId, edit } = useEditIds(props);
  const items = props.items ?? [];
  return (
    <section className="equipment">
      <div className="equipment__head">
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
        addLabel="Ajouter un équipement"
        newItemTemplate={{ kanjiBg: '', tag: '', name: '', desc: '' }}
        itemSchema={[
          { key: 'kanjiBg', label: 'Kanji de fond' },
          { key: 'tag', label: 'Tag (kanji · nom)' },
          { key: 'name', label: 'Nom' },
          { key: 'desc', label: 'Description', type: 'textarea' },
        ]}
      >
        <div className="equip-grid">
          {items.map((e, i) => (
            <div
              key={i}
              className={`equip reveal${i > 0 ? ' d' + i : ''}`}
            >
              <svg
                viewBox="0 0 800 600"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  width: '100%',
                  height: 260,
                  display: 'block',
                  background: 'linear-gradient(135deg, #1a1410 0%, #2a1f18 100%)',
                }}
              >
                <text
                  x="400"
                  y="380"
                  textAnchor="middle"
                  fontFamily="serif"
                  fontSize="260"
                  fill="#c9a96a"
                  fillOpacity="0.5"
                >
                  {e.kanjiBg}
                </text>
              </svg>
              <div className="equip__info">
                <div className="equip__tag">{e.tag}</div>
                <div className="equip__name">{e.name}</div>
                <div className="equip__desc">{e.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </EditableList>
    </section>
  );
}

export interface SksrEtiquetteProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  rules?: Array<{ num: string; text: string }>;
}

export function SksrEtiquette(props: SksrEtiquetteProps) {
  const { sectionId, edit } = useEditIds(props);
  const rules = props.rules ?? [];
  return (
    <section className="etiquette">
      <div className="etiquette__inner">
        {props.label ? (
          <div
            className="section-label"
            style={{ color: 'var(--accent)', justifyContent: 'center' }}
          >
            {props.label}
          </div>
        ) : null}
        <h2>
          {props.title} <em>{props.titleEm}</em>
        </h2>
        <EditableList
          sectionId={sectionId}
          listField="rules"
          items={rules}
          edit={edit}
          addLabel="Ajouter une règle"
          newItemTemplate={{ num: '', text: '' }}
          itemSchema={[
            { key: 'num', label: 'Numéro (01…)' },
            { key: 'text', label: 'Texte (HTML <strong> supporté)', type: 'textarea' },
          ]}
        >
          <ol className="etiquette__list">
            {rules.map((r, i) => (
              <li key={i}>
                <span className="etiquette__num">{r.num}</span>
                <p
                  className="etiquette__text"
                  dangerouslySetInnerHTML={{ __html: r.text }}
                />
              </li>
            ))}
          </ol>
        </EditableList>
      </div>
    </section>
  );
}

// ============================================================================
// TARIFS — cards + info-band + inscription steps
// ============================================================================

export interface SksrTarifsProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  cards?: Array<{
    kanji: string;
    age: string;
    name: string;
    priceMonthly: number;
    priceAnnual: number;
    features: string[];
    ctaLabel: string;
    ctaHref: string;
    featured?: boolean;
  }>;
}

export function SksrTarifs(props: SksrTarifsProps) {
  const cards = props.cards ?? [];
  return (
    <section className="tarifs">
      <div className="tarifs__head">
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
      </div>
      <div className="tarifs__grid">
        {cards.map((c, i) => (
          <div
            key={i}
            className={`card-tarif${c.featured ? ' featured' : ''} reveal${i > 0 ? ' d' + i : ''}`}
          >
            <div className="card-tarif__kanji">{c.kanji}</div>
            <div className="card-tarif__age">{c.age}</div>
            <h3 className="card-tarif__name">{c.name}</h3>
            <div className="card-tarif__price">
              <span className="val">{c.priceMonthly}</span>
              <small>€</small>
            </div>
            <div className="card-tarif__period">Par mois</div>
            <ul className="card-tarif__list">
              {c.features.map((f, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: f }} />
              ))}
            </ul>
            <a
              href={c.ctaHref}
              target="_blank"
              rel="noopener"
              className="card-tarif__cta"
            >
              {c.ctaLabel}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface SksrInfoBandProps extends EditProps {
  items?: Array<{ title: string; text: string }>;
}

export function SksrInfoBand(props: SksrInfoBandProps) {
  const items = props.items ?? [];
  return (
    <section className="info-band">
      <div className="info-band__grid">
        {items.map((it, i) => (
          <div
            key={i}
            className={`info-item reveal${i > 0 ? ' d' + i : ''}`}
          >
            <h3>{it.title}</h3>
            <p>{it.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface SksrInscriptionProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  steps?: Array<{ num: string; title: string; desc: string }>;
}

export function SksrInscription(props: SksrInscriptionProps) {
  const steps = props.steps ?? [];
  return (
    <section className="inscription">
      <div className="inscription__head">
        {props.label ? (
          <div className="section-label reveal">{props.label}</div>
        ) : null}
        <h2 className="section-title reveal d1">
          {props.title} <em>{props.titleEm}</em>
        </h2>
      </div>
      <div className="steps">
        {steps.map((s, i) => (
          <div key={i} className={`step reveal${i > 0 ? ' d' + i : ''}`}>
            <div className="step__num">{s.num}</div>
            <div className="step__title">{s.title}</div>
            <p className="step__desc" dangerouslySetInnerHTML={{ __html: s.desc }} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// ÉQUIPE — sensei (hero), teachers (cards), lineage
// ============================================================================

export interface SksrSenseiProps extends EditProps {
  imageUrl?: string | null;
  stamp?: string;
  rank?: string;
  nameFirst?: string;
  nameLast?: string;
  title?: string;
  bioParagraphs?: string[];
  meta?: Array<{ val: string; lbl: string }>;
}

export function SksrSensei(props: SksrSenseiProps) {
  const { sectionId, edit } = useEditIds(props);
  const bioParagraphs = props.bioParagraphs ?? [];
  return (
    <section className="team-grid">
      <div className="sensei reveal">
        <EditableImage
          sectionId={sectionId}
          field="imageUrl"
          value={props.imageUrl ?? null}
          edit={edit}
          label="Portrait"
        >
          <div className="sensei__portrait">
            {props.stamp ? <div className="sensei__stamp">{props.stamp}</div> : null}
            {props.imageUrl ? <img src={props.imageUrl} alt="" /> : null}
          </div>
        </EditableImage>
        <div>
          {props.rank ? <div className="sensei__rank">{props.rank}</div> : null}
          <h2 className="sensei__name">
            {props.nameFirst} <em>{props.nameLast}</em>
          </h2>
          {props.title ? <p className="sensei__title">{props.title}</p> : null}
          <EditableList
            sectionId={sectionId}
            listField="bioParagraphs"
            items={bioParagraphs}
            edit={edit}
            addLabel="Ajouter un paragraphe"
            newItemTemplate={{ value: '' }}
            itemSchema={[
              { key: 'value', label: 'Paragraphe (HTML <strong> supporté)', type: 'textarea' },
            ]}
          >
            <>
              {bioParagraphs.map((p, i) => (
                <p
                  key={i}
                  className="sensei__bio"
                  dangerouslySetInnerHTML={{
                    __html:
                      typeof p === 'string'
                        ? p
                        : (p as { value?: string }).value ?? '',
                  }}
                />
              ))}
            </>
          </EditableList>
          {props.meta && props.meta.length > 0 ? (
            <div className="sensei__meta">
              {props.meta.map((m, i) => (
                <div key={i} className="sensei__meta-item">
                  <div className="sensei__meta-val">{m.val}</div>
                  <div className="sensei__meta-lbl">{m.lbl}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export interface SksrTeachersProps extends EditProps {
  groupLabel?: string;
  groupTitle?: string;
  groupTitleEm?: string;
  groupLead?: string;
  teachers?: Array<{
    rankLabel: string;
    imageUrl?: string | null;
    kanjiBg?: string;
    name: string;
    role: string;
    bio: string;
  }>;
}

export function SksrTeachers(props: SksrTeachersProps) {
  const teachers = props.teachers ?? [];
  return (
    <section className="team-grid" style={{ paddingTop: 0 }}>
      {props.groupTitle ? (
        <div
          style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            marginBottom: 32,
          }}
          className="reveal"
        >
          {props.groupLabel ? (
            <div
              className="section-label"
              style={{ justifyContent: 'center' }}
            >
              {props.groupLabel}
            </div>
          ) : null}
          <h2 className="section-title">
            {props.groupTitle} <em>{props.groupTitleEm}</em>
          </h2>
          {props.groupLead ? (
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 18,
                color: 'var(--muted)',
                maxWidth: 620,
                margin: '18px auto 0',
              }}
            >
              {props.groupLead}
            </p>
          ) : null}
        </div>
      ) : null}
      {teachers.map((t, i) => (
        <div key={i} className={`teacher reveal${i > 0 ? ' d' + i : ''}`}>
          <div className="teacher__portrait">
            <span className="teacher__rank">{t.rankLabel}</span>
            {t.imageUrl ? (
              <img src={t.imageUrl} alt={t.name} />
            ) : (
              <svg
                viewBox="0 0 600 700"
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
                  x="300"
                  y="460"
                  fontFamily="'Shippori Mincho', serif"
                  fontSize="340"
                  fill="#c9a96a"
                  fillOpacity="0.14"
                  textAnchor="middle"
                  fontWeight="700"
                >
                  {t.kanjiBg ?? '心'}
                </text>
              </svg>
            )}
          </div>
          <h3 className="teacher__name">{t.name}</h3>
          <p className="teacher__role">{t.role}</p>
          <p
            className="teacher__bio"
            dangerouslySetInnerHTML={{ __html: t.bio }}
          />
        </div>
      ))}
    </section>
  );
}

export interface SksrLineageProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  lead?: string;
  nodes?: Array<{ name: string; dates: string; rank: string }>;
}

export function SksrLineage(props: SksrLineageProps) {
  const nodes = props.nodes ?? [];
  return (
    <section className="lineage">
      <div className="lineage__kanji">系</div>
      <div className="lineage__inner">
        {props.label ? (
          <div
            className="section-label"
            style={{ color: 'var(--accent)', justifyContent: 'center' }}
          >
            {props.label}
          </div>
        ) : null}
        <h2 className="section-title" style={{ color: 'var(--paper)' }}>
          {props.title} <em>{props.titleEm}</em>
        </h2>
        {props.lead ? (
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 18,
              color: 'color-mix(in oklab, var(--paper) 70%, transparent)',
              maxWidth: 640,
              margin: '24px auto 0',
            }}
          >
            {props.lead}
          </p>
        ) : null}
        <div className="lineage__chain">
          {nodes.map((n, i) => (
            <>
              <div key={`n${i}`} className="lineage__node">
                <div className="lineage__node-name">{n.name}</div>
                <div className="lineage__node-dates">{n.dates}</div>
                <div className="lineage__node-rank">{n.rank}</div>
              </div>
              {i < nodes.length - 1 ? (
                <div key={`a${i}`} className="lineage__arrow">
                  →
                </div>
              ) : null}
            </>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// GALERIE — masonry + lightbox (via composant client)
// ============================================================================

export interface SksrGalleryProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  photos?: Array<{
    url: string;
    size: 1 | 2 | 3 | 4 | 5 | 6;
    tag: string;
    title: string;
    label?: string;
  }>;
  filters?: Array<{ id: string; label: string }>;
}

export function SksrGallery(props: SksrGalleryProps) {
  const { sectionId, edit } = useEditIds(props);
  const photos = props.photos ?? [];
  const filters = props.filters?.map((f) => ({ key: f.id, label: f.label }));
  const galleryPhotos = photos.map((p, i) => ({
    id: `p-${i}`,
    url: p.url,
    title: p.title,
    label: p.label ?? null,
    tag: p.tag,
    size: p.size,
  }));
  return (
    <section className="gallery">
      <div className="gallery__head">
        <div className="reveal">
          {props.label ? (
            <EditableText
              className="section-label"
              sectionId={sectionId}
              field="label"
              value={props.label}
              edit={edit}
            />
          ) : null}
          {props.title || props.titleEm ? (
            <h2 className="section-title">
              {props.title ? (
                <EditableText
                  sectionId={sectionId}
                  field="title"
                  value={props.title}
                  edit={edit}
                />
              ) : null}
              {props.titleEm ? (
                <>
                  <br />
                  <EditableText
                    as="em"
                    sectionId={sectionId}
                    field="titleEm"
                    value={props.titleEm}
                    edit={edit}
                  />
                </>
              ) : null}
            </h2>
          ) : null}
        </div>
      </div>
      <EditableList
        sectionId={sectionId}
        listField="photos"
        items={photos}
        edit={edit}
        addLabel="Ajouter une photo"
        newItemTemplate={{ url: '', size: 1, tag: 'dojo', title: '', label: '' }}
        itemSchema={[
          { key: 'url', label: 'URL image' },
          { key: 'size', label: 'Taille (1–6)' },
          { key: 'tag', label: 'Catégorie (dojo/kata/kumite/compet/stage)' },
          { key: 'title', label: 'Titre' },
          { key: 'label', label: 'Légende' },
        ]}
      >
        <SksrGalleryGrid photos={galleryPhotos} filters={filters} />
      </EditableList>
    </section>
  );
}

// ============================================================================
// ACTUALITES — news__featured + news__grid + calendar
// ============================================================================

export interface SksrNewsProps extends EditProps {
  featured?: {
    date: string;
    title: string;
    excerpt: string;
    tag: string;
    kanjiBg?: string;
    href: string;
    coverImageUrl?: string | null;
  };
  cards?: Array<{
    date: string;
    title: string;
    excerpt: string;
    tag: string;
    kanjiBg?: string;
    href: string;
    coverImageUrl?: string | null;
  }>;
}

export function SksrNews(props: SksrNewsProps) {
  const cards = props.cards ?? [];
  return (
    <section className="news">
      {props.featured ? (
        <div className="news__featured reveal">
          <div className="news__featured-img">
            <span className="news__featured-tag">{props.featured.tag}</span>
            {props.featured.coverImageUrl ? (
              <img src={props.featured.coverImageUrl} alt={props.featured.title} />
            ) : (
              <svg
                viewBox="0 0 800 600"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  background: 'linear-gradient(135deg, #1a1410, #2a1f18)',
                }}
              >
                <text
                  x="400"
                  y="390"
                  textAnchor="middle"
                  fontFamily="serif"
                  fontSize="280"
                  fill="#c9a96a"
                  fillOpacity="0.5"
                >
                  {props.featured.kanjiBg ?? '金'}
                </text>
              </svg>
            )}
          </div>
          <div className="news__featured-content">
            <div className="news__featured-date">{props.featured.date}</div>
            <h2 className="news__featured-title">{props.featured.title}</h2>
            <p className="news__featured-excerpt">{props.featured.excerpt}</p>
            <a
              href={props.featured.href}
              target="_blank"
              rel="noopener"
              className="btn"
              style={{ alignSelf: 'start' }}
            >
              En savoir plus
            </a>
          </div>
        </div>
      ) : null}
      <div className="news__grid">
        {cards.map((c, i) => (
          <article
            key={i}
            className={`news-card reveal${i > 0 ? ' d' + i : ''}`}
          >
            <div className="news-card__img">
              <span className="news-card__tag">{c.tag}</span>
              {c.coverImageUrl ? (
                <img src={c.coverImageUrl} alt={c.title} />
              ) : (
                <svg
                  viewBox="0 0 800 600"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    background: 'linear-gradient(135deg, #1a1410, #2a1f18)',
                  }}
                >
                  <text
                    x="400"
                    y="390"
                    textAnchor="middle"
                    fontFamily="serif"
                    fontSize="280"
                    fill="#c9a96a"
                    fillOpacity="0.5"
                  >
                    {c.kanjiBg ?? '新'}
                  </text>
                </svg>
              )}
            </div>
            <div className="news-card__date">{c.date}</div>
            <h3 className="news-card__title">{c.title}</h3>
            <p className="news-card__excerpt">{c.excerpt}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export interface SksrCalendarProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  note?: string;
  events?: Array<{
    day: string;
    month: string;
    title: string;
    meta: string;
    desc: string;
    tag: string;
  }>;
}

export function SksrCalendar(props: SksrCalendarProps) {
  const events = props.events ?? [];
  return (
    <section className="calendar">
      <div className="calendar__head">
        {props.label ? (
          <div className="section-label reveal">{props.label}</div>
        ) : null}
        <h2 className="section-title reveal d1">
          {props.title}
          <br />
          <em>{props.titleEm}</em>
        </h2>
      </div>
      <div className="calendar__list">
        {props.note ? (
          <p
            className="reveal"
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 12,
              color: 'var(--muted)',
              fontStyle: 'italic',
              marginBottom: 24,
            }}
          >
            {props.note}
          </p>
        ) : null}
        {events.map((e, i) => (
          <div
            key={i}
            className={`cal-event reveal${i > 0 ? ' d' + i : ''}`}
          >
            <div className="cal-event__date">
              <div className="cal-event__day">{e.day}</div>
              <div className="cal-event__month">{e.month}</div>
            </div>
            <div>
              <div className="cal-event__title">{e.title}</div>
              <div className="cal-event__meta">{e.meta}</div>
            </div>
            <div className="cal-event__desc">{e.desc}</div>
            <div className="cal-event__tag">{e.tag}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// COMPETITIONS — palmares (3 médailles), results (table), champs-band
// ============================================================================

export interface SksrPalmaresProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  gold?: { kanji: string; count: number; label: string };
  silver?: { kanji: string; count: number; label: string };
  bronze?: { kanji: string; count: number; label: string };
}

export function SksrPalmares(props: SksrPalmaresProps) {
  const medals: Array<{
    kind: 'gold' | 'silver' | 'bronze';
    data?: { kanji: string; count: number; label: string };
  }> = [
    { kind: 'gold', data: props.gold },
    { kind: 'silver', data: props.silver },
    { kind: 'bronze', data: props.bronze },
  ];
  return (
    <section className="palmares">
      <div className="palmares__head">
        {props.label ? (
          <div className="section-label reveal">{props.label}</div>
        ) : null}
        <h2 className="section-title reveal d1">
          {props.title}
          <br />
          <em>{props.titleEm}</em>
        </h2>
      </div>
      <div className="medals">
        {medals
          .filter((m): m is { kind: 'gold' | 'silver' | 'bronze'; data: NonNullable<typeof m.data> } => Boolean(m.data))
          .map((m, i) => (
            <div
              key={m.kind}
              className={`medal reveal${i > 0 ? ' d' + i : ''}`}
            >
              <div className={`medal__circle ${m.kind}`}>{m.data.kanji}</div>
              <div className="medal__count">
                <CounterNumber target={m.data.count} />
              </div>
              <div className="medal__label">{m.data.label}</div>
            </div>
          ))}
      </div>
    </section>
  );
}

export interface SksrResultsProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  note?: string;
  rows?: Array<{
    year: string;
    name: string;
    event: string;
    cat: string;
    place: string;
    placeClass: 'gold' | 'silver' | 'bronze';
  }>;
}

export function SksrResults(props: SksrResultsProps) {
  const { sectionId, edit } = useEditIds(props);
  const rows = props.rows ?? [];
  return (
    <section className="results">
      {props.label ? (
        <div
          className="section-label reveal"
          style={{ marginBottom: 20 }}
        >
          {props.label}
        </div>
      ) : null}
      <h2
        className="section-title reveal d1"
        style={{ marginBottom: 40 }}
      >
        {props.title} <em>{props.titleEm}</em>
      </h2>
      {props.note ? (
        <p
          className="reveal d1"
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 12,
            color: 'var(--muted)',
            fontStyle: 'italic',
            marginBottom: 40,
            maxWidth: 600,
          }}
        >
          {props.note}
        </p>
      ) : null}
      <EditableList
        sectionId={sectionId}
        listField="rows"
        items={rows}
        edit={edit}
        addLabel="Ajouter un résultat"
        newItemTemplate={{
          year: '',
          name: '',
          event: '',
          cat: '',
          place: '',
          placeClass: 'gold',
        }}
        itemSchema={[
          { key: 'year', label: 'Année' },
          { key: 'name', label: 'Nom' },
          { key: 'event', label: 'Événement' },
          { key: 'cat', label: 'Catégorie' },
          { key: 'place', label: 'Place (ex. 1er, 2e)' },
          { key: 'placeClass', label: 'Classe (gold/silver/bronze)' },
        ]}
      >
        <>
          {rows.map((r, i) => (
            <div key={i} className="result-row reveal">
              <div className="result-year">{r.year}</div>
              <div className="result-name">{r.name}</div>
              <div className="result-event">{r.event}</div>
              <div className="result-cat">{r.cat}</div>
              <div
                className={`result-place ${r.placeClass}`}
                dangerouslySetInnerHTML={{ __html: r.place }}
              />
            </div>
          ))}
        </>
      </EditableList>
    </section>
  );
}

export interface SksrChampsBandProps extends EditProps {
  label?: string;
  titleLines?: string[];
  paragraphs?: string[];
}

export function SksrChampsBand(props: SksrChampsBandProps) {
  const { sectionId, edit } = useEditIds(props);
  const paragraphs = props.paragraphs ?? [];
  return (
    <section className="champs-band">
      <div className="champs-band__inner">
        <div className="reveal">
          {props.label ? (
            <div
              className="section-label"
              style={{ color: 'var(--accent)' }}
            >
              {props.label}
            </div>
          ) : null}
          <h2
            dangerouslySetInnerHTML={{
              __html: (props.titleLines ?? []).join('<br>'),
            }}
          />
        </div>
        <div className="reveal d1">
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
                <p key={i} style={{ marginBottom: 20 }}>
                  {typeof p === 'string'
                    ? p
                    : (p as { value?: string }).value ?? ''}
                </p>
              ))}
            </>
          </EditableList>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CONTACT — .contact (info + form) + .map
// ============================================================================

export interface SksrContactProps extends EditProps {
  label?: string;
  title?: string;
  titleEm?: string;
  lead?: string;
  items?: Array<{ key: string; value: string; sub?: string; href?: string }>;
  formTitle?: string;
  formSub?: string;
  clubSlug: string;
}

export function SksrContact(props: SksrContactProps) {
  const items = props.items ?? [];
  return (
    <section className="contact">
      <div className="contact__info reveal">
        {props.label ? (
          <div className="section-label">{props.label}</div>
        ) : null}
        <h2>
          {props.title} <em>{props.titleEm}</em>
        </h2>
        {props.lead ? (
          <p className="contact__lead">{props.lead}</p>
        ) : null}
        {items.map((it, i) => (
          <div key={i} className="contact__item">
            <div className="contact__item-lbl">{it.key}</div>
            <div
              className="contact__item-val"
              dangerouslySetInnerHTML={{
                __html:
                  (it.href
                    ? `<a href="${it.href}">${it.value}</a>`
                    : it.value) +
                  (it.sub ? `<small>${it.sub}</small>` : ''),
              }}
            />
          </div>
        ))}
      </div>
      <div className="reveal d1" style={{ padding: 0 }}>
        <div className="form">
          <h3>{props.formTitle ?? 'Nous écrire'}</h3>
          <p className="sub">
            {props.formSub ?? 'Remplissez le formulaire — un instructeur vous contactera rapidement.'}
          </p>
          <ContactForm clubSlug={props.clubSlug} />
        </div>
      </div>
    </section>
  );
}

export interface SksrMapProps extends EditProps {
  mapEmbedUrl?: string;
  addr?: string;
  stamp?: string;
  links?: Array<{ label: string; href: string }>;
}

export function SksrMap(props: SksrMapProps) {
  const links = props.links ?? [];
  return (
    <section className="map">
      <div className="map__canvas">
        {props.mapEmbedUrl ? (
          <iframe
            src={props.mapEmbedUrl}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Carte"
          />
        ) : null}
      </div>
      <div className="map__overlay">
        {props.stamp ? (
          <h3>
            SKSR · <em>{props.stamp}</em>
          </h3>
        ) : null}
        {props.addr ? (
          <div
            className="addr"
            dangerouslySetInnerHTML={{ __html: props.addr }}
          />
        ) : null}
        <div className="links">
          {links.map((l, i) => (
            <a key={i} href={l.href} target="_blank" rel="noopener">
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
