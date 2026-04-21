'use client';

import { useRef, useState } from 'react';
import type { ElementType } from 'react';
import { useEditHistory } from './EditHistoryProvider';
import { extractClubIdFromJwt } from './edit-api';
import type { EditContext } from '@/lib/edit-context';

interface Props {
  /** ID de la section vitrine (UUID). */
  sectionId: string;
  /**
   * Chemin du champ dans les props de la section. Pour un champ simple :
   * `'title'`. Pour un champ imbriqué : `'ctaPrimary.label'` (dot-path).
   */
  field: string;
  /** Valeur initiale rendue. */
  value: string;
  /** Contexte d'édition (JWT, pageId, apiUrl) — absent hors edit mode. */
  edit?: EditContext;
  /** Tag HTML utilisé pour rendre le texte (défaut : <span>). */
  as?: ElementType;
  className?: string;
  placeholder?: string;
}

/**
 * Composant texte éditable en place.
 *
 * - Hors edit mode : rend un simple `<Tag>{value}</Tag>`, aucun JS client.
 * - En edit mode : rend un élément `contentEditable` ; au blur (sortie de
 *   focus), on envoie une mutation `updateVitrinePageSection` à l'API avec
 *   le patch JSON calculé depuis le `field` (dot-path).
 *
 * Les erreurs réseau sont silencieuses et signalées via un toast/outline
 * rouge. L'utilisateur voit immédiatement l'état (optimistic UI).
 */
export function EditableText({
  sectionId,
  field,
  value,
  edit,
  as: Tag = 'span',
  className,
  placeholder,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const history = useEditHistory();

  if (!edit || !edit.editMode || !sectionId) {
    return (
      <Tag className={className}>
        {value || placeholder || ''}
      </Tag>
    );
  }
  // Narrowing en variable locale pour que les closures `save` et `onBlur`
  // gardent l'info que `edit` est bien en mode édition.
  const editOn = edit;

  async function save(nextValue: string): Promise<void> {
    setError(null);
    try {
      const patch = buildPatch(field, nextValue);
      const query = /* GraphQL */ `
        mutation EditSection($input: UpdateVitrinePageSectionInput!) {
          updateVitrinePageSection(input: $input) {
            id
            sectionsJson
            updatedAt
          }
        }
      `;
      const res = await fetch(editOn.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editOn.editJwt}`,
          'X-Club-Id': extractClubIdFromJwt(editOn.editJwt) ?? '',
        },
        body: JSON.stringify({
          query,
          variables: {
            input: {
              pageId: editOn.pageId,
              sectionId,
              patchJson: JSON.stringify(patch),
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        errors?: Array<{ message: string }>;
        data?: unknown;
      };
      if (json.errors) {
        throw new Error(json.errors.map((e) => e.message).join(' · '));
      }
      history.push({ pageId: editOn.pageId });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
    }
  }

  return (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-edit-field={field}
      data-error={error ? 'true' : undefined}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = e.currentTarget.textContent ?? '';
        if (next !== value) void save(next);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          e.currentTarget.textContent = value;
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      style={{
        outline: error
          ? '2px solid var(--vermillion)'
          : savedFlash
            ? '2px solid var(--accent)'
            : undefined,
        transition: savedFlash ? 'outline-color 250ms ease' : undefined,
      }}
    >
      {value || placeholder || ''}
    </Tag>
  );
}

/** Convertit `'ctaPrimary.label'` + value en objet `{ ctaPrimary: { label: value } }`. */
function buildPatch(path: string, value: string): Record<string, unknown> {
  const keys = path.split('.');
  const out: Record<string, unknown> = {};
  let cursor: Record<string, unknown> = out;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]!;
    if (i === keys.length - 1) {
      cursor[k] = value;
    } else {
      cursor[k] = {};
      cursor = cursor[k] as Record<string, unknown>;
    }
  }
  return out;
}

// extractClubIdFromJwt factorisé dans ./edit-api.ts

