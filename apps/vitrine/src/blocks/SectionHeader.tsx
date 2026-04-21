import { EditableText } from '@/components/edit/EditableText';
import type { EditContext } from '@/lib/edit-context';

export interface SectionHeaderProps {
  label?: string;
  title: string;
  titleEm?: string;
  intro?: string;
  align?: 'left' | 'center';
  /** Section id + edit context si SectionHeader est rendu depuis un block parent. */
  sectionId?: string;
  edit?: EditContext;
}

export function SectionHeader({
  label,
  title,
  titleEm,
  intro,
  align = 'left',
  sectionId,
  edit,
}: SectionHeaderProps) {
  const id = sectionId ?? '';
  return (
    <header
      className="reveal in"
      style={{
        textAlign: align,
        maxWidth: align === 'center' ? 720 : undefined,
        margin: align === 'center' ? '0 auto 48px' : '0 0 48px',
      }}
    >
      {label ? (
        <EditableText
          as="span"
          className="section-label"
          sectionId={id}
          field="label"
          value={label}
          edit={edit}
        />
      ) : null}
      <h2 className="section-title">
        <EditableText sectionId={id} field="title" value={title} edit={edit} />
        {titleEm ? (
          <>
            {' '}
            <EditableText
              as="em"
              sectionId={id}
              field="titleEm"
              value={titleEm}
              edit={edit}
            />
          </>
        ) : null}
      </h2>
      {intro ? (
        <EditableText
          as="p"
          sectionId={id}
          field="intro"
          value={intro}
          edit={edit}
        />
      ) : null}
    </header>
  );
}
