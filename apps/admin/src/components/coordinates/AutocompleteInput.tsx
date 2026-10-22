import { useEffect, useId, useRef, useState } from 'react';

/**
 * Champ texte libre avec suggestions (API publique interrogée après une
 * pause de frappe). La saisie libre reste toujours possible : choisir une
 * suggestion n'est qu'un raccourci.
 */
export function AutocompleteInput<T>({
  id,
  value,
  onChange,
  fetchSuggestions,
  getKey,
  renderLabel,
  onPick,
  minChars = 3,
  debounceMs = 250,
  placeholder,
  autoComplete = 'off',
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  fetchSuggestions: (q: string, signal: AbortSignal) => Promise<T[]>;
  getKey: (item: T) => string;
  renderLabel: (item: T) => string;
  onPick: (item: T) => void;
  minChars?: number;
  debounceMs?: number;
  placeholder?: string;
  autoComplete?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /** Ne chercher qu'après une frappe : pas au remplissage initial ni après un choix. */
  const [query, setQuery] = useState<string | null>(null);
  const fetchRef = useRef(fetchSuggestions);
  useEffect(() => {
    fetchRef.current = fetchSuggestions;
  });

  useEffect(() => {
    if (query === null) return;
    const q = query.trim();
    if (q.length < minChars) {
      setItems([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetchRef
        .current(q, ctrl.signal)
        .then((res) => {
          setItems(res);
          setActive(-1);
          setOpen(res.length > 0);
        })
        .catch(() => {
          // Réseau coupé ou requête annulée : la saisie libre suffit.
        });
    }, debounceMs);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query, minChars, debounceMs]);

  function pick(item: T) {
    onPick(item);
    setQuery(null);
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="cf-autocomplete">
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
      />
      {open ? (
        <ul className="cf-autocomplete__list" role="listbox" id={listId}>
          {items.map((item, i) => (
            <li
              key={getKey(item)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={
                i === active
                  ? 'cf-autocomplete__item cf-autocomplete__item--active'
                  : 'cf-autocomplete__item'
              }
              // mousedown plutôt que click : passe avant le blur du champ.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {renderLabel(item)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
