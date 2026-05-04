import { useState } from 'react';

/**
 * Input mot de passe avec bouton "👁 / 🙈" pour show/hide la valeur.
 *
 * Wrapper léger autour de <input type="password|text"> sans dépendance UI.
 * Préserve les attrs autoComplete / required / minLength via props passe-plat.
 */
type Props = {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoFocus?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
};

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  maxLength,
  autoFocus,
  placeholder,
  id,
  name,
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="cf-password-input">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        autoFocus={autoFocus}
        placeholder={placeholder}
        id={id}
        name={name}
      />
      <button
        type="button"
        className="cf-password-input__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        title={visible ? 'Masquer' : 'Afficher'}
        tabIndex={-1}
      >
        {visible ? '🙈' : '👁'}
      </button>
      <style>{`
        .cf-password-input {
          position: relative;
          display: flex;
          align-items: stretch;
        }
        .cf-password-input input {
          flex: 1;
          padding-right: 2.4rem;
        }
        .cf-password-input__toggle {
          position: absolute;
          right: 0.4rem;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: 0;
          color: inherit;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          font-size: 1rem;
          opacity: 0.7;
          line-height: 1;
        }
        .cf-password-input__toggle:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
