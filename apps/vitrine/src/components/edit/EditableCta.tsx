'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EditableText } from './EditableText';
import type { EditContext } from '@/lib/edit-context';
import { makeEditRunner } from './edit-api';

interface Props {
  sectionId: string;
  /** Préfixe du champ dans les props (ex. `'ctaPrimary'` → `ctaPrimary.label` et `ctaPrimary.href`). */
  prefix: string;
  label: string;
  href: string;
  edit?: EditContext;
  className?: string;
}

/**
 * CTA (bouton-lien) avec label et URL éditables.
 *
 * En lecture seule : rend un `<Link>` standard.
 * En édition : rend un `<span>` avec :
 *   - label éditable inline (via `EditableText`)
 *   - bouton « URL » qui ouvre un prompt pour modifier le href
 */
export function EditableCta({
  sectionId,
  prefix,
  label,
  href,
  edit,
  className,
}: Props) {
  const editOn = edit && edit.editMode && sectionId ? edit : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function editHref(): Promise<void> {
    if (!editOn) return;
    const next = window.prompt('Lien (href) :', href);
    if (next === null || next.trim() === href) return;
    setSaving(true);
    setError(null);
    try {
      const runner = makeEditRunner(editOn);
      await runner<unknown>(
        /* GraphQL */ `
          mutation EditCtaHref($input: UpdateVitrinePageSectionInput!) {
            updateVitrinePageSection(input: $input) {
              id
            }
          }
        `,
        {
          input: {
            pageId: editOn.pageId,
            sectionId,
            patchJson: JSON.stringify({ [prefix]: { href: next.trim() } }),
          },
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
    } finally {
      setSaving(false);
    }
  }

  if (!editOn) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        position: 'relative',
      }}
    >
      <EditableText
        sectionId={sectionId}
        field={`${prefix}.label`}
        value={label}
        edit={edit}
      />
      <button
        type="button"
        onClick={() => void editHref()}
        disabled={saving}
        title={`Lien : ${href}`}
        style={{
          background: 'transparent',
          border: '1px solid var(--line)',
          color: 'var(--accent)',
          fontSize: 9,
          padding: '1px 6px',
          borderRadius: 999,
          cursor: 'pointer',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        URL
      </button>
      {error ? (
        <span
          style={{
            color: 'var(--vermillion)',
            fontSize: 10,
            marginLeft: 6,
          }}
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
