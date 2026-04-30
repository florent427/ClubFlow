import { useRef } from 'react';
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
 * Cette modale remplace l'ancien `SignaturePad` inline qui était noyé
 * dans un `ScrollView`. Le souci avec un canvas de signature à l'intérieur
 * d'un ScrollView : `react-native-signature-canvas` utilise une WebView
 * interne (`signature_pad`) ; les gestes verticaux y sont **interceptés**
 * par le ScrollView parent quand l'utilisateur essaie de tracer un trait
 * → résultat, on ne capture que quelques points.
 *
 * Solution radicale : on isole la signature dans une modale plein écran
 * **sans aucun ScrollView**. Le canvas occupe tout l'espace disponible
 * (`flex: 1`), il ne peut donc pas être scrollé par erreur.
 *
 * UX :
 *  - Header sombre fixe (titre + bouton fermer)
 *  - Canvas plein écran (95 % de la hauteur)
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

  // Style HTML injecté dans la WebView pour matcher la palette de l'app.
  // On masque le footer interne car on contrôle Effacer/Valider depuis RN.
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; height: 100%; }
    .m-signature-pad--body { border: none; background-color: #ffffff; }
    .m-signature-pad--footer { display: none; }
    body, html { background-color: #ffffff; margin: 0; padding: 0; height: 100%; }
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

        {/* Canvas plein écran — flex:1, AUCUN ScrollView parent */}
        <View style={styles.canvasContainer}>
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
          />
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
  canvasContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    margin: spacing.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
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
