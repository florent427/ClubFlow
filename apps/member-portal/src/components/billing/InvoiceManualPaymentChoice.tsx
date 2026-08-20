import { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { VIEWER_LOCK_INVOICE_PAYMENT_CHOICE } from '../../lib/viewer-documents';
import { useToast } from '../ToastProvider';

type ManualMethod = 'MANUAL_TRANSFER' | 'MANUAL_CHECK' | 'MANUAL_CASH';

interface LockData {
  viewerLockInvoicePaymentChoice: {
    invoiceId: string;
    method: string;
    installmentsCount: number;
    instructions: string;
  };
}

const MANUAL_METHODS: Array<{
  method: ManualMethod;
  label: string;
  icon: string;
}> = [
  { method: 'MANUAL_TRANSFER', label: 'Virement bancaire', icon: 'account_balance' },
  { method: 'MANUAL_CHECK', label: 'Chèque', icon: 'description' },
  { method: 'MANUAL_CASH', label: 'Espèces', icon: 'payments' },
];

/**
 * Permet au payeur de basculer une facture ouverte vers un règlement
 * manuel (virement / chèque / espèces) et d'obtenir les instructions.
 *
 * Sans ça, une facture dont le paiement CB n'aboutit pas est un
 * cul-de-sac : le portail ne proposait que « Payer en ligne », donc
 * réessayer la même carte ou appeler le club. La mutation existait déjà
 * côté API (`viewerLockInvoicePaymentChoice`) mais n'était branchée
 * nulle part.
 */
export function InvoiceManualPaymentChoice({
  invoiceId,
  balanceCents,
  invoiceStatus,
}: {
  invoiceId: string;
  balanceCents: number;
  invoiceStatus: string;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [lockChoice, { loading }] = useMutation<LockData>(
    VIEWER_LOCK_INVOICE_PAYMENT_CHOICE,
  );

  if (invoiceStatus !== 'OPEN' || balanceCents <= 0) return null;

  async function handleChoose(method: ManualMethod): Promise<void> {
    if (loading) return;
    try {
      const res = await lockChoice({
        variables: { invoiceId, method, installmentsCount: 1 },
      });
      const data = res.data?.viewerLockInvoicePaymentChoice;
      setInstructions(data?.instructions ?? '');
      showToast('Mode de règlement enregistré.', 'success');
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Choix de règlement indisponible.',
        'error',
      );
    }
  }

  if (instructions !== null) {
    return (
      <div className="mp-subsection">
        <h3 className="mp-invoice-subtitle">Votre mode de règlement</h3>
        <p className="mp-hint mp-hint--block">{instructions}</p>
        <p className="mp-hint">
          Le club enregistrera votre règlement à réception. Vous pouvez
          toujours revenir au paiement en ligne ci-dessus.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mp-subsection">
        <button
          type="button"
          className="mp-btn mp-btn-outline"
          onClick={() => setOpen(true)}
        >
          <span className="material-symbols-outlined" aria-hidden>
            swap_horiz
          </span>
          Régler autrement qu&rsquo;en ligne
        </button>
        <p className="mp-hint mp-invoice-item__tip">
          Virement, chèque ou espèces — utile si votre paiement par carte
          n&rsquo;a pas abouti.
        </p>
      </div>
    );
  }

  return (
    <div className="mp-subsection">
      <h3 className="mp-invoice-subtitle">Régler autrement</h3>
      <p className="mp-hint">
        Choisissez un mode de règlement : le club recevra votre choix et vous
        transmettra les modalités.
      </p>
      <div className="mp-form-actions">
        {MANUAL_METHODS.map((m) => (
          <button
            key={m.method}
            type="button"
            className="mp-btn mp-btn-outline"
            disabled={loading}
            onClick={() => void handleChoose(m.method)}
          >
            <span className="material-symbols-outlined" aria-hidden>
              {m.icon}
            </span>
            {m.label}
          </button>
        ))}
        <button
          type="button"
          className="mp-btn mp-btn-outline"
          disabled={loading}
          onClick={() => setOpen(false)}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
