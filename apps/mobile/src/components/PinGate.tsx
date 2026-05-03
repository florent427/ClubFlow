import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  VIEWER_ME,
  VIEWER_VERIFY_PAYER_SPACE_PIN,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import { palette, radius, spacing, typography } from '../lib/theme';

type VerifyResponse = {
  viewerVerifyPayerSpacePin: { ok: boolean };
};

/**
 * Cache les enfants derrière un **gate PIN** quand le profil actif
 * a un PIN payeur défini ET qu'il n'a pas encore été déverrouillé
 * dans cette session.
 *
 * **Politique de session** : l'unlock est stocké dans une `Map` mémoire
 * scopée par `viewerMe.id`. Cette `Map` est volatile (process state),
 * donc :
 *  - **Switch de profil** (`CommonActions.reset` dans MemberProfileSwitcher)
 *    → l'app re-mount, la Map vit toujours mais l'unlock pour le
 *    nouveau profil n'existe pas → PIN redemandé
 *  - **Retour sur le profil protégé** depuis un autre profil → la Map
 *    est consultée par `viewerMe.id` ; si pas d'entrée pour ce profil
 *    actif (parce qu'on a switch puis revenu), PIN redemandé
 *  - **Tuer/relancer l'app** → mémoire reset → PIN redemandé
 *  - **Background → foreground** dans la même session → unlock conservé
 *
 * Ce comportement matche la demande UX : "la protection par PIN doit
 * être active à chaque fois qu'on revient sur le profil protégé".
 *
 * Cas où le gate est BYPASS (rendu direct des enfants) :
 *  - profil sans `payerSpacePinSet` (pas de PIN défini)
 *  - profil déjà déverrouillé dans cette session
 *
 * Le critère "profil payeur" n'est pas exposé sur mobile (contrairement
 * au web member-portal qui a `canManageMembershipCart`). On considère
 * donc que **toute profile avec un PIN défini doit être protégée**.
 */
const unlockedProfileIds = new Set<string>();

/** Reset l'unlock — appelé sur logout / switch de profil pour forcer
 *  une nouvelle demande de PIN au retour. */
export function clearAllPinUnlocks(): void {
  unlockedProfileIds.clear();
}

export function PinGate({ children }: { children: React.ReactNode }) {
  // eslint-disable-next-line no-console
  console.log('[PinGate] render');
  // **`fetchPolicy: 'network-only'`** ici (vs 'cache-first' partout
  // ailleurs) : sans ça, après un switch de profil, Apollo retourne
  // les données CACHÉES du profil PRÉCÉDENT (payer) avant que le
  // network ne refetch avec les données du nouveau profil (enfant).
  // Pendant cette fenêtre stale, isPayer=true côté cache → gate
  // déclenché à tort sur l'enfant. En forçant network-only on évite
  // ce flash. Le coût est ~500ms de spinner après chaque switch, ce
  // qui est acceptable pour la sécurité.
  const { data, loading, error } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
  });
  const me = data?.viewerMe;
  const profileId = me?.id ?? null;
  const pinSet = me?.payerSpacePinSet === true;
  // **Le PIN gate ne s'active QUE pour les payeurs** (adultes du foyer).
  // Les profils enfants ne sont jamais gatés, même si le User parent a
  // défini un PIN — le PIN protège l'accès aux infos sensibles
  // (factures, gestion adhésion) qui ne concernent que le payeur.
  const isPayer = me?.canManageMembershipCart === true;
  // eslint-disable-next-line no-console
  console.log(
    '[PinGate] loading?',
    loading,
    'profileId?',
    profileId,
    'pinSet?',
    pinSet,
    'isPayer?',
    isPayer,
    'error?',
    error?.message ?? null,
  );

  // L'état initial reflète si CE profil est déjà déverrouillé (ex.
  // navigation tab → tab dans la même session après unlock).
  const [unlocked, setUnlocked] = useState<boolean>(() =>
    profileId ? unlockedProfileIds.has(profileId) : false,
  );

  // **Fail-open après 5 secondes** SI ET SEULEMENT SI on n'a toujours
  // pas de data (API down, réseau coupé). Une fois que `data` arrive,
  // le timeout est désactivé pour ne pas dégrader la sécurité — le
  // PIN doit être respecté dès qu'on a les vraies infos. Sans cette
  // re-évaluation, le timeout déclenché AVANT l'arrivée des données
  // restait actif éternellement et bypassait le PIN à vie.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    // Si on a déjà des data ou une erreur, pas besoin de timeout.
    if (data || error) {
      // Si timeout précédemment déclenché mais qu'on vient de recevoir
      // les data, on annule le fail-open pour réactiver le gate.
      if (timedOut) {
        // eslint-disable-next-line no-console
        console.log('[PinGate] data arrivée → annule fail-open');
        setTimedOut(false);
      }
      return;
    }
    const t = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[PinGate] timeout 5s — fail-open (laisse passer sans gate PIN)',
      );
      setTimedOut(true);
    }, 5000);
    return () => clearTimeout(t);
  }, [data, error, timedOut]);

  // Sync quand profileId change (switch interne sans reset complet —
  // peu probable mais on couvre).
  useEffect(() => {
    if (!profileId) return;
    setUnlocked(unlockedProfileIds.has(profileId));
  }, [profileId]);

  // Fail-open uniquement quand on n'a vraiment AUCUNE data (timeout
  // ou erreur GraphQL fatale). Dès qu'on a `data`, on respecte la
  // logique normale du gate.
  if (!data && (error || timedOut)) {
    return <>{children}</>;
  }
  if (loading && !data) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }
  // Cas où aucun gate n'est nécessaire :
  //  - profil non-payeur (enfant)
  //  - profil sans PIN défini
  //  - profil déjà déverrouillé dans cette session
  //  - pas encore de profileId résolu
  if (!isPayer || !pinSet || unlocked || !profileId) {
    return <>{children}</>;
  }

  return (
    <PinPrompt
      onSuccess={() => {
        unlockedProfileIds.add(profileId);
        setUnlocked(true);
      }}
    />
  );
}

