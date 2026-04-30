import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SignatureScreen, {
  type SignatureViewRef,
} from 'react-native-signature-canvas';
import Ionicons from '@expo/vector-icons/Ionicons';
import { palette, radius, spacing, typography } from '../lib/theme';

type Props = {
  /** Libellé affiché au-dessus du pad (ex: "Signature parent 1"). */
  label?: string;
  /** Appelé quand l'utilisateur valide sa signature (base64 PNG). */
  onSign: (base64Png: string) => void;
  /** Appelé quand le pad est effacé (ramène la valeur à null côté parent). */
  onClear?: () => void;
  /** Indicateur visuel "champ obligatoire". */
  required?: boolean;
  /** Indicateur visuel "déjà signé" (signature en mémoire). */
  signed?: boolean;
};

/**
 * Pad de signature tactile utilisant `react-native-signature-canvas`
 * (WebView + signature_pad sous le capot).
 *
 * NOTE : la lib expose un footer interne avec deux boutons "Effacer" et
 * "Valider". Le `onOK` callback récupère un dataURL `data:image/png;base64,...`
 * que le parent transmet au backend tel quel.
 */
export function SignaturePad({
  label,
  onSign,
  onClear,
  required,
  signed,
}: Props) {
  const ref = useRef<SignatureViewRef>(null);
  const [hasSignature, setHasSignature] = useState(Boolean(signed));

  const handleOK = (signature: string) => {
    onSign(signature);
    setHasSignature(true);
  };

  const handleClear = () => {
    setHasSignature(false);
    onClear?.();
  };

  // Style HTML injecté dans la WebView pour matcher la palette de l'app.
  // - Boutons en indigo (palette.primary)
  // - Crayon en encre foncée (palette.ink)
  // - Pas de marge sur le canvas
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: none; background-color: #ffffff; }
    .m-signature-pad--footer { background-color: ${palette.bgAlt}; }
    .m-signature-pad--footer .description { color: ${palette.muted}; font-size: 12px; }
    .m-signature-pad--footer .button {
      background-color: ${palette.primary};
      color: #ffffff;
      border-radius: ${radius.md}px;
      padding: 8px 14px;
      font-weight: 600;
      border: none;
    }
    .m-signature-pad--footer .button.clear {
      background-color: #ffffff;
      color: ${palette.body};
      border: 1px solid ${palette.borderStrong};
    }
    body, html { background-color: #ffffff; margin: 0; padding: 0; }
  `;

  return (
    <View style={styles.wrap}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {label}
            {required ? <Text style={styles.requiredMark}> *</Text> : null}
          </Text>
          {hasSignature ? (
            <View style={styles.signedBadge}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={palette.success}
              />
              <Text style={styles.signedText}>Signé</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.padBox}>
        <SignatureScreen
          ref={ref}
          onOK={handleOK}
          onClear={handleClear}
          descriptionText="Signez dans la zone ci-dessus"
          clearText="Effacer"
          confirmText="Valider"
          imageType="image/png"
          webStyle={webStyle}
          autoClear={false}
          backgroundColor="rgba(255,255,255,1)"
          penColor={palette.ink}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: { ...typography.smallStrong, color: palette.body },
  requiredMark: { color: palette.danger },
  signedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.successBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.successBorder,
  },
  signedText: {
    ...typography.caption,
    color: palette.successText,
  },
  padBox: {
    height: 240,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: '#ffffff',
  },
});
