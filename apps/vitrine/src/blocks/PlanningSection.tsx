import { SectionHeader } from './SectionHeader';
import { EditableList } from '@/components/edit/EditableList';
import type { EditContext } from '@/lib/edit-context';
import styles from './PlanningSection.module.css';

export interface PlanningSlot {
  day: string;
  time: string;
  title: string;
  audience?: string;
  location?: string;
}

export interface PlanningSectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  intro?: string;
  slots: PlanningSlot[];
  __editSectionId?: string;
  __edit?: EditContext;
}

export function PlanningSection({
  label,
  title,
  titleEm,
  intro,
  slots,
  __editSectionId,
  __edit,
}: PlanningSectionProps) {
  const sectionId = __editSectionId ?? '';
  const edit = __edit;
  const byDay = slots.reduce<Record<string, PlanningSlot[]>>((acc, s) => {
    acc[s.day] = acc[s.day] ?? [];
    acc[s.day]!.push(s);
    return acc;
  }, {});

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
          listField="slots"
          items={slots}
          edit={edit}
          addLabel="Ajouter un créneau"
          newItemTemplate={{
            day: 'Lundi',
            time: '18:00 – 19:30',
            title: '',
            audience: '',
          }}
          itemSchema={[
            { key: 'day', label: 'Jour' },
            { key: 'time', label: 'Horaire' },
            { key: 'title', label: 'Titre' },
            { key: 'audience', label: 'Public' },
            { key: 'location', label: 'Lieu' },
          ]}
        >
          <div className={styles.days}>
            {Object.entries(byDay).map(([day, list]) => (
              <div key={day} className={styles.day}>
                <h3 className={styles.dayTitle}>{day}</h3>
                <ul className={styles.slots}>
                  {list.map((s, i) => (
                    <li key={`${day}-${i}`} className={styles.slot}>
                      <span className={styles.time}>{s.time}</span>
                      <div>
                        <strong>{s.title}</strong>
                        <div className={styles.meta}>
                          {[s.audience, s.location]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </EditableList>
      </div>
    </section>
  );
}
