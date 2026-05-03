import { SectionHeader } from './SectionHeader';
import { EditableList } from '@/components/edit/EditableList';
import type { EditContext } from '@/lib/edit-context';

export interface RichTextSectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  paragraphs?: string[];
  items?: string[];
  align?: 'left' | 'center';
  __editSectionId?: string;
  __edit?: EditContext;
}

export function RichTextSection({
  label,
  title,
  titleEm,
  paragraphs,
  items,
  align = 'left',
  __editSectionId,
  __edit,
}: RichTextSectionProps) {
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
            align={align}
            sectionId={sectionId}
            edit={edit}
          />
        ) : null}
        <div
          style={{
            maxWidth: 720,
            margin: align === 'center' ? '0 auto' : undefined,
          }}
        >
          <EditableList
            sectionId={sectionId}
            listField="paragraphs"
            items={paragraphs ?? []}
            edit={edit}
            addLabel="Ajouter un paragraphe"
            newItemTemplate={{ value: '' }}
            itemSchema={[
              { key: 'value', label: 'Paragraphe', type: 'textarea' },
            ]}
          >
            <>
              {paragraphs?.map((p, i) => (
                <p
                  key={i}
                  style={{ lineHeight: 1.8, color: 'var(--muted)' }}
                >
                  {typeof p === 'string'
                    ? p
                    : (p as { value?: string }).value ?? ''}
                </p>
              ))}
            </>
          </EditableList>
          {items && items.length > 0 ? (
            <EditableList
              sectionId={sectionId}
              listField="items"
              items={items}
              edit={edit}
              addLabel="Ajouter un item"
              newItemTemplate={{ value: '' }}
              itemSchema={[{ key: 'value', label: 'Item' }]}
            >
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '24px 0 0',
                  display: 'grid',
                  gap: 12,
                }}
              >
                {items.map((it, i) => (
                  <li
                    key={i}
                    style={{
                      paddingLeft: 28,
                      position: 'relative',
                      color: 'var(--muted)',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '0.65em',
                        width: 16,
                        height: 1,
                        background: 'var(--accent)',
                      }}
                    />
                    {typeof it === 'string'
                      ? it
                      : (it as { value?: string }).value ?? ''}
                  </li>
                ))}
              </ul>
            </EditableList>
          ) : null}
        </div>
      </div>
    </section>
  );
}
