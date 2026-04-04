import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  CLUB_HOSTED_MAIL_OFFER,
  CLUB_SENDING_DOMAINS,
  CREATE_CLUB_HOSTED_SENDING_DOMAIN,
  CREATE_CLUB_SENDING_DOMAIN,
  DELETE_CLUB_SENDING_DOMAIN,
  REFRESH_CLUB_SENDING_DOMAIN,
  SEND_CLUB_TRANSACTIONAL_TEST_EMAIL,
} from '../../lib/documents';
import type {
  ClubHostedMailOfferQueryData,
  ClubSendingDomainsQueryData,
} from '../../lib/types';

const PURPOSES = [
  { value: 'TRANSACTIONAL', label: 'Transactionnel uniquement' },
  { value: 'CAMPAIGN', label: 'Campagnes uniquement' },
  { value: 'BOTH', label: 'Les deux (même domaine)' },
] as const;

export function MailDomainSettingsPage() {
  const { data: offerData } = useQuery<ClubHostedMailOfferQueryData>(
    CLUB_HOSTED_MAIL_OFFER,
  );
  const { data, loading, refetch } = useQuery<ClubSendingDomainsQueryData>(
    CLUB_SENDING_DOMAINS,
  );
  const [fqdn, setFqdn] = useState('');
  const [purpose, setPurpose] = useState<string>('BOTH');
  const [testTo, setTestTo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [createHostedDomain, { loading: creatingHosted }] = useMutation(
    CREATE_CLUB_HOSTED_SENDING_DOMAIN,
    {
      onCompleted: () => {
        setMsg(
          'Adresse ClubFlow enregistrée. Côté opérateur : DNS + relais SMTP pour ce sous-domaine, puis « Vérifier ».',
        );
        setErr(null);
        void refetch();
      },
      onError: (e) => {
        setErr(e.message);
        setMsg(null);
      },
    },
  );

  const [createDomain, { loading: creating }] = useMutation(
    CREATE_CLUB_SENDING_DOMAIN,
    {
      onCompleted: () => {
        setMsg(
          'Domaine enregistré. Configurez la zone DNS (SPF, etc.) et le serveur SMTP, puis cliquez sur Vérifier.',
        );
        setErr(null);
        setFqdn('');
        void refetch();
      },
      onError: (e) => {
        setErr(e.message);
        setMsg(null);
      },
    },
  );

  const [refreshDomain, { loading: refreshing }] = useMutation(
    REFRESH_CLUB_SENDING_DOMAIN,
    {
      onCompleted: () => {
        setMsg('Statut mis à jour.');
        setErr(null);
        void refetch();
      },
      onError: (e) => {
        setErr(e.message);
        setMsg(null);
      },
    },
  );

  const [removeSendingDomain, { loading: deleting }] = useMutation(
    DELETE_CLUB_SENDING_DOMAIN,
    {
      onCompleted: () => {
        setMsg('Domaine retiré. Vous pouvez en enregistrer un nouveau.');
        setErr(null);
        void refetch();
      },
      onError: (e) => {
        setErr(e.message);
        setMsg(null);
      },
    },
  );

  const [sendTest, { loading: sendingTest }] = useMutation(
    SEND_CLUB_TRANSACTIONAL_TEST_EMAIL,
    {
      onCompleted: () => {
        setMsg('E-mail de test envoyé (vérifiez la boîte et les indésirables).');
        setErr(null);
      },
      onError: (e) => {
        setErr(e.message);
        setMsg(null);
      },
    },
  );

  const rows = data?.clubSendingDomains ?? [];
  const hostedOffer = offerData?.clubHostedMailOffer;

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Administration</p>
        <h1 className="members-loom__title">E-mail &amp; domaine d’envoi</h1>
        <p className="members-loom__lede">
          Les e-mails partent via le <strong>relais SMTP</strong> configuré sur
          le serveur ClubFlow. Chaque club enregistre un FQDN d’expéditeur ;
          sans statut « vérifié », aucune campagne ou envoi transactionnel.
        </p>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        {hostedOffer?.enabled && hostedOffer.previewFqdn ? (
          <section className="members-panel">
            <h2 className="members-panel__h">
              Sans domaine propre — adresse ClubFlow
            </h2>
            <p className="members-panel__p">
              Nous préparons une adresse du type{' '}
              <code>{hostedOffer.previewFqdn}</code> (basée sur le slug du
              club). Si ce libellé est déjà pris, un suffixe numérique peut
              s’ajouter automatiquement.
            </p>
            <p className="members-panel__p members-panel__muted">
              Pas de compte tiers : la zone DNS du suffixe et le SMTP sont gérés
              par l’opérateur ClubFlow.
            </p>
            <label className="members-field">
              <span className="members-field__label">Usage</span>
              <select
                className="members-field__input"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="members-actions">
              <button
                type="button"
                className="members-btn members-btn--primary"
                disabled={creatingHosted}
                onClick={() =>
                  createHostedDomain({
                    variables: { purpose },
                  })
                }
              >
                {creatingHosted
                  ? 'Création…'
                  : 'Obtenir cette adresse ClubFlow'}
              </button>
            </div>
          </section>
        ) : null}

        <section className="members-panel">
          <h2 className="members-panel__h">Votre propre domaine</h2>
          <p className="members-panel__p">
            Sous-domaine conseillé (ex. <code>messages.votre-club.fr</code>).
            Les enregistrements DNS s’affichent après enregistrement (chez votre
            hébergeur DNS).
          </p>
          <div className="members-form-grid">
            <label className="members-field">
              <span className="members-field__label">FQDN</span>
              <input
                className="members-field__input"
                value={fqdn}
                onChange={(e) => setFqdn(e.target.value)}
                placeholder="messages.exemple.fr"
                autoComplete="off"
              />
            </label>
            <label className="members-field">
              <span className="members-field__label">Usage</span>
              <select
                className="members-field__input"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="members-actions">
            <button
              type="button"
              className="members-btn members-btn--primary"
              disabled={creating || !fqdn.trim()}
              onClick={() =>
                createDomain({
                  variables: {
                    input: { fqdn: fqdn.trim(), purpose },
                  },
                })
              }
            >
              {creating ? 'Enregistrement…' : 'Enregistrer le domaine'}
            </button>
          </div>
        </section>

        <section className="members-panel">
          <h2 className="members-panel__h">Domaines configurés</h2>
          {loading ? (
            <p className="members-panel__muted">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="members-panel__muted">Aucun domaine pour l’instant.</p>
          ) : (
            <ul className="mail-domain-list">
              {rows.map((d) => (
                <li key={d.id} className="mail-domain-card">
                  <div className="mail-domain-card__head">
                    <strong>{d.fqdn}</strong>
                    <span className="mail-domain-card__badge">
                      {d.purpose} · {d.verificationStatus}
                      {d.isClubflowHosted ? ' · ClubFlow' : ''}
                    </span>
                  </div>
                  {d.isClubflowHosted ? (
                    <p className="members-panel__p members-panel__muted">
                      Sous-domaine hébergé ClubFlow : DNS et SMTP sont en principe
                      gérés par l’opérateur de la plateforme.
                    </p>
                  ) : null}
                  {d.dnsRecords.length === 0 &&
                  d.verificationStatus === 'PENDING' ? (
                    <p className="members-panel__p members-panel__muted">
                      Relais SMTP : assurez-vous que votre serveur accepte les
                      expéditeurs <code>*@{d.fqdn}</code> (SPF/DKIM selon votre
                      infra), puis validez avec le bouton ci-dessous.
                    </p>
                  ) : null}
                  {d.dnsRecords.length > 0 ? (
                    <div className="mail-domain-card__dns">
                      <p className="members-panel__muted">DNS à créer :</p>
                      <table className="mail-dns-table">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Nom</th>
                            <th>Valeur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.dnsRecords.map((r, i) => (
                            <tr key={`${r.name}-${i}`}>
                              <td>
                                <code>{r.type}</code>
                              </td>
                              <td>
                                <code>{r.name}</code>
                              </td>
                              <td>
                                <code className="mail-dns-table__value">
                                  {r.value}
                                </code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="members-actions">
                    <button
                      type="button"
                      className="members-btn"
                      disabled={refreshing || deleting}
                      onClick={() =>
                        refreshDomain({ variables: { domainId: d.id } })
                      }
                    >
                      Valider / vérifier
                    </button>
                    <button
                      type="button"
                      className="members-btn"
                      disabled={deleting || refreshing}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Retirer le domaine « ${d.fqdn} » ? Les envois qui l’utilisaient ne marcheront plus tant qu’un autre domaine n’est pas vérifié.`,
                          )
                        ) {
                          return;
                        }
                        void removeSendingDomain({
                          variables: { domainId: d.id },
                        });
                      }}
                    >
                      {deleting ? 'Suppression…' : 'Retirer ce domaine'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="members-panel">
          <h2 className="members-panel__h">E-mail de test (transactionnel)</h2>
          <p className="members-panel__p">
            Nécessite un domaine <strong>vérifié</strong> avec usage
            transactionnel ou « les deux ».
          </p>
          <label className="members-field">
            <span className="members-field__label">Destinataire</span>
            <input
              className="members-field__input"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="vous@exemple.fr"
            />
          </label>
          <div className="members-actions">
            <button
              type="button"
              className="members-btn members-btn--primary"
              disabled={sendingTest || !testTo.trim()}
              onClick={() =>
                sendTest({
                  variables: { input: { to: testTo.trim() } },
                })
              }
            >
              {sendingTest ? 'Envoi…' : 'Envoyer le test'}
            </button>
          </div>
        </section>

        {msg ? (
          <p className="members-flash members-flash--success">{msg}</p>
        ) : null}
        {err ? <p className="members-flash members-flash--error">{err}</p> : null}
      </div>
    </>
  );
}
