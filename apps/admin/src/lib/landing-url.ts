/**
 * URL de la landing marketing (où vit /signup), dérivée du hostname
 * courant — évite les URLs hardcodées qui envoyaient les testeurs
 * staging vers le signup de PROD (bug QA M1) :
 *   app.clubflow.topdigital.re         → clubflow.topdigital.re
 *   staging.app.clubflow.topdigital.re → staging.clubflow.topdigital.re
 *   localhost (dev)                    → http://localhost:5176
 */
export function landingUrl(path = ''): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://localhost:5176${path}`;
  }
  const landingHost = host.replace(/^(staging\.)?app\./, '$1');
  return `https://${landingHost}${path}`;
}
