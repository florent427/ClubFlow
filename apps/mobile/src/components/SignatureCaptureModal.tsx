import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureScreen, {
  type SignatureViewRef,
} from 'react-native-signature-canvas';
import Ionicons from '@expo/vector-icons/Ionicons';
import { palette, radius, spacing, typography } from '../lib/theme';

type Props = {
  visible: boolean;
  /** Libellé affiché en titre de la modale (ex: "Signature parent 1"). */
  label: string;
  /** Appelé quand l'utilisateur valide (base64 PNG). Ferme la modale. */
  onSign: (base64Png: string) => void;
  /** Appelé quand l'utilisateur ferme sans signer. */
  onClose: () => void;
};

/**
 * Modale **plein écran** dédiée à la capture d'une signature.
 *
 * Contre l'ancien `SignaturePad` inline, cette modale isole le canvas
 * dans une `Modal` plein écran sans aucun ScrollView parent, donc les
 * gestes verticaux du canvas `signature_pad` ne sont plus mangés par
 * un scroll concurrent.
 *
 * **Décalage doigt ↔ trait** :
 * `react-native-signature-canvas` charge par défaut un CSS qui applique
 * `.m-signature-pad { width: 700px; height: 400px; position: fixed }`.
 * signature_pad calcule alors les coordonnées tactiles avec ces dimensions
 * fixes au lieu de la taille réelle du conteneur — d'où un drift entre
 * le doigt et le trait. Notre `webStyle` ci-dessous force le pad et le
 * canvas à occuper **exactement** 100 % de la WebView, et on monte le
 * `SignatureScreen` *après* l'animation slide de la modale (sinon les
 * dimensions sont 0 lors de l'init de signature_pad).
 *
 * UX :
 *  - Header sombre fixe (titre + bouton fermer)
 *  - Canvas plein écran (flex:1)
 *  - Footer fixe avec deux gros boutons "Effacer" / "Valider"
 *  - StatusBar style="light" pendant que la modale est ouverte
 */
export function SignatureCaptureModal({
  visible,
  label,
  onSign,
  onClose,
}: Props) {
  const ref = useRef<SignatureViewRef>(null);
  const insets = useSafeAreaInsets();

  // Délai avant de monter le `<SignatureScreen>` : on attend la fin de
  // l'animation slide de la modale pour que `canvas.offsetWidth/Height`
  // renvoie les bonnes valeurs au moment où signature_pad initialise
  // son coordonnée system. Sans ce délai, le canvas est créé avec des
  // dimensions 0 → coordonnées tactiles incohérentes après affichage.
  const [padReady, setPadReady] = useState(false);
  useEffect(() => {
    if (!visible) {
      setPadReady(false);
      return;
    }
    const t = setTimeout(() => setPadReady(true), 350);
    return () => clearTimeout(t);
  }, [visible]);

  /**
   * Style HTML injecté dans la WebView. **Critique** : on override les
   * dimensions par défaut de la lib (`width: 700px; height: 400px;
   * position: fixed`) qui causent le décalage doigt ↔ trait. Ici on
   * force tout en `100% / 100%` avec `position: relative`, et on
   * impose la même chose au `<canvas>` lui-même.
   */
  const webStyle = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #ffffff !important;
      overflow: hidden !important;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    .m-signature-pad {
      position: relative !important;
      width: 100% !important;
      height: 100% !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      box-shadow: none !important;
      background-color: #ffffff !important;
      font-size: 10px;
    }
    .m-signature-pad--body {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      border: none !important;
      background-color: #ffffff !important;
    }
    .m-signature-pad--body canvas {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #ffffff !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    .m-signature-pad--footer { display: none !important; }
    .description { display: none !important; }
  `;

  function handleClear() {
    ref.current?.clearSignature();
  }

  function handleConfirm() {
    // readSignature() déclenche onOK ci-dessous quand la signature est lue.
    ref.current?.readSignature();
  }

  function handleOK(signature: string) {
    onSign(signature);
  }

  function handleEmpty() {
    // L'utilisateur a cliqué "Valider" sans avoir tracé de trait.
    // On garde la modale ouverte et on ne propage rien.
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <View style={styles.flex}>
        {/* Header sombre fixe */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + spacing.sm },
          ]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Fermer sans signer"
          >
            <Ionicons name="close" size={26} color="#ffffff" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerEyebrow}>SIGNATURE MANUSCRITE</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </View>

        {/*
          Canvas plein écran. NB : on retire la `margin` autour pour
          éviter tout subpixel issue à la frontière de la WebView qui
          ferait dériver les coordonnées tactiles. Le contour visuel
          est dessiné par un `borderTop`/`borderBottom` discret sur le
          conteneur.
        */}
        <View style={styles.canvasContainer}>
          {padReady ? (
            <SignatureScreen
              ref={ref}
              onOK={handleOK}
              onEmpty={handleEmpty}
              descriptionText=""
              webStyle={webStyle}
              imageType="image/png"
              autoClear={false}
              backgroundColor="rgba(255,255,255,1)"
              penColor={palette.ink}
              // Réduire `dotSize`/`minWidth`/`maxWidth` pour un trait plus
              // fin et plus précis perceptuellement.
              dotSize={1}
              minWidth={1.2}
              maxWidth={2.6}
              // `trimWhitespace` peut décaler le PNG résultant à la lecture
              // — on le laisse off pour que la signature occupe les coordonnées
              // exactes du canvas.
              trimWhitespace={false}
            />
          ) : (
            // Placeholder pendant l'animation pour éviter un flash blanc.
            <View style={styles.padLoader} />
          )}
          <View pointerEvents="none" style={styles.canvasHint}>
            <Ionicons
              name="create-outline"
              size={18}
              color={palette.muted}
            />
            <Text style={styles.canvasHintText}>
              Tracez votre signature dans cette zone
            </Text>
          </View>
        </View>

        {/* Footer fixe — boutons natifs */}
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [
              styles.btn,
              styles.btnSecondary,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Effacer la signature"
          >
            <Ionicons
              name="refresh-outline"
              size={20}
              color={palette.body}
            />
            <Text style={styles.btnSecondaryText}>Effacer</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Valider la signature"
          >
            <Ionicons
              name="checkmark"
              size={20}
              color="#ffffff"
            />
            <Text style={styles.btnPrimaryText}>Valider</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: '#0f172a',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerEyebrow: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  headerTitle: {
    ...typography.h3,
    color: '#ffffff',
    marginTop: 2,
  },
  // Pas de margin/borderRadius ici — on veut que la WebView occupe un
  // rectangle pixel-perfect aligné sur le viewport, sinon les
  // coordonnées tactiles peuvent dériver de quelques px.
  canvasContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  padLoader: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  canvasHint: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  canvasHintText: {
    ...typography.caption,
    color: palette.muted,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: '#0f172a',
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 56,
    borderRadius: radius.lg,
  },
  btnSecondary: {
    backgroundColor: '#ffffff',
  },
  btnSecondaryText: {
    ...typography.bodyStrong,
    color: palette.body,
  },
  btnPrimary: {
    backgroundColor: palette.primary,
  },
  btnPrimaryText: {
    ...typography.bodyStrong,
    color: '#ffffff',
  },
});
