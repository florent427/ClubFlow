import { ContactForm } from '../components/ContactForm';
import { SectionHeader } from './SectionHeader';
import { EditableList } from '@/components/edit/EditableList';
import { EditableText } from '@/components/edit/EditableText';
import type { EditContext } from '@/lib/edit-context';
import styles from './ContactSection.module.css';

export interface ContactSectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  intro?: string;
  infoCards?: Array<{
    label: string;
    value: string;
    href?: string;
  }>;
  mapEmbedUrl?: string;
  clubSlug: string;
  __editSectionId?: string;
  __edit?: EditContext;
}

export function ContactSection({
  label,
  title,
  titleEm,
  intro,
  infoCards,
  mapEmbedUrl,
  clubSlug,
  __editSectionId,
  __edit,
}: ContactSectionProps) {
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
        <div className={styles.grid}>
          <div className={styles.info}>
            <EditableList
              sectionId={sectionId}
              listField="infoCards"
              items={infoCards ?? []}
              edit={edit}
              addLabel="Ajouter une info"
              newItemTemplate={{ label: '', value: '', href: '' }}
              itemSchema={[
                { key: 'label', label: 'Label' },
                { key: 'value', label: 'Valeur', type: 'textarea' },
                { key: 'href', label: 'Lien (optionnel)' },
              ]}
            >
              <>
                {(infoCards ?? []).map((card, i) => (
                  <div key={i} className={styles.infoCard}>
                    <dt>{card.label}</dt>
                    <dd>
                      {card.href ? (
                        <a href={card.href}>{card.value}</a>
                      ) : (
                        <span style={{ whiteSpace: 'pre-line' }}>
                          {card.value}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </>
            </EditableList>
            {mapEmbedUrl ? (
              <iframe
                src={mapEmbedUrl}
                className={styles.map}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Localisation"
              />
            ) : null}
            {edit?.editMode && mapEmbedUrl !== undefined ? (
              <EditableText
                as="small"
                sectionId={sectionId}
                field="mapEmbedUrl"
                value={mapEmbedUrl ?? ''}
                edit={edit}
                placeholder="URL d'intégration de carte"
              />
            ) : null}
          </div>
          <ContactForm clubSlug={clubSlug} />
        </div>
      </div>
    </section>
  );
}
