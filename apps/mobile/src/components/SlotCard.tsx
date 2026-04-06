import { StyleSheet, Text, View } from 'react-native';
import type { ViewerSlot } from '../lib/viewer-types';
import { formatRangeHours, slotCalendarBits } from '../lib/format';

type Props = { slot: ViewerSlot; large?: boolean };

export function SlotCard({ slot, large }: Props) {
  const { weekday, dayNum } = slotCalendarBits(slot.startsAt);
  const coach = [slot.coachFirstName, slot.coachLastName]
    .filter(Boolean)
    .join(' ');
  return (
    <View style={[styles.row, large && styles.rowLg]}>
      <View style={styles.cal}>
        <Text style={styles.dow}>{weekday}</Text>
        <Text style={styles.dayNum}>{dayNum}</Text>
      </View>
      <View style={styles.body}>
        <Text style={large ? styles.titleLg : styles.title}>{slot.title}</Text>
        <Text style={styles.meta}>
          {formatRangeHours(slot.startsAt, slot.endsAt)} · {slot.venueName}
          {coach ? ` · ${large ? `Coach : ${coach}` : coach}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  rowLg: {
    padding: 14,
  },
  cal: {
    width: 48,
    alignItems: 'center',
    marginRight: 12,
  },
  dow: {
    fontSize: 11,
    color: '#666',
    textTransform: 'capitalize',
  },
  dayNum: {
    fontSize: 22,
    fontWeight: '700',
  },
  body: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  titleLg: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  meta: { fontSize: 14, color: '#555' },
});
