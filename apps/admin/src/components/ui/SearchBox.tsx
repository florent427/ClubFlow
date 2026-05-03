export function SearchBox({
  value,
  onChange,
  placeholder = 'Rechercher…',
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="cf-searchbox">
      <span className="material-symbols-outlined cf-searchbox__ico" aria-hidden>
        search
      </span>
      <input
        type="search"
        className="cf-searchbox__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {value ? (
        <button
          type="button"
          className="cf-searchbox__clear"
          onClick={() => onChange('')}
          aria-label="Effacer"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      ) : null}
    </label>
  );
}
