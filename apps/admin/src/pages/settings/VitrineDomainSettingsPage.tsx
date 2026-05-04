import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  REMOVE_VITRINE_DOMAIN,
  REQUEST_VITRINE_DOMAIN,
  VERIFY_VITRINE_DOMAIN,
  VITRINE_DOMAIN_STATE,
} from '../../lib/documents';
import type {
  RemoveVitrineDomainMutationData,
  RequestVitrineDomainMutationData,
  VerifyVitrineDomainMutationData,
  VitrineDomainState,
  VitrineDomainStateQueryData,
} from '../../lib/types';

/**
 * Settings → Domaine vitrine.
 *
 * Permet à un CLUB_ADMIN de configurer un domaine custom pour la vitrine
 * publique de son club (ex: monclub.fr). Affiche les records DNS à ajouter
 * + bouton "Vérifier" qui déclenche `verifyVitrineDomain` côté API.
 *
 * Cf. ADR-0007 (Caddy admin API) pour l'architecture sous-jacente.
 */
export function VitrineDomainSettingsPage() {
  const { data, loading, refetch } = useQuery<VitrineDomainStateQueryData>(
    VITRINE_DOMAIN_STATE,
    { fetchPolicy: 'cache-and-network' },
  );
  const [domain, setDomain] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSuccess = (text: string) => {
    setMsg(text);
    setErr(null);
    void refetch();
  };
  const onErr = (e: { message: string }) => {
    setErr(e.message);
    setMsg(null);
  };

  const [requestDomain, { loading: requesting }] =
    useMutation<RequestVitrineDomainMutationData>(REQUEST_VITRINE_DOMAIN, {
      onCompleted: () => {
        setDomain('');
        onSuccess(
          'Domaine enregistré. Configurez vos records DNS chez votre registrar puis cliquez sur "Vérifier".',
        );
      },
      onError: onErr,
    });

  const [verifyDomain, { loading: verifying }] =
    useMutation<VerifyVitrineDomainMutationData>(VERIFY_VITRINE_DOMAIN, {
      onCompleted: (d) => {
        if (d.verifyVitrineDomain.status === 'ACTIVE') {
          onSuccess('🎉 Domaine actif ! Le certificat HTTPS sera obtenu en quelques secondes.');
        } else {
          onErr({
            message:
              d.verifyVitrineDomain.errorMessage ??
              'La vérification DNS a échoué. Réessayer dans quelques minutes.',
          });
        }
      },
      onError: onErr,
    });

  const [removeDomain, { loading: removing }] =
    useMutation<RemoveVitrineDomainMutationData>(REMOVE_VITRINE_DOMAIN, {
      onCompleted: () => onSuccess('Domaine retiré. Le club est revenu sur le sous-domaine fallback.'),
      onError: onErr,
    });

  const state = data?.vitrineDomainState;
  const busy = requesting || verifying || removing;

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Paramètres</p>
        <h1 className="members-loom__title">Domaine vitrine</h1>
        <p className="members-loom__lede">
          Configurez votre propre domaine (ex. <em>monclub.fr</em>) pour la
          vitrine publique de votre club. Le certificat HTTPS est obtenu
          automatiquement.
        </p>
      </header>

      {loading && !data && <p>Chargement…</p>}

      {state && (
        <div className="members-loom__grid members-loom__grid--single">
          <section className="members-panel">
            <h2 className="members-panel__h">État actuel</h2>
            <DomainStatePanel state={state} />
          </section>

          {state.customDomain && (
            <section className="members-panel">
              <h2 className="members-panel__h">Records DNS à configurer</h2>
              <DnsInstructionsPanel state={state} />
              <div className="vd-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => verifyDomain()}
                  disabled={busy}
                >
                  {verifying ? 'Vérification…' : '🔄 Vérifier maintenant'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    if (confirm('Retirer le domaine custom ? La vitrine retombera sur le sous-domaine fallback.')) {
                      void removeDomain();
                    }
                  }}
                  disabled={busy}
                >
                  Retirer ce domaine
                </button>
              </div>
            </section>
          )}

          <section className="members-panel">
            <h2 className="members-panel__h">
              {state.customDomain ? 'Changer de domaine' : 'Configurer un domaine'}
            </h2>
            <form
              className="vd-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!domain.trim()) return;
                void requestDomain({ variables: { input: { domain: domain.trim() } } });
              }}
            >
              <label>
                <span>FQDN du domaine (sans https://)</span>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="monclub.fr"
                  disabled={busy}
                  pattern="[a-z0-9]([a-z0-9-.]*[a-z0-9])?"
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy || !domain.trim()}>
                {requesting ? 'Enregistrement…' : 'Enregistrer ce domaine'}
              </button>
            </form>
          </section>
        </div>
      )}

      {msg && <p className="members-msg members-msg--ok">{msg}</p>}
      {err && <p className="members-msg members-msg--err">{err}</p>}

      <style>{`
        .vd-form { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
        .vd-form label { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 240px; }
        .vd-form input { padding: 0.5rem 0.75rem; border: 1px solid var(--c-border, #d4d4d8); border-radius: 6px; }
        .vd-actions { display: flex; gap: 0.75rem; margin-top: 1rem; flex-wrap: wrap; }
        .vd-status-badge { display: inline-block; padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; }
        .vd-status-badge--PENDING_DNS { background: #fef3c7; color: #92400e; }
        .vd-status-badge--VERIFIED { background: #dbeafe; color: #1e40af; }
        .vd-status-badge--ACTIVE { background: #dcfce7; color: #166534; }
        .vd-status-badge--ERROR { background: #fee2e2; color: #991b1b; }
        .vd-records { font-family: monospace; font-size: 0.9rem; }
        .vd-records th, .vd-records td { padding: 0.4rem 0.75rem; border: 1px solid var(--c-border, #e4e4e7); text-align: left; }
        .vd-records th { background: var(--c-bg-soft, #f4f4f5); font-weight: 600; }
        .btn-danger { background: #dc2626; color: white; border-color: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
      `}</style>
    </>
  );
}