/**
 * Mélange un tableau (Fisher-Yates) — utilisé pour randomiser l'ordre
 * des chiffres du keypad PIN. Anti-shoulder-surfing : un observateur
 * qui mémorise les positions des doigts ne peut pas reconstituer le
 * code car les chiffres sont à des positions différentes à chaque
 * ouverture du gate.
 */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function PinPrompt({ onSuccess }: { onSuccess: () => void }) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Keypad mélangé — re-shuffled au mount + après chaque PIN incorrect.
  const [keypad, setKeypad] = useState<string[]>(() =>
    shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
  );
  const [verify, { loading }] = useMutation<VerifyResponse>(
    VIEWER_VERIFY_PAYER_SPACE_PIN,
  );

  // Reset l'erreur dès qu'on retape.
  useEffect(() => {
    if (error) setError(null);
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify(p: string): Promise<void> {
    if (!/^[0-9]{4}$/.test(p)) {
      setError('Le code doit contenir 4 chiffres.');
      return;
    }
    try {
      const res = await verify({ variables: { pin: p } });
      if (res.data?.viewerVerifyPayerSpacePin.ok) {
        onSuccess();
      } else {
        setError('Code PIN incorrect.');
        setPin('');
        // Re-shuffle après chaque mauvais code → empêche un attaquant
        // qui aurait observé les positions précédentes de tester un
        // pattern.
        setKeypad(
          shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vérification impossible.');
    }
  }

  // Auto-submit dès que 4 chiffres sont saisis — UX plus rapide.
  useEffect(() => {
    if (pin.length === 4 && !loading) {
      void handleVerify(pin);
    }
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDigit(d: string) {
    if (loading || pin.length >= 4) return;
    setPin(pin + d);
  }

  function handleBackspace() {
    if (loading || pin.length === 0) return;
    setPin(pin.slice(0, -1));
  }

  return (
    <View
      style={[
        styles.flex,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.center}>
        <View style={styles.card}>
          <View style={styles.iconBubble}>
            <Ionicons
              name="lock-closed"
              size={40}
              color={palette.primary}
            />
          </View>
          <Text style={styles.title}>Profil protégé</Text>
          <Text style={styles.subtitle}>
            Saisissez votre code PIN à 4 chiffres pour accéder à ce
            profil payeur.
          </Text>

          {/* Cells visuelles — affichent ●●●● */}
          <View style={styles.cellsRow}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.cell,
                  pin.length === i && styles.cellActive,
                ]}
              >
                <Text style={styles.cellText}>{pin[i] ? '●' : ''}</Text>
              </View>
            ))}
          </View>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={palette.primary} />
              <Text style={styles.loadingText}>Vérification…</Text>
            </View>
          ) : null}

          {/*
            Keypad numérique custom **mélangé** :
            - 9 premiers chiffres en grille 3×3
            - 10ème chiffre centré sur la dernière ligne, avec backspace
              à droite
            - Les positions des chiffres changent à chaque ouverture +
              après chaque PIN incorrect (anti-shoulder-surfing)
            - Pas de clavier système OS (le PIN n'est pas considéré
              comme un mot de passe — pas d'autocomplete password
              manager, pas de suggestions)
          */}
          <View style={styles.keypad}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={styles.keypadRow}>
                {[0, 1, 2].map((col) => {
                  const idx = row * 3 + col;
                  return (
                    <KeypadButton
                      key={idx}
                      label={keypad[idx]}
                      onPress={() => handleDigit(keypad[idx])}
                      disabled={loading}
                    />
                  );
                })}
              </View>
            ))}
            {/* Dernière ligne : [vide] [chiffre 10] [backspace] */}
            <View style={styles.keypadRow}>
              <View style={styles.keypadBtnSpacer} />
              <KeypadButton
                label={keypad[9]}
                onPress={() => handleDigit(keypad[9])}
                disabled={loading}
              />
              <KeypadButton
                icon="backspace-outline"
                onPress={handleBackspace}
                disabled={loading || pin.length === 0}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Touche du keypad PIN — chiffre OU icône (backspace). */
function KeypadButton({
  label,
  icon,
  onPress,
  disabled,
}: {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Effacer'}
      style={({ pressed }) => [
        styles.keypadBtn,
        pressed && !disabled && styles.keypadBtnPressed,
        disabled && { opacity: 0.4 },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={24} color={palette.ink} />
      ) : (
        <Text style={styles.keypadBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: palette.ink,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: palette.muted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  cellsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  cell: {
    width: 56,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primaryLight,
  },
  cellText: {
    fontSize: 28,
    fontWeight: '700',
    color: palette.ink,
  },
  // Keypad numérique custom (3 colonnes × 4 lignes). Mélangé à
  // chaque ouverture + après chaque PIN incorrect → anti-shoulder-surfing.
  keypad: {
    width: '100%',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  keypadBtn: {
    flex: 1,
    aspectRatio: 1.4,
    backgroundColor: palette.bg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  keypadBtnPressed: {
    backgroundColor: palette.primaryLight,
    borderColor: palette.primary,
  },
  keypadBtnSpacer: {
    flex: 1,
  },
  keypadBtnText: {
    fontSize: 26,
    fontWeight: '700',
    color: palette.ink,
  },
  error: {
    ...typography.smallStrong,
    color: palette.danger,
    marginTop: spacing.xs,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  loadingText: {
    ...typography.small,
    color: palette.muted,
  },
});
