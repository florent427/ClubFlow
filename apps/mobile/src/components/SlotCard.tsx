import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ViewerSlot } from '../lib/viewer-types';
import { formatRangeHours, slotCalendarBits } from '../lib/format';
import {
  gradients,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../lib/theme';

type Props = { slot: ViewerSlot; large?: boolean };

export function SlotCard({ slot, large }: Props) {
  const { weekday, dayNum } = slotCalendarBits(slot.startsAt);
  const coach = [slot.coachFirstName, slot.coachLastName]
    .filter(Boolean)
    .join(' ');
  return (
    <View style={[styles.row, large && styles.rowLg]}>
      <LinearGradient
        colors={gradients.primary.colors}
        start={gradients.primary.start}
        end={gradients.primary.end}
        style={styles.cal}
      >
        <Text style={styles.dow}>{weekday}</Text>
        <Text style={styles.dayNum}>{dayNum}</Text>
      </LinearGradient>
      <View style={styles.body}>
        <Text style={large ? styles.titleLg : styles.title} numberOfLines={1}>
          {slot.title}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color={palette.muted} />
          <Text style={styles.meta}>
            {formatRangeHours(slot.startsAt, slot.endsAt)}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={palette.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {slot.venueName}
          </Text>
        </View>
        {coach ? (
          <View style={styles.metaRow}>
            <Ionicons name="person-outline" size={13} color={palette.muted} />
            <Text style={styles.meta} numberOfLines={1}>
              {coach}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.sm,
  },
  rowLg: {
    padding: spacing.lg,
  },
  cal: {
    width: 56,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dow: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    fontFamily: typography.smallStrong.fontFamily,
    letterSpacing: 0.5,
  },
  dayNum: {
    fontSize: 24,
    color: '#ffffff',
    fontFamily: typography.h1.fontFamily,
    letterSpacing: -0.5,
  },
  body: { flex: 1, gap: 2 },
  title: { ...typography.bodyStrong, color: palette.ink, marginBottom: 4 },
  titleLg: { ...typography.h3, color: palette.ink, marginBottom: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  meta: { ...typography.small, color: palette.muted },
});
