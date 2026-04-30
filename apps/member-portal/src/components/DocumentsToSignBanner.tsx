import { useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';
import {
  VIEWER_DOCUMENTS_TO_SIGN,
  type ViewerDocumentToSign,
} from '../lib/documents-signature';

type Data = { viewerDocumentsToSign: ViewerDocumentToSign[] };

/**
 * Bannière persistante affichée sur DashboardPage, BillingPage,
 * AdhesionPage et toute autre page sensible. Tant que l'utilisateur
 * a au moins un document obligatoire non signé, la bannière reste
 * affichée pour rappel.
 *
 * Le polling (30s) garantit que la bannière disparaisse rapidement
 * après la signature même si l'utilisateur reste sur la même page.
 */
export function DocumentsToSignBanner() {
  const { data } = useQuery<Data>(VIEWER_DOCUMENTS_TO_SIGN, {
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
    pollInterval: 30000,
  });

  const docs = (data?.viewerDocumentsToSign ?? []).filter((d) => d.isRequired);
  if (docs.length === 0) return null;

  return (
    <div className="docs-banner">
      <div className="docs-banner__icon" aria-hidden>
        ⚠️
      </div>
      <div className="docs-banner__body">
        <strong className="docs-banner__title">
          {docs.length === 1
            ? '1 document à signer'
            : `${docs.length} documents à signer`}
        </strong>
        <p className="docs-banner__subtitle">
          {docs.length === 1
            ? `« ${docs[0]!.name} » est obligatoire pour accéder à toutes vos fonctionnalités.`
            : 'Ces documents sont obligatoires pour accéder à toutes vos fonctionnalités.'}
        </p>
      </div>
      <Link to="/documents-a-signer" className="docs-banner__cta">
        {docs.length === 1 ? 'Signer maintenant' : 'Voir et signer'}
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
