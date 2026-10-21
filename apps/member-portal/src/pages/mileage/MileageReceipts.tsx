import { useApolloClient, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { formatEuroCents } from '../../lib/format';
import {
  VIEWER_TAX_RECEIPTS,
  VIEWER_TAX_RECEIPT_PDF,
  type TaxReceipt,
  type ViewerTaxReceiptPdfData,
  type ViewerTaxReceiptsData,
} from '../../lib/mileage-documents';
import { base64ToPdfBlob, errorMessage, formatIsoDay } from '../../lib/mileage-format';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisse au navigateur le temps de démarrer le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function MileageReceipts() {
  const client = useApolloClient();
  const { data, loading, error } = useQuery<ViewerTaxReceiptsData>(
    VIEWER_TAX_RECEIPTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const receipts = data?.viewerTaxReceipts ?? [];

  async function download(r: TaxReceipt) {
    setDownloadError(null);
    setDownloadingId(r.id);
    try {
      const res = await client.query<ViewerTaxReceiptPdfData>({
        query: VIEWER_TAX_RECEIPT_PDF,
        variables: { id: r.id },
        fetchPolicy: 'no-cache',
      });
      const b64 = res.data?.viewerTaxReceiptPdf;
      if (!b64) throw new Error('PDF indisponible.');
      downloadBlob(base64ToPdfBlob(b64), `recu-fiscal-${r.number}.pdf`);
    } catch (err) {
      setDownloadError(errorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div>
      <p className="mp-text-muted">
        Quand vous renoncez au remboursement de vos frais, le club vous délivre
        un reçu fiscal : il ouvre droit à une réduction d’impôt sur le revenu ; conservez-le
        pour votre déclaration.
      </p>
      {error ? <p className="mp-error">{errorMessage(error)}</p> : null}
      {downloadError ? <p className="mp-error">{downloadError}</p> : null}
      {loading && receipts.length === 0 ? (
        <p className="mp-text-muted">Chargement…</p>
      ) : receipts.length === 0 ? (
        <p className="mp-empty">Aucun reçu fiscal émis pour l’instant.</p>
      ) : (
        <ul className="mp-mileage-trips">
          {receipts.map((r) => (
            <li key={r.id} className="mp-mileage-trip">
              <div className="mp-mileage-trip__head">
                <span className="mp-mileage-trip__route">
                  Reçu n° {r.number} — dons {r.year}
                </span>
                <strong>{formatEuroCents(r.amountCents)}</strong>
              </div>
              <div className="mp-mileage-trip__meta">
                Émis le {formatIsoDay(r.issuedOn)}
              </div>
              <div className="mp-mileage-trip__actions">
                <button
                  type="button"
                  className="mp-btn mp-btn-sm"
                  disabled={downloadingId === r.id}
                  onClick={() => void download(r)}
                >
                  {downloadingId === r.id ? 'Préparation…' : 'Télécharger le PDF'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
