import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setToken, setActiveClub } from './lib/storage'

/**
 * SSO cross-domain depuis le portail membre. Quand l'utilisateur clique
 * "Administration" sur portail.X (cross-domain → localStorage isolé),
 * le portail nous envoie le token + clubId via URL hash :
 *   `#sso=<token>&club=<clubId>`
 *
 * On le lit AVANT le mount React, on stocke en localStorage local de
 * l'admin, et on nettoie le hash de l'URL via history.replaceState pour
 * éviter que le token reste exposé dans la barre d'URL / shareable.
 *
 * Hash reste côté client uniquement (jamais envoyé au serveur dans la
 * requête HTTP) → pas de fuite dans les logs Caddy/CDN.
 */
function consumeSsoHash(): void {
  if (!window.location.hash) return
  const params = new URLSearchParams(window.location.hash.slice(1))
  const token = params.get('sso')
  const club = params.get('club')
  if (!token || !club) return
  try {
    setToken(token)
    setActiveClub(club)
  } catch {
    // localStorage indisponible (mode privé strict) — au moins le hash
    // est nettoyé pour ne pas laisser le token traîner.
  }
  // Clean l'URL pour éviter que le token persiste dans l'historique
  // navigateur ou les bookmarks accidentels.
  history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search,
  )
}

consumeSsoHash()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
