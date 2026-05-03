import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  TextField,
  memberDisplayName,
  palette,
  spacing,
  typography,
  useDebounced,
  type BottomAction,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CLUB_MEMBERS } from '../../lib/documents/members';
import {
  CLUB_COURSE_SLOTS,
  CLUB_VENUES,
  CREATE_CLUB_COURSE_SLOT,
} from '../../lib/documents/planning';
import { frDateTimeToIso } from '../../lib/forms';
import type { PlanningStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<PlanningStackParamList, 'NewCourseSlot'>;

type Venue = { id: string; name: string; addressLine: string | null };
type VenuesData = { clubVenues: Venue[] };

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  pseudo: string | null;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
};
type MembersData = { clubMembers: Member[] };

export function NewCourseSlotScreen() {
  const navigation = useNavigation<Nav>();

  const [title, setTitle] = useState('');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [bookingCapacity, setBookingCapacity] = useState('');

  const [venuePickerOpen, setVenuePickerOpen] = useState(false);
  const [coachPickerOpen, setCoachPickerOpen] = useState(false);

  const venuesQuery = useQuery<VenuesData>(CLUB_VENUES, { errorPolicy: 'all' });
  const membersQuery = useQuery<MembersData>(CLUB_MEMBERS, {
    errorPolicy: 'all',
  });

  const [createSlot, { loading }] = useMutation(CREATE_CLUB_COURSE_SLOT, {
    refetchQueries: [{ query: CLUB_COURSE_SLOTS }],
  });

  const venue = useMemo(
    () => venuesQuery.data?.clubVenues?.find((v) => v.id === venueId) ?? null,
    [venuesQuery.data, venueId],
  );
  const coach = useMemo(
    () =>
      membersQuery.data?.clubMembers?.find((m) => m.id === coachId) ?? null,
    [membersQuery.data, coachId],
  );

  const venueActions = useMemo<BottomAction[]>(() => {
    return (venuesQuery.data?.clubVenues ?? []).map((v) => ({
      key: v.id,
      label: v.name,
      icon: 'location-outline' as const,
      tone: v.id === venueId ? ('primary' as const) : ('neutral' as const),
    }));
  }, [venuesQuery.data, venueId]);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 1) {
      Alert.alert('Champs manquants', 'Le titre est obligatoire.');
      return;
    }
    if (!venueId) {
      Alert.alert('Champs manquants', 'Sélectionne une salle.');
      return;
    }
    if (!coachId) {
      Alert.alert('Champs manquants', 'Sélectionne un coach.');
      return;
    }
    const startsAt = frDateTimeToIso(startDate, startTime);
    const endsAt = frDateTimeToIso(endDate, endTime);
    if (!startsAt || !endsAt) {
      Alert.alert(
        'Dates invalides',
        'Vérifie le format JJ/MM/AAAA et HH:MM.',
      );
      return;
    }

    let capacity: number | undefined = undefined;
    if (bookingEnabled && bookingCapacity.trim().length > 0) {
      const n = Number(bookingCapacity.trim());
      if (!Number.isFinite(n) || n < 0) {
        Alert.alert('Capacité invalide', 'La capacité doit être positive.');
        return;
      }
      capacity = n;
    }

    try {
      await createSlot({
        variables: {
          input: {
            title: trimmedTitle,
            venueId,
            coachMemberId: coachId,
            startsAt,
            endsAt,
            bookingEnabled,
            bookingCapacity: capacity,
          },
        },
      });
      Alert.alert('Créneau créé', 'Le créneau a bien été enregistré.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer le créneau.');
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="NOUVEAU"
        title="Nouveau créneau"
        subtitle="Cours, entraînement, atelier…"
        showBack
        compact
      />

      <View style={styles.body}>
        <Card title="Informations">
          <View style={styles.fields}>
            <TextField
              label="Titre *"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex : Karaté ado"
              autoCapitalize="sentences"
            />
            <PickerRow
              label="Salle *"
              icon="location-outline"
              valueLabel={venue?.name ?? 'Choisir une salle'}
              onPress={() => setVenuePickerOpen(true)}
            />
            <PickerRow
              label="Coach *"
              icon="person-outline"
              valueLabel={
                coach
                  ? memberDisplayName(coach)
                  : 'Choisir un coach (membre du club)'
              }
              onPress={() => setCoachPickerOpen(true)}
            />
          </View>
        </Card>

        <Card title="Quand">
          <View style={styles.fields}>
            <Text style={styles.subhead}>Début</Text>
            <View style={styles.row}>
              <View style={styles.rowFlex2}>
                <TextField
                  label="Date"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="JJ/MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.rowFlex1}>
                <TextField
                  label="Heure"
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="HH:MM"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <Text style={styles.subhead}>Fin</Text>
            <View style={styles.row}>
              <View style={styles.rowFlex2}>
                <TextField
                  label="Date"
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="JJ/MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.rowFlex1}>
                <TextField
                  label="Heure"
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="HH:MM"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          </View>
        </Card>

        <Card title="Réservations">
          <View style={styles.fields}>
            <View style={styles.pillsRow}>
              <Pill
                label={
                  bookingEnabled
                    ? 'Réservations ouvertes'
                    : 'Réservations fermées'
                }
                tone={bookingEnabled ? 'success' : 'neutral'}
                icon={
                  bookingEnabled
                    ? 'checkmark-circle-outline'
                    : 'close-circle-outline'
                }
                onPress={() => setBookingEnabled((v) => !v)}
              />
            </View>
            {bookingEnabled ? (
              <TextField
                label="Capacité"
                value={bookingCapacity}
                onChangeText={setBookingCapacity}
                placeholder="Illimitée si vide"
                keyboardType="number-pad"
              />
            ) : null}
          </View>
        </Card>

        <Button
          label="Créer le créneau"
          variant="primary"
          icon="checkmark-circle-outline"
          onPress={handleSubmit}
          loading={loading}
          fullWidth
        />
      </View>

      {/* Picker salle (BottomActionBar simple) */}
      <BottomActionBar
        visible={venuePickerOpen}
        onClose={() => setVenuePickerOpen(false)}
        title="Choisir une salle"
        actions={
          venueActions.length > 0
            ? venueActions
            : [
                {
                  key: 'none',
                  label: 'Aucune salle disponible',
                  icon: 'alert-circle-outline',
                  disabled: true,
                },
              ]
        }
        onAction={(key) => {
          if (key !== 'none') setVenueId(key);
          setVenuePickerOpen(false);
        }}
      />

      {/* Picker coach (modal custom avec recherche) */}
      <CoachPickerModal
        visible={coachPickerOpen}
        onClose={() => setCoachPickerOpen(false)}
        members={membersQuery.data?.clubMembers ?? []}
        selectedId={coachId}
        onSelect={(id) => {
          setCoachId(id);
          setCoachPickerOpen(false);
        }}
      />
    </ScreenContainer>
  );
}

