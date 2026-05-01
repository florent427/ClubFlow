import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
import { palette, radius, spacing, typography } from '../lib/theme';

type Props = {
  /** URL absolue HTTP(S) du PDF — typiquement `http://192.168.1.24:3000/media/<uuid>`
   *  en dev, ou un CDN public en prod. */
  url: string;
  /**
   * Hauteur fixe en pixels. Si omis (ou 0), le viewer prend toute la
   * hauteur du parent via `flex: 1`.
   */
  height?: number;
  /**
   * Callback quand l'utilisateur clique le lien "Ouvrir dans le
   * navigateur" du fallback. Si non fourni, le lien n'apparaît pas.
   */
  onOpenExternal?: () => void;
};

/**
 * Affiche un PDF inline via WebView, cross-platform.
 *
 * **Stratégie commune iOS / Android** : on injecte un mini-viewer HTML
 * basé sur **PDF.js** (chargé depuis CDN cdnjs) dans la WebView. Le JS
 * de PDF.js fait `fetch(url)` *depuis le contexte du device* — il a
 * donc accès au LAN (`http://192.168.1.24:3000/media/...`), contrairement
 * à Google Docs Viewer dont les serveurs publics ne peuvent pas voir
 * le réseau local.
 *
 * Pourquoi pas la WebView native iOS qui sait déjà afficher des PDFs ?
 *
 * Pour avoir un comportement **identique** sur iOS et Android et un
 * fallback unifié en cas d'erreur. Les avantages secondaires :
 *  - rendu cohérent quelle que soit la plateforme
 *  - injection d'un message "chargement…" centralisé
 *  - capture des erreurs de fetch (CORS, 404, réseau) pour proposer
 *    un fallback "Ouvrir dans le navigateur"
 *
 * Pour les usages plus exigeants (recherche dans le PDF, sélection texte,
 * mode hors-ligne), on basculerait sur `react-native-pdf` mais le module
 * natif n'est pas compatible Expo Go.
 */
