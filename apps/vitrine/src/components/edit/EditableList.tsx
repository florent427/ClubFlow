'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEditHistory } from './EditHistoryProvider';
import { makeEditRunner } from './edit-api';
import type { EditContext } from '@/lib/edit-context';

/**
 * Schéma d'un item éditable : un ou plusieurs champs saisissables.
 * Le type `field` reste volontairement plat (pas de nested) pour garder
 * l'UI simple. Les blocks déclinent ce schéma selon leur shape.
 */
export interface ItemFieldSchema {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'url';
  placeholder?: string;
}

interface Props {
  /** Children = rendu normal de la liste (server-side). */
  children: ReactNode;
  sectionId: string;
  listField: string;
  items: unknown[];
  /** Schéma de champ pour le popup d'édition. */
  itemSchema: ItemFieldSchema[];
  /** Valeurs par défaut pour un nouvel item. */
  newItemTemplate: Record<string, unknown>;
  /** Étiquette affichée à côté du bouton « + ». */
  addLabel?: string;
  edit?: EditContext;
}

/**
 * Wrapper d'édition pour une liste d'items (array) dans une section.
 *
 *  - Hors edit mode : rend juste `{children}`.
 *  - En edit mode : ajoute un bouton flottant « Modifier la liste » qui
 *    ouvre une modale permettant :
 *      - éditer les champs de chaque item via `itemSchema`
 *      - supprimer un item
 *      - réordonner (haut/bas)
 *      - ajouter un nouvel item (basé sur `newItemTemplate`)
 */
export function EditableList({
  children,
  sectionId,
  listField,
  items,
  itemSchema,
  newItemTemplate,
  addLabel = 'Ajouter',
  edit,
}: Props) {
  const [open, setOpen] = useState(false);
  if (!edit || !edit.editMode || !sectionId) {
    return <>{children}</>;
  }
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 2,
          background: 'var(--ink)',
          color: 'var(--accent)',
          border: '1px solid var(--accent)',
          padding: '4px 10px',
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          borderRadius: 999,
        }}
      >
        ✎ Liste
      </button>
      {open ? (
        <ListEditorModal
          onClose={() => setOpen(false)}
          edit={edit}
          sectionId={sectionId}
          listField={listField}
          items={items}
          itemSchema={itemSchema}
          newItemTemplate={newItemTemplate}
          addLabel={addLabel}
        />
      ) : null}
    </div>
  );
}

