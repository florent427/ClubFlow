'use client';

import { useEffect, useState } from 'react';

export interface LightboxPhoto {
  url: string;
  title: string;
  label?: string | null;
}

interface Props {
  photos: LightboxPhoto[];
  /** Indice cliqué, ou null si fermé. */
  openIndex: number | null;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}

/**
 * Lightbox fidèle au comportement SKSR :
 *  - overlay plein écran noir 90%
 *  - image contenue (max 90vw × 80vh)
 *  - boutons prev / next / close
 *  - clavier : Escape / ArrowLeft / ArrowRight
 *  - clic sur le fond = ferme
 */
export function Lightbox({
  photos,
  openIndex,
  onClose,
  onNavigate,
}: Props) {
  const current = openIndex !== null ? photos[openIndex] : null;

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(openIndex! - 1);
      if (e.key === 'ArrowRight') onNavigate(openIndex! + 1);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [openIndex, onClose, onNavigate]);

  if (openIndex === null || !current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="lightbox open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in oklab, #000 90%, transparent)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        style={closeBtnStyle}
      >
        ×
      </button>
      <button
        type="button"
        aria-label="Précédent"
        onClick={() => onNavigate(openIndex - 1)}
        style={{ ...navBtnStyle, left: 24 }}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Suivant"
        onClick={() => onNavigate(openIndex + 1)}
        style={{ ...navBtnStyle, right: 24 }}
      >
        ›
      </button>
      <img
        src={current.url}
        alt={current.title}
        style={{
          maxWidth: '90vw',
          maxHeight: '80vh',
          objectFit: 'contain',
          boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#fff',
          textAlign: 'center',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            margin: '0 0 4px',
            fontWeight: 400,
          }}
        >
          {current.title}
        </h3>
        {current.label ? (
          <p
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 11,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: '#c9a96a',
              margin: 0,
            }}
          >
            {current.label}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 24,
  right: 24,
  background: 'none',
  border: '1px solid rgba(255,255,255,0.3)',
  color: '#fff',
  width: 48,
  height: 48,
  cursor: 'pointer',
  fontSize: 20,
};

const navBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: '1px solid rgba(255,255,255,0.3)',
  color: '#fff',
  width: 52,
  height: 52,
  cursor: 'pointer',
  fontSize: 22,
  fontFamily: 'var(--serif)',
};