export function InlinePdfViewer({ url, height, onOpenExternal }: Props) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const html = useMemo(() => buildViewerHtml(url), [url]);

  const containerStyle =
    height && height > 0
      ? [styles.wrap, { height }]
      : [styles.wrap, styles.flex];

  if (errorMessage) {
    return (
      <View style={containerStyle}>
        <View style={styles.errorBox}>
          <Ionicons
            name="alert-circle-outline"
            size={36}
            color={palette.dangerText}
          />
          <Text style={styles.errorTitle}>PDF inaccessible</Text>
          <Text style={styles.errorMsg}>{errorMessage}</Text>
          {onOpenExternal ? (
            <Pressable
              onPress={onOpenExternal}
              style={({ pressed }) => [
                styles.fallbackBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name="open-outline"
                size={16}
                color={palette.primary}
              />
              <Text style={styles.fallbackText}>
                Ouvrir dans le navigateur
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <WebView
        // `originWhitelist=['*']` indispensable : sans ça la WebView refuse
        // les fetch cross-origin depuis une source HTML inline.
        originWhitelist={['*']}
        source={{ html }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator color={palette.primary} size="large" />
            <Text style={styles.loaderText}>Chargement du PDF…</Text>
          </View>
        )}
        // Permet le pinch-zoom sur iOS.
        scalesPageToFit
        bounces={false}
        textInteractionEnabled={false}
        // Capture les `postMessage('error|...')` envoyés depuis le viewer
        // HTML quand fetch/PDF.js échoue.
        onMessage={(evt) => {
          const data = evt.nativeEvent.data ?? '';
          if (data.startsWith('error|')) {
            setErrorMessage(data.slice('error|'.length) || 'Échec du chargement.');
          }
        }}
        // Fallback réseau RN-level (URL malformée, http bloqué…).
        onError={(evt) => {
          setErrorMessage(
            evt.nativeEvent.description ?? 'Erreur de chargement.',
          );
        }}
        // Sur Android par défaut WebView bloque le JavaScript / fetch — on
        // l'active explicitement.
        javaScriptEnabled
        domStorageEnabled
        // Autorise HTTP cleartext sur Android API < 28 quand on consomme
        // l'API en LAN dev. (Sur Expo Go le manifest autorise déjà
        // usesCleartextTraffic="true".)
        mixedContentMode="always"
      />
    </View>
  );
}

/**
 * Génère un mini-viewer HTML qui charge PDF.js depuis cdnjs et rend
 * toutes les pages dans des `<canvas>` empilés. Communique les erreurs
 * via `window.ReactNativeWebView.postMessage('error|<msg>')`.
 *
 * On utilise PDF.js v3 (UMD global `pdfjsLib`) plutôt que v5 (ESM) qui
 * complique l'inline dans une WebView sans bundler.
 */
function buildViewerHtml(pdfUrl: string): string {
  const safeUrl = JSON.stringify(pdfUrl);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=3, user-scalable=yes" />
<style>
  html, body { margin: 0; padding: 0; background: #f1f5f9; height: 100%; }
  body { -webkit-text-size-adjust: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #viewer { padding: 8px 0; }
  .page-canvas {
    display: block;
    margin: 0 auto 12px auto;
    box-shadow: 0 2px 12px rgba(15, 23, 42, 0.12);
    background: #ffffff;
    max-width: calc(100% - 16px);
    height: auto;
  }
  #status {
    text-align: center;
    color: #64748b;
    font-size: 14px;
    padding: 24px 16px;
  }
  .spinner {
    display: inline-block;
    width: 20px; height: 20px;
    border: 3px solid #cbd5e1;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: middle;
    margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="status"><span class="spinner"></span>Chargement du PDF…</div>
<div id="viewer"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
(function() {
  function postError(msg) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage('error|' + msg);
    } catch (e) {}
    var status = document.getElementById('status');
    if (status) {
      status.innerHTML = '';
      status.textContent = msg;
      status.style.color = '#b91c1c';
    }
  }

  if (typeof pdfjsLib === 'undefined') {
    postError("Impossible de charger le moteur PDF (PDF.js).");
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var url = ${safeUrl};

  // On fetch le binaire nous-mêmes pour avoir un message d'erreur clair
  // et éviter les soucis de header Range / CORS preflight.
  fetch(url)
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
      return res.arrayBuffer();
    })
    .then(function(buffer) {
      return pdfjsLib.getDocument({ data: buffer }).promise;
    })
    .then(function(pdf) {
      var status = document.getElementById('status');
      if (status) status.style.display = 'none';
      var viewer = document.getElementById('viewer');
      var maxPages = Math.min(pdf.numPages, 50); // garde-fou
      var renderChain = Promise.resolve();
      for (var i = 1; i <= maxPages; i++) {
        (function(pageNum) {
          renderChain = renderChain.then(function() {
            return pdf.getPage(pageNum).then(function(page) {
              var unscaled = page.getViewport({ scale: 1 });
              var availWidth = window.innerWidth - 16;
              var scale = availWidth / unscaled.width;
              var viewport = page.getViewport({ scale: scale });
              var canvas = document.createElement('canvas');
              canvas.className = 'page-canvas';
              canvas.width = Math.floor(viewport.width);
              canvas.height = Math.floor(viewport.height);
              viewer.appendChild(canvas);
              return page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
              }).promise;
            });
          });
        })(i);
      }
      return renderChain;
    })
    .catch(function(err) {
      postError(err && err.message ? err.message : 'Échec du chargement.');
    });
})();
</script>
</body>
</html>`;
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
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    gap: spacing.sm,
  },
  loaderText: {
    ...typography.small,
    color: palette.muted,
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  errorMsg: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
  },
  fallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.primaryTint,
    borderWidth: 1,
    borderColor: palette.primaryLight,
  },
  fallbackText: {
    ...typography.smallStrong,
    color: palette.primary,
  },
});
