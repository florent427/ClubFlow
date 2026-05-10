import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as storage from '../lib/storage';
import { palette, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * URL de l'admin web ClubFlow. Lit `EXPO_PUBLIC_ADMIN_APP_URL` injecté
 * au build (cf. eas.json). Fallback prod en dernier recours.
 */
const ADMIN_BASE_URL =
  process.env.EXPO_PUBLIC_ADMIN_APP_URL ??
  'https://app.clubflow.topdigital.re';

/**
 * Mode Admin pour mobile : ouvre l'admin web dans une WebView avec
 * SSO automatique via URL hash (#sso=<token>&club=<clubId>). L'admin
 * web (apps/admin/src/main.tsx) parse le hash au boot, stocke en
 * localStorage local et clean l'URL.
 *
 * Avantage : zéro réécriture native — toute la richesse fonctionnelle
 * de l'admin web (membres, panier, factures, planning, settings...)
 * est immédiatement disponible sur mobile.
 *
 * Toolbar custom en haut avec bouton retour vers l'espace membre +
 * back navigation Android intercepté pour reculer dans la WebView
 * au lieu de quitter l'écran.
 */
export function AdminWebViewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  // Build l'URL au mount avec le SSO hash. Le hash est jamais envoyé
  // au serveur (côté client uniquement), donc pas de fuite dans Caddy
  // logs ou CDN.
  useEffect(() => {
    void (async () => {
      const token = await storage.getToken();
      const club = await storage.getSelectedClub();
      if (!token || !club) {
        // Pas de session valide → retour à l'espace membre
        navigation.goBack();
        return;
      }
      const sep = ADMIN_BASE_URL.includes('#') ? '&' : '#';
      setAdminUrl(
        `${ADMIN_BASE_URL}${sep}sso=${encodeURIComponent(
          token,
        )}&club=${encodeURIComponent(club.id)}`,
      );
    })();
  }, [navigation]);

  // Android : back button du système → recule dans la WebView si
  // possible, sinon ferme l'écran (retour au membre).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false; // laisse RN handler le back par défaut
    });
    return () => sub.remove();
  }, [canGoBack]);

  function handleNavStateChange(state: WebViewNavigation): void {
    setCanGoBack(state.canGoBack);
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      {/* Toolbar custom : retour + titre */}
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Retour à l'espace membre"
          style={({ pressed }) => [
            styles.toolbarBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="close" size={22} color="#ffffff" />
          <Text style={styles.toolbarBtnText}>Espace membre</Text>
        </Pressable>
        <Text style={styles.toolbarTitle}>Administration</Text>
        {/* Spacer pour centrer le titre */}
        <View style={{ width: 100 }} />
      </View>

      {adminUrl ? (
        <WebView
          ref={webRef}
          source={{ uri: adminUrl }}
          style={styles.flex}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={handleNavStateChange}
          // Active JS, storage, cookies — l'admin a besoin de tout ça.
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          // Permissions UI : pull-to-refresh, scroll bounce, etc.
          pullToRefreshEnabled
          allowsBackForwardNavigationGestures
          // Évite les flash blancs au navigation in-app : fond conservé.
          contentMode="mobile"
          // Inject une regex CSS de masquage du link "Mode membre" interne
          // de l'admin (s'il existe) pour ne pas dupliquer avec notre
          // bouton toolbar. Optionnel mais évite la confusion.
        />
      ) : null}

      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#1d4ed8' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#1d4ed8',
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    minWidth: 100,
  },
  toolbarBtnText: {
    ...typography.smallStrong,
    color: '#ffffff',
    fontSize: 12,
  },
  toolbarTitle: {
    ...typography.bodyStrong,
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(29, 78, 216, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
