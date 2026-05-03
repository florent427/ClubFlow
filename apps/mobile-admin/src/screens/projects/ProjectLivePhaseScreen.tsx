import { PlaceholderScreen } from '../../components/PlaceholderScreen';

/**
 * Workflow live phase complexe (modération en temps réel des contributions
 * photo/vidéo/texte) — implémentation reportée à la v2 mobile. L'admin
 * peut piloter ce workflow depuis l'admin web pour le moment.
 */
export function ProjectLivePhaseScreen() {
  return (
    <PlaceholderScreen
      eyebrow="LIVE"
      title="Phase modérée"
      subtitle="Disponible sur l'admin web"
      hint="La modération en temps réel des contributions est disponible sur le tableau de bord web pour la v1."
      icon="radio-outline"
    />
  );
}
