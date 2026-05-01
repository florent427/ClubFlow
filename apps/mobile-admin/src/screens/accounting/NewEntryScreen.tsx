import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnimatedPressable,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import type { AccountingStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AccountingStackParamList, 'NewEntry'>;

export function NewEntryScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="NOUVELLE ÉCRITURE"
        title="Comment souhaitez-vous saisir ?"
        subtitle="Choisissez la méthode la plus rapide"
        compact
        showBack
      />
      <View style={styles.list}>
        <ActionCard
          icon="camera-outline"
          emoji="📷"
          title="Scanner un reçu / une facture"
          subtitle="Photo OU PDF. L'IA extrait, catégorise et propose la ventilation."
          onPress={() => navigation.navigate('ReceiptScanner')}
          tone="primary"
        />
        <ActionCard
          icon="create-outline"
          emoji="✏️"
          title="Saisie manuelle"
          subtitle="Compte, montant, libellé — vous gardez le contrôle"
          onPress={() => navigation.navigate('NewManualEntry')}
          tone="neutral"
        />
      </View>
    </ScreenContainer>
  );
}

function ActionCard({
  icon,
  emoji,
  title,
  subtitle,
  onPress,
  disabled = false,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  tone: 'primary' | 'accent' | 'neutral';
}) {
  const bg =
    tone === 'primary'
      ? palette.primaryTint
      : tone === 'accent'
        ? palette.accentLight
        : palette.bgAlt;
  const fg =
    tone === 'primary'
      ? palette.primary
      : tone === 'accent'
        ? palette.accentDark
        : palette.muted;
  return (
    <AnimatedPressable
      onPress={disabled ? () => {} : onPress}
      disabled={disabled}
      haptic
      style={[styles.card, disabled && { opacity: 0.55 }]}
    >
      <View style={[styles.iconBubble, { backgroundColor: bg }]}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Ionicons name={icon} size={20} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
        {disabled ? (
          <Text style={styles.soonBadge}>Bientôt disponible</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={22} color={palette.mutedSoft} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  emoji: {
    fontSize: 22,
  },
  cardTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  cardSubtitle: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
  soonBadge: {
    ...typography.caption,
    color: palette.warningText,
    marginTop: spacing.xs,
  },
});
