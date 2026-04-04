import { useMutation, useQuery } from '@apollo/client/react';
import { useCallback, useMemo, useState } from 'react';
import {
  ARCHIVE_MEMBER_CUSTOM_FIELD_DEFINITION,
  CLUB_MEMBER_FIELD_LAYOUT,
  CREATE_MEMBER_CUSTOM_FIELD_DEFINITION,
  UPDATE_MEMBER_CUSTOM_FIELD_DEFINITION,
  UPSERT_CLUB_MEMBER_CATALOG_FIELD_SETTINGS,
} from '../../lib/documents';
import { MEMBER_CATALOG_FIELD_LABELS } from '../../lib/member-field-labels';
import type { MemberFieldLayoutQueryData } from '../../lib/types';

const CUSTOM_TYPES = [
  { value: 'TEXT', label: 'Texte court' },
  { value: 'TEXT_LONG', label: 'Texte long' },
  { value: 'NUMBER', label: 'Nombre' },
  { value: 'DATE', label: 'Date' },
  { value: 'BOOLEAN', label: 'Oui / Non' },
  { value: 'SELECT', label: 'Liste' },
] as const;

type CatalogSettingRow =
  MemberFieldLayoutQueryData['clubMemberFieldLayout']['catalogSettings'][number];

function CatalogLayoutSection({
  initialRows,
  savingCatalog,
  onUpsert,
}: {
  initialRows: CatalogSettingRow[];
  savingCatalog: boolean;
  onUpsert: (
    items: Array<{
      fieldKey: string;
      showOnForm: boolean;
      required: boolean;
      sortOrder: number;
    }>,
  ) => Promise<unknown>;
}) {
  const [catalogDraft, setCatalogDraft] = useState(() =>
    initialRows.map((x) => ({ ...x })),
  );

  const sortedCatalog = useMemo(
    () =>
      [...catalogDraft].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.fieldKey.localeCompare(b.fieldKey),
      ),
    [catalogDraft],
  );

  const updateCatalogRow = useCallback(
    (
      fieldKey: string,
      patch: Partial<{
        showOnForm: boolean;
        required: boolean;
        sortOrder: number;
      }>,
    ) => {
      setCatalogDraft((prev) =>
        prev.map((r) => (r.fieldKey === fieldKey ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  async function saveCatalog(e: React.FormEvent) {
    e.preventDefault();
    await onUpsert(
      catalogDraft.map((r) => ({
        fieldKey: r.fieldKey,
        showOnForm: r.showOnForm,
        required: r.required,
        sortOrder: r.sortOrder,
      })),
    );
  }

  return (
    <form className="members-form" onSubmit={(e) => void saveCatalog(e)}>
      <div className="members-table-wrap">
        <table className="members-table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Afficher</th>
              <th>Obligatoire</th>
              <th>Ordre</th>
            </tr>
          </thead>
          <tbody>
            {sortedCatalog.map((r) => (
              <tr key={r.fieldKey}>
                <td>
                  <strong>
                    {MEMBER_CATALOG_FIELD_LABELS[r.fieldKey] ?? r.fieldKey}
                  </strong>
                </td>
                <td>
                  <label className="field field--checkbox">
                    <input
                      type="checkbox"
                      checked={r.showOnForm}
                      onChange={(e) =>
                        updateCatalogRow(r.fieldKey, {
                          showOnForm: e.target.checked,
                        })
                      }
                    />
                  </label>
                </td>
                <td>
                  <label className="field field--checkbox">
                    <input
                      type="checkbox"
                      checked={r.required}
                      onChange={(e) =>
                        updateCatalogRow(r.fieldKey, {
                          required: e.target.checked,
                        })
                      }
                    />
                  </label>
                </td>
                <td>
                  <input
                    type="number"
                    className="settings-order-input"
                    value={r.sortOrder}
                    onChange={(e) =>
                      updateCatalogRow(r.fieldKey, {
                        sortOrder: Number(e.target.value) || 0,
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={savingCatalog}
      >
        {savingCatalog ? 'Enregistrement…' : 'Enregistrer le catalogue'}
      </button>
    </form>
  );
}

export function MemberFieldsSettingsPage() {
  const { data, loading, error, refetch } =
    useQuery<MemberFieldLayoutQueryData>(CLUB_MEMBER_FIELD_LAYOUT);

  const [upsertCatalog, { loading: savingCatalog }] = useMutation(
    UPSERT_CLUB_MEMBER_CATALOG_FIELD_SETTINGS,
    {
      onCompleted: () => void refetch(),
    },
  );

  const [createDef] = useMutation(CREATE_MEMBER_CUSTOM_FIELD_DEFINITION, {
    onCompleted: () => {
      void refetch();
      setNewCode('');
      setNewLabel('');
      setNewType('TEXT');
      setNewOptions('');
      setNewRequired(false);
      setNewVisibleMember(false);
    },
  });

  const [updateDef] = useMutation(UPDATE_MEMBER_CUSTOM_FIELD_DEFINITION, {
    onCompleted: () => void refetch(),
  });

  const [archiveDef] = useMutation(ARCHIVE_MEMBER_CUSTOM_FIELD_DEFINITION, {
    onCompleted: () => void refetch(),
  });

  const defs =
    data?.clubMemberFieldLayout?.customFieldDefinitions.slice().sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'fr'),
    ) ?? [];

  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<string>('TEXT');
  const [newOptions, setNewOptions] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [newVisibleMember, setNewVisibleMember] = useState(false);

  const cat = data?.clubMemberFieldLayout?.catalogSettings;
  const catalogSyncKey = useMemo(
    () =>
      JSON.stringify(
        (cat ?? []).map((r) => [
          r.fieldKey,
          r.showOnForm,
          r.required,
          r.sortOrder,
        ]),
      ),
    [cat],
  );

  async function addCustomField(e: React.FormEvent) {
    e.preventDefault();
    let optionsJson: string | undefined;
    if (newType === 'SELECT') {
      const lines = newOptions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      optionsJson = JSON.stringify(lines);
    }
    await createDef({
      variables: {
        input: {
          code: newCode,
          label: newLabel,
          type: newType,
          required: newRequired,
          sortOrder: defs.length * 10,
          visibleToMember: newVisibleMember,
          ...(optionsJson ? { optionsJson } : {}),
        },
      },
    });
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Paramètres</p>
        <h1 className="members-loom__title">Fiche adhérent</h1>
        <p className="members-loom__lede">
          Sur la fiche : photo en tête (fichier ou appareil photo), puis
          civilité, nom, prénom et e-mail ; ci-dessous, les autres champs du
          catalogue. La ligne « URL photo » règle l’affichage catalogue et
          l’obligation côté serveur, sans dupliquer le bloc photo du haut.
        </p>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        <section className="members-panel">
          <h2 className="members-panel__h">Champs du catalogue</h2>
          {loading ? (
            <p className="muted">Chargement…</p>
          ) : error ? (
            <p className="form-error">{error.message}</p>
          ) : cat ? (
            <CatalogLayoutSection
              key={catalogSyncKey}
              initialRows={cat}
              savingCatalog={savingCatalog}
              onUpsert={(items) =>
                upsertCatalog({
                  variables: { items },
                })
              }
            />
          ) : null}
        </section>

        <section className="members-panel">
          <h2 className="members-panel__h">Champs personnalisés</h2>
          <p className="muted members-form__hint">
            Types : texte, nombre, date, booléen (true/false), liste (une option
            par ligne). « Visible adhérent » prépare le portail membre.
          </p>

          <ul className="settings-custom-list">
            {defs.map((d) => (
              <li key={d.id} className="settings-custom-item">
                <CustomFieldRow
                  key={`${d.id}|${d.label}|${d.type}|${d.required}|${d.sortOrder}|${d.visibleToMember}|${d.optionsJson ?? ''}`}
                  definition={d}
                  onSave={async (patch) => {
                    await updateDef({
                      variables: { input: { id: d.id, ...patch } },
                    });
                  }}
                  onArchive={async () => {
                    if (
                      !window.confirm(
                        `Archiver le champ « ${d.label} » ? Les valeurs existantes restent en base ; le champ ne sera plus proposé.`,
                      )
                    ) {
                      return;
                    }
                    await archiveDef({ variables: { id: d.id } });
                  }}
                />
              </li>
            ))}
          </ul>

          <h3 className="members-groups__h">Nouveau champ</h3>
          <form className="members-form" onSubmit={(e) => void addCustomField(e)}>
            <label className="field">
              <span>Code (slug unique)</span>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="no_licence"
                required
              />
            </label>
            <label className="field">
              <span>Libellé</span>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Type</span>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                {CUSTOM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {newType === 'SELECT' ? (
              <label className="field">
                <span>Options (une par ligne)</span>
                <textarea
                  value={newOptions}
                  onChange={(e) => setNewOptions(e.target.value)}
                  rows={4}
                  placeholder="Option A&#10;Option B"
                />
              </label>
            ) : null}
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
              />
              <span>Obligatoire</span>
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={newVisibleMember}
                onChange={(e) => setNewVisibleMember(e.target.checked)}
              />
              <span>Visible par l’adhérent (portail)</span>
            </label>
            <button type="submit" className="btn btn-primary">
              Ajouter le champ
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

function CustomFieldRow({
  definition: d,
  onSave,
  onArchive,
}: {
  definition: MemberFieldLayoutQueryData['clubMemberFieldLayout']['customFieldDefinitions'][0];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const [label, setLabel] = useState(d.label);
  const [type, setType] = useState(d.type);
  const [required, setRequired] = useState(d.required);
  const [sortOrder, setSortOrder] = useState(d.sortOrder);
  const [visible, setVisible] = useState(d.visibleToMember);
  const [options, setOptions] = useState(() => {
    try {
      if (!d.optionsJson) return '';
      const arr = JSON.parse(d.optionsJson) as unknown;
      return Array.isArray(arr) ? (arr as string[]).join('\n') : '';
    } catch {
      return '';
    }
  });

  return (
    <div className="settings-custom-edit">
      <div className="settings-custom-edit__head">
        <code className="settings-custom-code">{d.code}</code>
        <button
          type="button"
          className="btn btn-ghost btn-tight members-table__danger"
          onClick={() => void onArchive()}
        >
          Archiver
        </button>
      </div>
      <div className="settings-fields-inline">
        <label className="field">
          <span>Libellé</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {CUSTOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Ordre</span>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </label>
        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span>Obligatoire</span>
        </label>
        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          <span>Visible adhérent</span>
        </label>
      </div>
      {type === 'SELECT' ? (
        <label className="field">
          <span>Options (une par ligne)</span>
          <textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            rows={3}
          />
        </label>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-tight"
        onClick={() =>
          void onSave({
            label,
            type,
            required,
            sortOrder,
            visibleToMember: visible,
            ...(type === 'SELECT'
              ? {
                  optionsJson: JSON.stringify(
                    options
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ),
                }
              : { optionsJson: null }),
          })
        }
      >
        Enregistrer
      </button>
    </div>
  );
}
