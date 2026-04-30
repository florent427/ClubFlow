import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { palette, radius } from '../lib/theme';

type Props = {
  /** URL du PDF (absolue HTTP/HTTPS). Sera passée au viewer sans modif sur iOS,
   *  ou wrappée dans Google Docs viewer sur Android. */
  url: string;
  /**
   * Hauteur fixe en pixels. Si omis (ou 0), le viewer prend toute la
   * hauteur de son parent via `flex: 1` — pratique pour un écran
   * d'aperçu plein écran (`DocumentPreviewScreen`).
   */
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
 *   `GET /media/:id` public-by-UUID, et l'URL doit pointer sur l'IP LAN —
 *   pas localhost — sinon Google ne peut pas la fetcher).
 *
 * Pour les usages plus exigeants (recherche dans le PDF, sélection texte,
 * mode hors-ligne), on basculerait sur `react-native-pdf` mais le module
 * natif n'est pas compatible Expo Go.
 */
export function InlinePdfViewer({ url, height }: Props) {
  const viewerUri =
    Platform.OS === 'android'
      ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
      : url;

  // Si height fourni > 0, viewer à hauteur fixe ; sinon, flex:1 pour
  // remplir l'espace disponible du parent.
  const containerStyle =
    height && height > 0
      ? [styles.wrap, { height }]
      : [styles.wrap, styles.flex];

  return (
    <View style={containerStyle}>
      <WebView
        source={{ uri: viewerUri }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator color={palette.primary} size="large" />
          </View>
        )}
        scalesPageToFit
        style={styles.webview}
        // Permet le pinch-zoom sur iOS.
        bounces={false}
        // Désactive le sélecteur de menu contextuel (pas pertinent dans un viewer).
        textInteractionEnabled={false}
        // Empêche les liens (rare dans un PDF) de naviguer la WebView elle-même
        // et la "casser".
        onShouldStartLoadWithRequest={(req) => {
          if (req.url === viewerUri) return true;
          if (req.url.startsWith('https://docs.google.com/')) return true;
          if (req.url === url) return true;
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
  flex: { flex: 1 },
  webview: { flex: 1 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
});
