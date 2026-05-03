import { useMutation } from '@apollo/client/react';
import {
  Card,
  GradientButton,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_ANNOUNCEMENTS,
  CREATE_CLUB_ANNOUNCEMENT,
} from '../../lib/documents/club-life';
import type { ClubLifeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<
  ClubLifeStackParamList,
  'NewAnnouncement'
>;

export function NewAnnouncementScreen() {
  const navigation = useNavigation<Nav>();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [publishNow, setPublishNow] = useState(true);

  const [createAnnouncement, { loading: creating }] = useMutation(
    CREATE_CLUB_ANNOUNCEMENT,
    {
      refetchQueries: [{ query: CLUB_ANNOUNCEMENTS }],
    },
  );

  const onSubmit = async () => {
    if (title.trim().length === 0 || body.trim().length === 0) {
      Alert.alert(
        'Champs requis',
        'Le titre et le contenu sont obligatoires.',
      );
      return;
    }
    try {
      await createAnnouncement({
        variables: {
          input: {
            title: title.trim(),
            body: body.trim(),
            pinned,
            publishNow,
          },
        },
      });
      Alert.alert(
        'Annonce créée',
        publishNow
          ? 'L\'annonce a été publiée.'
          : 'Le brouillon a été enregistré.',
      );
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error
          ? err.message
          : 'Impossible de créer l\'annonce.',
      );
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="NOUVELLE"
        title="Nouvelle annonce"
        showBack
        compact
      />

      <View style={styles.content}>
        <Card title="Contenu">
          <View style={styles.stack}>
            <TextField
              label="Titre *"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex : Tournoi inter-clubs samedi"
              maxLength={200}
            />
            <TextField
              label="Message *"
              value={body}
              onChangeText={setBody}
              placeholder="Décrivez l'événement, les modalités, les contacts…"
              multiline
              numberOfLines={6}
              maxLength={20_000}
            />
          </View>
        </Card>

        <Card title="Options">
          <View style={styles.optionsRow}>
            <View style={styles.optionLabel}>
              <Text style={styles.optionTitle}>Épingler</Text>
              <Text style={styles.optionHint}>
                Maintien en haut de la liste pour tous les membres.
              </Text>
            </View>
            <Pill
              label={pinned ? 'Épinglée' : 'Non épinglée'}
              tone={pinned ? 'warning' : 'neutral'}
              icon={pinned ? 'pin' : 'pin-outline'}
              onPress={() => setPinned((v) => !v)}
            />
          </View>

          <View style={[styles.optionsRow, styles.optionsRowBordered]}>
            <View style={styles.optionLabel}>
              <Text style={styles.optionTitle}>Publication</Text>
              <Text style={styles.optionHint}>
                Publier immédiatement ou enregistrer en brouillon.
              </Text>
            </View>
            <Pill
              label={publishNow ? 'Publier' : 'Brouillon'}
              tone={publishNow ? 'success' : 'neutral'}
              icon={publishNow ? 'send' : 'document-outline'}
              onPress={() => setPublishNow((v) => !v)}
            />
          </View>
        </Card>

        <GradientButton
          label={creating ? 'Création…' : 'Créer'}
          onPress={() => void onSubmit()}
          loading={creating}
          disabled={creating}
          iconRight="arrow-forward"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  stack: { gap: spacing.md },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  optionsRowBordered: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  optionLabel: { flex: 1, gap: 2 },
  optionTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  optionHint: {
    ...typography.small,
    color: palette.muted,
  },
});
