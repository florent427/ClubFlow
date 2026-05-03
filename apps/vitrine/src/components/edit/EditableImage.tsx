'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEditHistory } from './EditHistoryProvider';
import { MediaPickerModal } from './MediaPickerModal';
import { makeEditRunner } from './edit-api';
import type { EditContext } from '@/lib/edit-context';

interface Props {
  sectionId: string;
  /** Champ dot-path (ex. 'backgroundImageUrl'). */
  field: string;
  /** Valeur actuelle (ou null), utilisée uniquement pour mutation. */
  value: string | null;
  edit?: EditContext;
  /**
   * Rendu de l'image / du conteneur cible (server-side).
   *
   * Pourquoi `children` et pas une `renderView(url)` function prop ?
   * Les client components (le 'use client' ici) NE PEUVENT PAS recevoir
   * des fonctions depuis un server component — c'est une limitation
   * React Server Components (les props doivent être sérialisables).
   * On passe donc le markup déjà rendu.
   */
  children: ReactNode;
  /** Label hint sur le bouton d'édition flottant. */
  label?: string;
}

/**
 * Wrapper d'édition d'image. En mode visiteur, rend `children` tel quel
 * (aucun overhead). En mode édition, ajoute un bouton flottant « ✎ Image »
 * qui ouvre `MediaPickerModal`. La sélection envoie `updateVitrinePageSection`
 * avec le patch `{ [field]: url }`.
 */
export function EditableImage({
  sectionId,
  field,
  value,
  edit,
  children,
  label = 'Image',
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useEditHistory();
  const router = useRouter();

  const editOn = edit && edit.editMode && sectionId ? edit : null;
  const runner = useMemo(
    () => (editOn ? makeEditRunner(editOn) : null),
    [editOn],
  );

  async function save(url: string | null): Promise<void> {
    if (!runner || !editOn) return;
    setBusy(true);
    setError(null);
    try {
      const patch = buildPatch(field, url);
      await runner<unknown>(UPDATE_SECTION, {
        input: {
          pageId: editOn.pageId,
          sectionId,
          patchJson: JSON.stringify(patch),
        },
      });
      history.push({ pageId: editOn.pageId });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
    } finally {
      setBusy(false);
    }
  }

  if (!editOn) {
    return <>{children}</>;
  }

  return (
    <div style={{ position: 'relative' }}>
      {children}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 2,
          display: 'flex',
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
          style={buttonStyle()}
          title={`Modifier : ${label}`}
        >
          ✎ {label}
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => void save(null)}
            disabled={busy}
            style={buttonStyle()}
            title="Retirer l'image"
          >
            Retirer
          </button>
        ) : null}
      </div>
      {error ? (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            padding: '4px 10px',
            background: 'var(--vermillion)',
            color: '#fff',
            fontSize: 11,
          }}
        >
          {error}
        </div>
      ) : null}
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        edit={editOn}
        onPick={(asset) => void save(asset.publicUrl)}
      />
    </div>
  );
}

function buttonStyle(): React.CSSProperties {
  return {
    background: 'var(--ink)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    padding: '4px 10px',
    fontSize: 10,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    borderRadius: 999,
  };
}

function buildPatch(
  path: string,
  value: string | null,
): Record<string, unknown> {
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

const UPDATE_SECTION = /* GraphQL */ `
  mutation EditSectionImage($input: UpdateVitrinePageSectionInput!) {
    updateVitrinePageSection(input: $input) {
      id
    }
  }
`;