function DomainStatePanel({ state }: { state: VitrineDomainState }) {
  if (!state.customDomain) {
    return (
      <p>
        <em>Aucun domaine custom configuré.</em> Votre vitrine est servie sur
        le sous-domaine ClubFlow par défaut.
      </p>
    );
  }
  const labels: Record<typeof state.status, string> = {
    PENDING_DNS: 'Attente propagation DNS',
    VERIFIED: 'DNS vérifié, cert TLS en cours',
    ACTIVE: 'Actif',
    ERROR: 'Erreur',
  };
  return (
    <div>
      <p>
        <strong>{state.customDomain}</strong>{' '}
        <span className={`vd-status-badge vd-status-badge--${state.status}`}>
          {labels[state.status]}
        </span>
      </p>
      {state.checkedAt && (
        <p style={{ fontSize: '0.85rem', color: '#71717a' }}>
          Dernier check : {new Date(state.checkedAt).toLocaleString('fr-FR')}
        </p>
      )}
      {state.errorMessage && state.status === 'ERROR' && (
        <p style={{ color: '#991b1b' }}>⚠️ {state.errorMessage}</p>
      )}
      {state.status === 'ACTIVE' && (
        <p>
          🌐 Votre vitrine est accessible sur{' '}
          <a href={`https://${state.customDomain}`} target="_blank" rel="noreferrer">
            https://{state.customDomain}
          </a>
        </p>
      )}
    </div>
  );
}

function DnsInstructionsPanel({ state }: { state: VitrineDomainState }) {
  if (!state.customDomain) return null;
  return (
    <>
      <p>
        Chez votre registrar (OVH, Gandi, Cloudflare, etc.), ajoutez les
        records suivants pour <strong>{state.customDomain}</strong> :
      </p>
      <table className="vd-records">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th>Value</th>
            <th>TTL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>A</td>
            <td>@</td>
            <td>{state.expectedIpv4}</td>
            <td>Auto</td>
          </tr>
          <tr>
            <td>AAAA</td>
            <td>@</td>
            <td>{state.expectedIpv6}</td>
            <td>Auto</td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: '0.85rem', color: '#71717a', marginTop: '0.5rem' }}>
        💡 Si vous utilisez Cloudflare : désactivez le proxy (nuage gris,
        pas orange) pour permettre l'obtention du certificat HTTPS.
      </p>
    </>
  );
}
