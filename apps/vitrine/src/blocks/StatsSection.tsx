import { EditableList } from '@/components/edit/EditableList';
import type { EditContext } from '@/lib/edit-context';
import styles from './StatsSection.module.css';

export interface StatsSectionProps {
  items: Array<{ value: string; label: string }>;
  __editSectionId?: string;
  __edit?: EditContext;
}

export function StatsSection({
  items,
  __editSectionId,
  __edit,
}: StatsSectionProps) {
  const sectionId = __editSectionId ?? '';
  return (
    <section className={`section ${styles.stats}`}>
      <div className="container">
        <EditableList
          sectionId={sectionId}
          listField="items"
          items={items}
          edit={__edit}
          addLabel="Ajouter une stat"
          newItemTemplate={{ value: '0', label: '' }}
          itemSchema={[
            { key: 'value', label: 'Valeur' },
            { key: 'label', label: 'Libellé' },
          ]}
        >
          <div className={styles.grid}>
            {items.map((item, i) => (
              <div key={i} className={styles.item}>
                <span className={styles.value}>{item.value}</span>
                <span className={styles.label}>{item.label}</span>
              </div>
            ))}
          </div>
        </EditableList>
      </div>
    </section>
  );
}