function PickerRow({
  label,
  icon,
  valueLabel,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  valueLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.pickerRow}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.pickerBtn,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name={icon} size={18} color={palette.muted} />
        <Text style={styles.pickerValue} numberOfLines={1}>
          {valueLabel}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={palette.muted} />
      </Pressable>
    </View>
  );
}

function CoachPickerModal({
  visible,
  onClose,
  members,
  selectedId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  members: Member[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const list = members.filter((m) => m.status === 'ACTIVE');
    if (q.length === 0) return list;
    return list.filter(
      (m) =>
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        (m.pseudo?.toLowerCase().includes(q) ?? false) ||
        (m.email?.toLowerCase().includes(q) ?? false),
    );
  }, [members, debounced]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalSheet,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choisir un coach</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={palette.muted} />
            </Pressable>
          </View>
          <View style={styles.modalSearch}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un membre…"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              return (
                <Pressable
                  onPress={() => onSelect(item.id)}
                  style={({ pressed }) => [
                    styles.memberRow,
                    pressed && styles.memberRowPressed,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>
                      {memberDisplayName(item)}
                    </Text>
                    {item.email ? (
                      <Text style={styles.memberSub}>{item.email}</Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={palette.primary}
                    />
                  ) : null}
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.modalSep} />}
            ListEmptyComponent={
              <View style={styles.modalEmpty}>
                <Text style={styles.memberSub}>Aucun membre trouvé.</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  fields: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  rowFlex1: { flex: 1 },
  rowFlex2: { flex: 2 },
  subhead: { ...typography.smallStrong, color: palette.muted },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pickerRow: { gap: spacing.xs },
  pickerLabel: { ...typography.smallStrong, color: palette.body },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  pickerValue: {
    flex: 1,
    ...typography.body,
    color: palette.ink,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: spacing.sm,
    height: '75%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.borderStrong,
    marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  modalTitle: { ...typography.h2, color: palette.ink },
  modalSearch: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
    gap: spacing.md,
  },
  memberRowPressed: { backgroundColor: palette.bgAlt },
  memberName: { ...typography.bodyStrong, color: palette.ink },
  memberSub: { ...typography.small, color: palette.muted },
  modalSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginLeft: spacing.lg,
  },
  modalEmpty: { padding: spacing.xxl, alignItems: 'center' },
});
