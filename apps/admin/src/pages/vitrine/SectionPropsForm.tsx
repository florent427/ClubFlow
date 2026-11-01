import { useState } from 'react';
import { AdminMediaPicker } from './AdminMediaPicker';
import {
  emptyLike,
  fieldLabel,
  isLongText,
  isMediaField,
  itemSummary,
  moveItem,
  orderedEntries,
  removeItem,
} from './section-form';

interface FieldProps {
  name: string;
  value: unknown;
  parentKey?: string;
  onChange: (value: unknown) => void;
}

/**
 * Formulaire des `props` d'une section, déduit de leur forme : texte court
 * ou long, nombre, case à cocher, image (médiathèque), groupe de champs et
 * liste d'éléments à ajouter, retirer ou déplacer.
 */
export function SectionPropsForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  return (
    <ObjectFields
      value={value}
      onChange={(v) => onChange(v as Record<string, unknown>)}
    />
  );
}

function ObjectFields({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
}) {
  const entries = orderedEntries(value);
  if (entries.length === 0) {
    return <p className="muted vpe-empty">Aucun champ à modifier.</p>;
  }
  return (
    <div className="vpe-fields">
      {entries.map(([key, v]) => (
        <Field
          key={key}
          name={key}
          value={v}
          onChange={(next) => onChange({ ...value, [key]: next })}
        />
      ))}
    </div>
  );
}

function Field({ name, value, parentKey, onChange }: FieldProps) {
  if (Array.isArray(value)) {
    return <ListField name={name} value={value} onChange={onChange} />;
  }
  if (value && typeof value === 'object') {
    return (
      <fieldset className="vpe-group">
        <legend>{fieldLabel(name)}</legend>
        <ObjectFields
          value={value as Record<string, unknown>}
          onChange={onChange}
        />
      </fieldset>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{fieldLabel(name)}</span>
      </label>
    );
  }
  if (typeof value === 'number') {
    return (
      <label className="field">
        <span>{fieldLabel(name)}</span>
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.valueAsNumber || 0)}
        />
      </label>
    );
  }
  const text = typeof value === 'string' ? value : '';
  if (isMediaField(name, parentKey)) {
    return <MediaField name={name} value={text} onChange={onChange} />;
  }
  return (
    <label className="field">
      <span>{fieldLabel(name)}</span>
      {isLongText(name, text) ? (
        <textarea
          value={text}
          rows={Math.min(8, Math.max(3, Math.ceil(text.length / 70)))}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function MediaField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="field vpe-media">
      <span>{fieldLabel(name)}</span>
      <div className="vpe-media__row">
        <div className="vpe-media__thumb">
          {value ? <img src={value} alt="" loading="lazy" /> : null}
        </div>
        <div className="vpe-media__actions">
          <button
            type="button"
            className="btn btn-tight"
            onClick={() => setPicking(true)}
          >
            {value ? 'Remplacer…' : 'Choisir une image…'}
          </button>
          {value ? (
            <button
              type="button"
              className="btn btn-ghost btn-tight"
              onClick={() => onChange('')}
            >
              Retirer
            </button>
          ) : null}
          <input
            type="text"
            value={value}
            aria-label={`${fieldLabel(name)} (adresse)`}
            placeholder="ou collez une adresse d'image"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
      <AdminMediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(asset) => {
          onChange(asset.publicUrl);
          setPicking(false);
        }}
      />
    </div>
  );
}

function ListField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: unknown[];
  onChange: (value: unknown) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const objects = value.some((v) => v && typeof v === 'object');

  function add(): void {
    const template = value.length > 0 ? emptyLike(value[0]) : '';
    onChange([...value, template]);
    setOpen(value.length);
  }

  // L'élément ouvert suit son déplacement.
  function move(from: number, to: number): void {
    onChange(moveItem(value, from, to));
    if (open === from) setOpen(to);
    else if (open === to) setOpen(from);
  }

  return (
    <fieldset className="vpe-group vpe-list">
      <legend>
        {fieldLabel(name)} <small className="muted">({value.length})</small>
      </legend>
      {value.map((item, i) => {
        const tools = (
          <span className="vpe-list__tools">
            <button
              type="button"
              className="vpe-icon"
              aria-label="Monter"
              title="Monter"
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="vpe-icon"
              aria-label="Descendre"
              title="Descendre"
              disabled={i === value.length - 1}
              onClick={() => move(i, i + 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="vpe-icon vpe-icon--danger"
              aria-label="Supprimer"
              title="Supprimer"
              onClick={() => {
                if (window.confirm(`Supprimer « ${itemSummary(item, i)} » ?`)) {
                  onChange(removeItem(value, i));
                  setOpen(null);
                }
              }}
            >
              ×
            </button>
          </span>
        );
        const setItem = (next: unknown) =>
          onChange(value.map((v, j) => (j === i ? next : v)));
        if (!objects) {
          return (
            <div key={i} className="vpe-list__row">
              <Field
                name={`${fieldLabel(name)} ${i + 1}`}
                value={item}
                parentKey={name}
                onChange={setItem}
              />
              {tools}
            </div>
          );
        }
        const isOpen = open === i;
        return (
          <div key={i} className={`vpe-item${isOpen ? ' is-open' : ''}`}>
            <div className="vpe-item__head">
              <button
                type="button"
                className="vpe-item__toggle"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>{' '}
                {itemSummary(item, i)}
              </button>
              {tools}
            </div>
            {isOpen ? (
              <div className="vpe-item__body">
                <ItemFields item={item} parentKey={name} onChange={setItem} />
              </div>
            ) : null}
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost btn-tight" onClick={add}>
        + Ajouter
      </button>
    </fieldset>
  );
}

/** Champs d'un élément de liste : `parentKey` sert à reconnaître `photos[i].url`. */
function ItemFields({
  item,
  parentKey,
  onChange,
}: {
  item: unknown;
  parentKey: string;
  onChange: (value: unknown) => void;
}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return (
      <Field name="value" value={item} parentKey={parentKey} onChange={onChange} />
    );
  }
  const obj = item as Record<string, unknown>;
  return (
    <div className="vpe-fields">
      {orderedEntries(obj).map(([key, v]) => (
          <Field
            key={key}
            name={key}
            value={v}
            parentKey={parentKey}
            onChange={(next) => onChange({ ...obj, [key]: next })}
          />
        ))}
    </div>
  );
}
