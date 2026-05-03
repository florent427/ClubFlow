import { useApolloClient } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, typography } from '../lib/theme';
import { useClubTheme } from '../lib/theme-context';
import { absolutizeMediaUrl } from '../lib/absolutize-url';
import { CLUB_BRANDING } from '../lib/viewer-documents';

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
 * Tap → Alert de **diagnostic** affichant l'URL tentée + l'état de
 * chargement (loading / loaded / failed avec message d'erreur). Sert
 * à débugger les cas où le logo n'apparaît pas en prod : l'utilisateur
 * peut prendre une capture d'écran de l'alerte et la partager pour
 * que l'on identifie le problème (URL incorrecte ? 404 ? CORS ?).
 *
 * Le composant lit le club courant via `useClubTheme()` et n'affiche
 * **rien** si on n'est pas dans un contexte branded (pas de logo et
 * pas de nom — pas de contexte club).
 */
export function ClubLogoBubble({
  size = 44,
  variant = 'light',
}: Props = {}) {
  const clubTheme = useClubTheme();
  const apolloClient = useApolloClient();
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const errorMsgRef = useRef<string | null>(null);

  // Réinitialise le fallback quand l'URL change (changement de club…).
  useEffect(() => {
    setImageFailed(false);
    setImageLoaded(false);
    errorMsgRef.current = null;
  }, [clubTheme.clubLogoUrl]);

  // Pas de logo défini ET pas de nom de club → on n'affiche rien.
  if (!clubTheme.clubLogoUrl && !clubTheme.clubName) {
    return null;
  }

  const rawUrl = clubTheme.clubLogoUrl;
  // **Garde-fou anti-data URL legacy** : avant migration, l'admin stockait
  // le logo comme `data:image/png;base64,...` directement dans
  // `Club.logoUrl`. Le DTO est maintenant limité à 2000 chars ; toute
  // image > ~1.5 KB est nécessairement TRONQUÉE → la WebView RN reçoit un
  // base64 invalide et ne fire pas toujours `onError`. On treat ces URLs
  // comme failed dès le départ pour fallback immédiat sur les initiales.
  const isLegacyDataUrl = rawUrl?.startsWith('data:') ?? false;
  const baseUrl = isLegacyDataUrl ? null : absolutizeMediaUrl(rawUrl);
  // **Conversion SVG → PNG côté serveur** : React Native `<Image>` ne
  // supporte PAS SVG (ni RN core, ni expo-image actuel). Pour tous les
  // assets servis par notre endpoint `/media/<uuid>`, on appose
  // systématiquement `?format=png&w=<2×size>`. Le backend (cf.
  // `media.controller.ts`) :
  //  - rastérise via sharp si l'asset est SVG
  //  - ignore le param et sert le binaire tel quel si l'asset est déjà
  //    PNG/JPG/WebP
  // Coût : un cache key différent par taille demandée, mais pour un logo
  // c'est négligeable (chargé 1x par session).
  const url = baseUrl
    ? appendQueryParams(baseUrl, {
        format: 'png',
        w: String(Math.round(size * 2)),
      })
    : null;
  const showImage = url && !imageFailed;

  const initials = makeInitials(clubTheme.clubName);
  const isLight = variant === 'light';

  /**
   * Tap → diagnostic. Affiche le pipeline complet de l'URL pour
   * débugger les cas où le logo ne s'affiche pas. Bouton "Recharger"
   * force un refetch CLUB_BRANDING (utile si l'admin vient
   * d'uploader un nouveau logo et qu'on a la valeur cachée).
   */
  function showDiagnostic() {
    const lines: string[] = [];
    lines.push(`Nom : ${clubTheme.clubName ?? '(non défini)'}`);
    lines.push('');
    lines.push(`URL en DB :\n${rawUrl ?? '(null — pas de logo configuré)'}`);
    if (isLegacyDataUrl) {
      lines.push('');
      lines.push(
        '⚠ Format legacy détecté (data:base64).\nRe-uploadez le logo via Admin → Identité du club.',
      );
    } else if (rawUrl) {
      lines.push('');
      lines.push(`URL résolue (mobile) :\n${url ?? '(échec absolutize)'}`);
      lines.push('');
      if (imageLoaded) {
        lines.push('✓ Image chargée');
      } else if (imageFailed) {
        lines.push(`✗ Échec : ${errorMsgRef.current ?? '(pas de détail)'}`);
      } else {
        lines.push('… Chargement en cours');
      }
    }
    Alert.alert('Diagnostic logo club', lines.join('\n'), [
      {
        text: 'Recharger',
        onPress: () => {
          // Force un refetch de CLUB_BRANDING pour récupérer le
          // nouveau logoUrl si l'admin vient de l'uploader. Reset
          // aussi les flags d'erreur pour donner une chance à la
          // nouvelle image de se charger.
          setImageFailed(false);
          setImageLoaded(false);
          errorMsgRef.current = null;
          void apolloClient.refetchQueries({ include: [CLUB_BRANDING] });
        },
      },
      { text: 'OK', style: 'cancel' },
    ]);
  }

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
    <Pressable
      onPress={showDiagnostic}
      accessibilityRole="image"
      accessibilityLabel={`Logo ${clubTheme.clubName ?? 'club'}. Toucher pour le diagnostic.`}
      style={containerStyle}
    >
      {showImage ? (
        <Image
          source={{ uri: url }}
          // Image à 100 % du bubble — remplissage maximal. Avec
          // `overflow: hidden` + `borderRadius=size/2` sur le parent,
          // les coins des logos qui utilisent toute leur toile carrée
          // sont clippés par le cercle ; c'est acceptable pour la
          // plupart des logos qui concentrent leur contenu au centre.
          // `resizeMode="contain"` préserve le ratio : un logo large
          // (ex. logo+texte horizontal) est letterboxé verticalement
          // plutôt que d'être étiré.
          style={{
            width: size,
            height: size,
          }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          onLoad={() => {
            setImageLoaded(true);
          }}
          onError={(evt) => {
            // L'URL a échoué (404, CORS, hôte inaccessible, format
            // invalide…) — on bascule sur les initiales pour ne pas
            // laisser un cercle blanc vide. On capture aussi le
            // message d'erreur natif pour l'afficher dans le diagnostic.
            const err = evt?.nativeEvent?.error ?? 'erreur inconnue';
            errorMsgRef.current = String(err);
            // eslint-disable-next-line no-console
            console.warn('[ClubLogoBubble] Image load error:', err, 'URL:', url);
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
    </Pressable>
  );
}

/**
 * Concatène des query params à une URL, en respectant la séparation
 * `?` initial vs `&` suivants. Ne ré-encode pas les params existants.
 */
function appendQueryParams(url: string, params: Record<string, string>): string {
  const sep = url.includes('?') ? '&' : '?';
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${url}${sep}${qs}`;
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
