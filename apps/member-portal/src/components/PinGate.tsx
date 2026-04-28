import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  VIEWER_ME,
  VIEWER_VERIFY_PAYER_SPACE_PIN,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';

const STORAGE_PREFIX = 'mp:payer-space-unlocked:';
const UNLOCK_TTL_MS = 30 * 60 * 1000; // 30 min

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${profileId}`;
}

function isUnlocked(profileId: string): boolean {
  try {
    const raw = sessionStorage.getItem(storageKey(profileId));
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < UNLOCK_TTL_MS;
  } catch {
    return false;
  }
}

function markUnlocked(profileId: string): void {
  try {
    sessionStorage.setItem(storageKey(profileId), String(Date.now()));
  } catch {
    /* ignore */
  }
}

interface VerifyResponse {
  viewerVerifyPayerSpacePin: { ok: boolean };
}

/**
 * Composant qui protège l'accès au profil payeur par un PIN à 4 chiffres
 * si l'utilisateur en a défini un. Le déclenchement est :
 *
 *  - **canManageMembershipCart === true** (= profil adulte payeur du foyer)
 *  - **payerSpacePinSet === true** (= un PIN a été défini)
 *  - **non déverrouillé** dans cette session pour CE profil
 *    (sessionStorage `mp:payer-space-unlocked:<viewerMe.id>`, TTL 30 min)
 *
 * Pour les profils enfants ou les profils sans PIN, le composant rend
 * directement les enfants — pas de friction.
 *
 * Le scope par `viewerMe.id` permet à un même User de protéger
 * plusieurs profils indépendamment (ex 2 clubs avec 2 PINs différents).
 */
export function PinGate({ children }: { children: React.ReactNode }) {
  const { data, loading } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const me = data?.viewerMe;
  const profileId = me?.id ?? null;
  const pinSet = me?.payerSpacePinSet === true;
  const isPayer = me?.canManageMembershipCart === true;
  const [unlocked, setUnlocked] = useState<boolean>(() =>
    profileId ? isUnlocked(profileId) : false,
  );

  // Re-vérifie l'unlock à chaque changement de profile (switch entre
  // membres du foyer). Sans ça, le state local restait à `true` après
  // un switch vers un profil enfant, puis à `true` quand on revenait
  // sur le payeur — et le PIN n'était plus redemandé.
  useEffect(() => {
    if (!profileId) return;
    setUnlocked(isUnlocked(profileId));
  }, [profileId]);

  if (loading && !data) {
    return <p className="mp-hint">Chargement…</p>;
  }
  if (!isPayer || !pinSet || unlocked || !profileId) {
    return <>{children}</>;
  }
  return (
    <PinPrompt
      onSuccess={() => {
        markUnlocked(profileId);
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
          Profil protégé
        </h1>
        <p
          className="mp-hint"
          style={{ marginBottom: 24, fontSize: '0.9rem' }}
        >
          Saisissez votre code PIN à 4 chiffres pour accéder à ce profil
          payeur.
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
