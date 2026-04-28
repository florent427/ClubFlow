import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  VIEWER_ME,
  VIEWER_VERIFY_PAYER_SPACE_PIN,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';

const SESSION_STORAGE_KEY = 'mp:payer-space-unlocked-at';
const UNLOCK_TTL_MS = 30 * 60 * 1000; // 30 min

function isUnlocked(): boolean {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < UNLOCK_TTL_MS;
  } catch {
    return false;
  }
}

function markUnlocked(): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

interface VerifyResponse {
  viewerVerifyPayerSpacePin: { ok: boolean };
}

/**
 * Composant qui protège l'accès à un sous-arbre du portail par un PIN
 * à 4 chiffres si l'utilisateur en a défini un. Une fois validé, le
 * statut "déverrouillé" est gardé en sessionStorage avec un TTL de
 * 30 minutes — au-delà, le PIN est redemandé.
 *
 * Si l'utilisateur n'a pas activé de PIN (`payerSpacePinSet=false`),
 * le composant affiche directement les enfants — pas de friction.
 */
export function PinGate({ children }: { children: React.ReactNode }) {
  const { data, loading } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const pinSet = data?.viewerMe?.payerSpacePinSet === true;
  const [unlocked, setUnlocked] = useState<boolean>(() => isUnlocked());

  if (loading && !data) {
    return <p className="mp-hint">Chargement…</p>;
  }
  if (!pinSet || unlocked) {
    return <>{children}</>;
  }
  return (
    <PinPrompt
      onSuccess={() => {
        markUnlocked();
        setUnlocked(true);
      }}
    />
  );
}

interface PinPromptProps {
  onSuccess: () => void;
}

function PinPrompt({ onSuccess }: PinPromptProps) {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [verify, { loading }] =
    useMutation<VerifyResponse>(VIEWER_VERIFY_PAYER_SPACE_PIN);

  useEffect(() => {
    setError(null);
  }, [pin]);

  async function handleSubmit(p: string): Promise<void> {
    if (!/^[0-9]{4}$/.test(p)) {
      setError('Le code doit contenir 4 chiffres.');
      return;
    }
    try {
      const res = await verify({ variables: { pin: p } });
      if (res.data?.viewerVerifyPayerSpacePin.ok) {
        onSuccess();
      } else {
        setError('Code PIN incorrect.');
        setPin('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vérification impossible.');
    }
  }

  // Auto-submit dès que 4 chiffres sont saisis
  useEffect(() => {
    if (pin.length === 4 && !loading) {
      void handleSubmit(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <div className="mp-page" style={{ maxWidth: 480, margin: '40px auto' }}>
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: '32px 24px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
          textAlign: 'center',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 56, color: '#2563eb', marginBottom: 8 }}
          aria-hidden="true"
        >
          lock
        </span>
        <h1 style={{ fontSize: '1.25rem', marginBottom: 8 }}>
          Espace protégé
        </h1>
        <p
          className="mp-hint"
          style={{ marginBottom: 24, fontSize: '0.9rem' }}
        >
          Saisissez votre code PIN à 4 chiffres pour accéder aux factures et
          au foyer.
        </p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus
          maxLength={4}
          value={pin}
          onChange={(e) =>
            setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))
          }
          disabled={loading}
          style={{
            fontSize: '2rem',
            letterSpacing: '0.5em',
            textAlign: 'center',
            width: '100%',
            padding: 12,
            border: '2px solid #cbd5e1',
            borderRadius: 8,
            outline: 'none',
            fontFamily: 'monospace',
          }}
          placeholder="••••"
        />
        {error ? (
          <p
            className="mp-form-error"
            role="alert"
            style={{ marginTop: 12 }}
          >
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="mp-hint" style={{ marginTop: 12 }}>
            Vérification…
          </p>
        ) : null}
      </div>
    </div>
  );
}
