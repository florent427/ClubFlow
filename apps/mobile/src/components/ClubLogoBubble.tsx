import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { palette, radius, typography } from '../lib/theme';
import { useClubTheme } from '../lib/theme-context';
import { absolutizeMediaUrl } from '../lib/absolutize-url';

type Props = {
  /** Diamètre du cercle (par défaut 44 px). */
  size?: number;
  /**
   * Variante visuelle :
   *  - `light` (défaut) : cercle blanc + initiales bleues — utilisé sur
   *    fond gradient sombre/coloré (hero du dashboard)
   *  - `dark` : cercle teinté primary + initiales blanches — pour fond
   *    clair (header, list…)
   */
  variant?: 'light' | 'dark';
};

/**
 * Affiche le logo du club courant dans un cercle. Si l'image ne charge
 * pas (URL invalide, 404, hors-ligne…), bascule automatiquement sur
 * les **initiales** du nom du club.
 *
 * Pourquoi ce composant ?
 *
 * Dans la version précédente, on essayait simplement `<Image source={uri}/>`
 * et on obtenait un **cercle blanc vide** quand l'URL était cassée — sans
 * indication ni fallback. Maintenant :
 *  1. on tente le chargement
 *  2. si succès → image affichée
 *  3. si erreur → fallback initiales colorées (toujours visible, identifiable)
 *
 * Le composant lit le club courant via `useClubTheme()` et n'affiche
 * **rien** si on n'est pas dans un contexte branded (pas de logo et pas
 * de nom — pas de contexte club).
 */
export function ClubLogoBubble({
  size = 44,
  variant = 'light',
}: Props = {}) {
  const clubTheme = useClubTheme();
  const [imageFailed, setImageFailed] = useState(false);

  // Réinitialise le fallback quand l'URL change (changement de club…).
  useEffect(() => {
    setImageFailed(false);
  }, [clubTheme.clubLogoUrl]);

  // Pas de logo défini ET pas de nom de club → on n'affiche rien.
  if (!clubTheme.clubLogoUrl && !clubTheme.clubName) {
    return null;
  }

  const url = absolutizeMediaUrl(clubTheme.clubLogoUrl);
  const showImage = url && !imageFailed;

  const initials = makeInitials(clubTheme.clubName);
  const isLight = variant === 'light';

  const containerStyle = [
    styles.bubble,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: isLight ? '#ffffff' : palette.primary,
    },
  ];

  return (
    <View style={containerStyle}>
      {showImage ? (
        <Image
          source={{ uri: url }}
          style={{
            width: size * 0.7,
            height: size * 0.7,
          }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          onError={() => {
            // L'URL a échoué (404, CORS, hôte inaccessible…) — on bascule
            // sur les initiales pour ne pas laisser un cercle blanc vide.
            setImageFailed(true);
          }}
        />
      ) : (
        <Text
          style={[
            styles.initials,
            {
              fontSize: Math.round(size * 0.4),
              color: isLight ? palette.primary : '#ffffff',
            },
          ]}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

/** Première lettre du premier mot + première lettre du dernier mot. */
function makeInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    const w = words[0];
    return (w[0] + (w[1] ?? '')).toUpperCase();
  }
  const first = words[0][0] ?? '';
  const last = words[words.length - 1][0] ?? '';
  return (first + last).toUpperCase();
}

const styles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  initials: {
    ...typography.bodyStrong,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
