import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { palette, radius } from '../lib/theme';

type Props = {
  /** URL du PDF (absolue HTTP/HTTPS). Sera passée au viewer sans modif sur iOS,
   *  ou wrappée dans Google Docs viewer sur Android. */
  url: string;
  /** Hauteur du viewer en pixels. Défaut 420. */
  height?: number;
};

/**
 * Affiche un PDF inline via WebView, cross-platform.
 *
 * - **iOS** : la WebView native (WKWebView) sait afficher les PDFs
 *   directement. On passe l'URL telle quelle.
 * - **Android** : la WebView ne supporte pas les PDFs nativement et tente
 *   de télécharger. On utilise Google Docs Viewer
 *   (`https://docs.google.com/gview?embedded=true&url=...`) qui rend le PDF
 *   en HTML ; nécessite que l'URL du PDF soit publique (cas chez nous, cf
 *   `GET /media/:id` public-by-UUID).
 *
 * Pour les usages plus exigeants (recherche dans le PDF, sélection texte,
 * mode hors-ligne), on basculerait sur `react-native-pdf` mais le module
 * natif n'est pas compatible Expo Go.
 */
export function InlinePdfViewer({ url, height = 420 }: Props) {
  const viewerUri =
    Platform.OS === 'android'
      ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
      : url;

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        source={{ uri: viewerUri }}
        startInLoadingState
        scalesPageToFit
        style={styles.webview}
        // Permet le pinch-zoom sur iOS.
        bounces={false}
        // Désactive le sélecteur de menu contextuel (pas pertinent dans un viewer).
        textInteractionEnabled={false}
        // Empêche les liens (rare dans un PDF) de naviguer la WebView elle-même
        // et la "casser".
        onShouldStartLoadWithRequest={(req) => {
          // Autorise la première requête (uri initial) et celles vers Google Docs.
          if (req.url === viewerUri) return true;
          if (req.url.startsWith('https://docs.google.com/')) return true;
          if (req.url === url) return true;
          // Le reste s'ouvrira via Linking si nécessaire — pour l'instant on
          // laisse passer (l'expérience par défaut suffit).
          return true;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: '#ffffff',
  },
  webview: { flex: 1 },
});
