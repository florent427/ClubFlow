import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { watchInstallability } from './lib/install-prompt';
import { registerServiceWorker } from './lib/push';
import { parseSsoHash } from './lib/sso-hash';
import { setMemberSession } from './lib/storage';
import './index.css';

/**
 * Bascule depuis l'administration. Le bouton « Personnel » ouvre le portail
 * avec `#sso=<jeton>&club=<club>` : on l'installe comme session avant React,
 * puis on nettoie l'URL pour que le jeton ne reste ni dans l'historique ni
 * dans un signet. Miroir de `consumeSsoHash` côté admin.
 */
function consumeSsoHash(): void {
  const handoff = parseSsoHash(window.location.hash);
  if (!handoff) {
    return;
  }
  try {
    setMemberSession(handoff.token, handoff.clubId);
  } catch {
    /* localStorage indisponible : au moins l'URL est nettoyée */
  }
  history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search,
  );
}

consumeSsoHash();

// Enregistré dès le chargement : un abonnement push existant doit rester
// servi après un déploiement, même si l'adhérent n'ouvre pas Paramètres.
void registerServiceWorker();

// Chrome n'annonce l'installabilité qu'une fois, très tôt : écouté avant React.
watchInstallability();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
