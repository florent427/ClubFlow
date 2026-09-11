import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { STRIPE_TRANSIT_STATUS, SYNC_STRIPE_TRANSIT } from '../../../lib/documents';
import type { StripeTransitStatusData, SyncStripeTransitData } from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';

/** « 2026-09-11T12:34:56.000Z » → « 11/09/2026 à 12:34 ». */
function formatMoment(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR');
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} à ${time}`;
}

/**
 * Transit Stripe (ADR-0014, lot 8).
 *
 * Stripe ne dépose pas de relevé : c'est ClubFlow qui va lire. Le balayage
 * tourne chaque nuit ; ce panneau dit quand il est passé et permet de ne pas
 * attendre demain après un encaissement fait depuis le dashboard Stripe.
 */
export function StripeTransitPanel({ onSynced }: { onSynced: () => void }) {
  const { showToast } = useToast();
  const { data, refetch } = useQuery<StripeTransitStatusData>(STRIPE_TRANSIT_STATUS, {
    fetchPolicy: 'cache-and-network',
  });
  const [sync, { loading }] = useMutation<SyncStripeTransitData>(SYNC_STRIPE_TRANSIT);
  const [last, setLast] = useState<string | null>(null);

  const status = data?.stripeTransitStatus ?? null;
  if (!status || !status.hasStripeAccount || !status.hasTransitAccount) return null;

  async function onSync() {
    try {
      const res = await sync();
      const r = res.data?.syncStripeTransit;
      if (!r) return;
      if (r.skipped) {
        setLast(`Rien à vérifier : ${r.skipped}.`);
        showToast(`Vérification impossible : ${r.skipped}`, 'error');
      } else {
        const bits = [`${r.payoutsSeen} virement${r.payoutsSeen > 1 ? 's' : ''} lu${r.payoutsSeen > 1 ? 's' : ''}`];
        if (r.payoutsRecorded > 0) bits.push(`${r.payoutsRecorded} écriture(s) rattrapée(s)`);
        if (r.unknownLines > 0) bits.push(`${r.unknownLines} ligne(s) à catégoriser`);
        if (r.arithmeticWarnings > 0) bits.push(`${r.arithmeticWarnings} écart(s) signalé(s)`);
        setLast(bits.join(' · '));
        showToast(
          r.unknownLines > 0
            ? `${r.unknownLines} mouvement(s) Stripe à catégoriser`
            : 'Transit Stripe à jour',
          'success',
        );
      }
      await refetch();
      onSynced();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Vérification impossible', 'error');
    }
  }

  return (
    <section className="members-panel">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2 className="members-panel__h" style={{ margin: 0 }}>
          Transit Stripe
        </h2>
        <button type="button" className="btn-ghost" disabled={loading} onClick={() => void onSync()}>
          {loading ? 'Vérification…' : 'Vérifier maintenant'}
        </button>
      </div>
      <p className="cf-muted">
        Stripe n’envoie pas de relevé : ClubFlow va lire ses virements chaque
        nuit. Ce qu’il ne connaît pas — un encaissement fait depuis le tableau
        de bord Stripe, un litige — devient une ligne à catégoriser, comme sur
        un relevé bancaire.
      </p>
      <p className="cf-muted">
        {status.lastSyncedAt ? (
          <>Dernière vérification : {formatMoment(status.lastSyncedAt)}.</>
        ) : (
          <>Jamais vérifié pour l’instant.</>
        )}
        {last ? ` ${last}` : ''}
      </p>
    </section>
  );
}
