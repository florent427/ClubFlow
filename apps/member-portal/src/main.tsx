import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { registerServiceWorker } from './lib/push';
import './index.css';

// Enregistré dès le chargement : un abonnement push existant doit rester
// servi après un déploiement, même si l'adhérent n'ouvre pas Paramètres.
void registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