function ListEditorModal({
  onClose,
  edit,
  sectionId,
  listField,
  items,
  itemSchema,
  newItemTemplate,
  addLabel,
}: {
  onClose: () => void;
  edit: Extract<EditContext, { editMode: true }>;
  sectionId: string;
  listField: string;
  items: unknown[];
  itemSchema: ItemFieldSchema[];
  newItemTemplate: Record<string, unknown>;
  addLabel: string;
}) {
  const router = useRouter();
  const history = useEditHistory();
  const runner = useMemo(() => makeEditRunner(edit), [edit]);

  const [localItems, setLocalItems] = useState<unknown[]>(() => [...items]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(false);

  async function runMutation(
    query: string,
    vars: Record<string, unknown>,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await runner<unknown>(query, vars);
      history.push({ pageId: edit.pageId });
      savedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
    } finally {
      setBusy(false);
    }
  }

  async function updateItemField(
    index: number,
    fieldKey: string,
    value: unknown,
  ): Promise<void> {
    const next = [...localItems];
    const current = next[index];
    if (typeof current === 'object' && current !== null) {
      next[index] = { ...(current as object), [fieldKey]: value };
    } else {
      next[index] = value;
    }
    setLocalItems(next);
    await runMutation(UPDATE_ITEM, {
      input: {
        pageId: edit.pageId,
        sectionId,
        listField,
        index,
        patchJson: JSON.stringify({ [fieldKey]: value }),
      },
    });
  }

  async function addItem(): Promise<void> {
    const clone = JSON.parse(JSON.stringify(newItemTemplate));
    setLocalItems((prev) => [...prev, clone]);
    await runMutation(ADD_ITEM, {
      input: {
        pageId: edit.pageId,
        sectionId,
        listField,
        itemJson: JSON.stringify(clone),
      },
    });
  }

  async function removeItem(index: number): Promise<void> {
    setLocalItems((prev) => prev.filter((_, i) => i !== index));
    await runMutation(REMOVE_ITEM, {
      input: {
        pageId: edit.pageId,
        sectionId,
        listField,
        index,
      },
    });
  }

  async function move(from: number, to: number): Promise<void> {
    if (to < 0 || to >= localItems.length) return;
    const order = localItems.map((_, i) => i);
    const [picked] = order.splice(from, 1);
    order.splice(to, 0, picked!);
    const next = order.map((i) => localItems[i]);
    setLocalItems(next);
    await runMutation(REORDER, {
      input: {
        pageId: edit.pageId,
        sectionId,
        listField,
        newOrder: order,
      },
    });
  }

  function handleClose(): void {
    if (savedRef.current) router.refresh();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--ink)',
          color: 'var(--paper)',
          border: '1px solid var(--line-strong)',
          borderRadius: 8,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
          fontFamily: 'var(--sans)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--serif)',
              margin: 0,
              color: 'var(--accent)',
              letterSpacing: '0.1em',
            }}
          >
            Modifier la liste
          </h2>
          <button
            type="button"
            onClick={handleClose}
            style={iconBtnStyle}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        {error ? (
          <p style={{ color: 'var(--vermillion)' }}>{error}</p>
        ) : null}

        {localItems.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Aucun item pour l’instant.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {localItems.map((item, i) => (
              <li
                key={i}
                style={{
                  border: '1px solid var(--line)',
                  padding: 14,
                  marginBottom: 10,
                  borderRadius: 6,
                  background: 'var(--bg-2)',
                }}
              >
                <header
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <strong style={{ fontSize: 12, letterSpacing: '0.2em' }}>
                    #{i + 1}
                  </strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      disabled={busy || i === 0}
                      onClick={() => void move(i, i - 1)}
                      style={smallBtnStyle}
                      title="Monter"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === localItems.length - 1}
                      onClick={() => void move(i, i + 1)}
                      style={smallBtnStyle}
                      title="Descendre"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeItem(i)}
                      style={smallBtnStyle}
                      title="Supprimer"
                    >
                      ×
                    </button>
                  </div>
                </header>
                {itemSchema.map((field) => {
                  const raw =
                    typeof item === 'object' && item !== null
                      ? (item as Record<string, unknown>)[field.key]
                      : item;
                  const value = raw == null ? '' : String(raw);
                  return (
                    <label
                      key={field.key}
                      style={{
                        display: 'block',
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          letterSpacing: '0.25em',
                          textTransform: 'uppercase',
                          color: 'var(--muted)',
                          marginBottom: 4,
                        }}
                      >
                        {field.label}
                      </span>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          defaultValue={value}
                          placeholder={field.placeholder}
                          disabled={busy}
                          style={inputStyle}
                          onBlur={(e) => {
                            const next = e.currentTarget.value;
                            if (next !== value) {
                              void updateItemField(i, field.key, next);
                            }
                          }}
                        />
                      ) : (
                        <input
                          type={field.type ?? 'text'}
                          defaultValue={value}
                          placeholder={field.placeholder}
                          disabled={busy}
                          style={inputStyle}
                          onBlur={(e) => {
                            const next =
                              field.type === 'number'
                                ? Number(e.currentTarget.value)
                                : e.currentTarget.value;
                            if (next !== (raw ?? '')) {
                              void updateItemField(i, field.key, next);
                            }
                          }}
                        />
                      )}
                    </label>
                  );
                })}
              </li>
            ))}
          </ul>
        )}

        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 16,
            gap: 12,
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => void addItem()}
            style={primaryBtnStyle}
          >
            + {addLabel}
          </button>
          <button type="button" onClick={handleClose} style={ghostBtnStyle}>
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );
}

const UPDATE_ITEM = /* GraphQL */ `
  mutation UpdateItem($input: UpdateSectionListItemInput!) {
    updateSectionListItem(input: $input) {
      id
    }
  }
`;
const ADD_ITEM = /* GraphQL */ `
  mutation AddItem($input: AddSectionListItemInput!) {
    addSectionListItem(input: $input) {
      id
    }
  }
`;
const REMOVE_ITEM = /* GraphQL */ `
  mutation RemoveItem($input: RemoveSectionListItemInput!) {
    removeSectionListItem(input: $input) {
      id
    }
  }
`;
const REORDER = /* GraphQL */ `
  mutation ReorderItems($input: ReorderSectionListItemsInput!) {
    reorderSectionListItems(input: $input) {
      id
    }
  }
`;

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--muted)',
  fontSize: 22,
  cursor: 'pointer',
  padding: 0,
};
const smallBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--paper)',
  padding: '2px 8px',
  fontSize: 12,
  cursor: 'pointer',
  borderRadius: 999,
};
const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--ink)',
  border: 'none',
  padding: '8px 18px',
  fontSize: 11,
  letterSpacing: '0.25em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  borderRadius: 4,
};
const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line-strong)',
  color: 'var(--paper)',
  padding: '8px 18px',
  fontSize: 11,
  letterSpacing: '0.25em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  borderRadius: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--ink)',
  border: '1px solid var(--line)',
  color: 'var(--paper)',
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: 'var(--sans)',
};
