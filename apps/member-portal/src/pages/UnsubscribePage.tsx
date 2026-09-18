import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/api-base';

type Etat = 'en-cours' | 'fait' | 'erreur';

/**
 * Page de désinscription des campagnes, suivie depuis un e-mail.
 *
 * Elle ne demande rien : le jeton du lien porte déjà le club et l'adresse. Les
 * boîtes mail modernes, elles, appellent directement l'URL de l'API sans
 * passer par ici (RFC 8058) — les deux mènent au même enregistrement.
 */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [etat, setEtat] = useState<Etat>('en-cours');
  const [club, setClub] = useState<string | null>(null);
  const envoye = useRef(false);

  useEffect(() => {
    if (envoye.current) return;
    envoye.current = true;
    if (!token.trim()) {
      setEtat('erreur');
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/mail/unsubscribe`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          setEtat('erreur');
          return;
        }
        const data = (await res.json()) as { clubName?: string | null };
        setClub(data.clubName ?? null);
        setEtat('fait');
      } catch {
        setEtat('erreur');
      }
    })();
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Désinscription</h1>
          <p className="auth-sub">
            {etat === 'en-cours'
              ? 'Enregistrement en cours…'
              : etat === 'fait'
                ? `Vous ne recevrez plus les campagnes${club ? ` de ${club}` : ''}. Les messages liés à votre compte (factures, inscriptions) continuent d’arriver.`
                : 'Ce lien de désinscription n’est plus valable. Demandez au club de vous retirer de ses envois.'}
          </p>
        </header>
        <p className="auth-footer">
          <Link to="/login" className="auth-link">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
