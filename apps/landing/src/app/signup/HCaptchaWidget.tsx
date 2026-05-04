'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Widget hCaptcha auto-chargé via CDN. Pas de dépendance npm.
 *
 * - Si `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` est défini → affiche le widget,
 *   appelle `onToken(token)` quand l'utilisateur passe le challenge.
 * - Si non défini (dev local) → render rien, appelle `onToken('')`
 *   pour signaler "captcha skipped".
 *
 * Doc hCaptcha : https://docs.hcaptcha.com/configuration
 */

declare global {
  interface Window {
    hcaptcha?: {
      render: (container: HTMLElement, opts: HCaptchaOptions) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

interface HCaptchaOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  size?: 'normal' | 'compact' | 'invisible';
  theme?: 'light' | 'dark';
}

type Props = {
  onToken: (token: string) => void;
  onExpired?: () => void;
  theme?: 'light' | 'dark';
};

const SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js?render=explicit';

export function HCaptchaWidget({ onToken, onExpired, theme = 'dark' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

  // Si pas de site key → captcha désactivé (dev local), notifie immédiatement
  useEffect(() => {
    if (!siteKey) {
      onToken('');
    }
  }, [siteKey, onToken]);

  // Charger le script hCaptcha (1 seule fois pour toute la page)
  useEffect(() => {
    if (!siteKey) return;
    if (window.hcaptcha) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${SCRIPT_URL}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => setScriptReady(true));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
  }, [siteKey]);

  // Render le widget une fois le script prêt
  useEffect(() => {
    if (!siteKey || !scriptReady || !ref.current || !window.hcaptcha) return;
    if (widgetIdRef.current) return; // déjà rendu
    widgetIdRef.current = window.hcaptcha.render(ref.current, {
      sitekey: siteKey,
      callback: onToken,
      'expired-callback': () => {
        onToken('');
        onExpired?.();
      },
      'error-callback': () => onToken(''),
      theme,
    });
  }, [siteKey, scriptReady, onToken, onExpired, theme]);

  if (!siteKey) {
    return (
      <div className="hcaptcha-disabled-hint">
        <small className="muted">
          🚧 hCaptcha non configuré (dev local). Set
          <code>NEXT_PUBLIC_HCAPTCHA_SITE_KEY</code> en prod.
        </small>
        <style>{`
          .hcaptcha-disabled-hint {
            padding: 0.5rem;
            background: rgba(212, 175, 55, 0.1);
            border-left: 3px solid var(--color-primary);
            border-radius: var(--radius);
            font-size: 0.8rem;
            margin-bottom: var(--space-4);
          }
          .hcaptcha-disabled-hint code {
            background: var(--color-bg);
            padding: 0.1rem 0.3rem;
            border-radius: 0.2rem;
            font-size: 0.85em;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="hcaptcha-container">
      <div ref={ref} />
      <style>{`
        .hcaptcha-container {
          display: flex;
          justify-content: center;
          margin-bottom: var(--space-4);
          min-height: 78px;
        }
      `}</style>
    </div>
  );
}
