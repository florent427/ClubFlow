import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_MEMBERSHIP_SETTINGS,
  UPDATE_MEMBERSHIP_SETTINGS,
} from '../../lib/documents/settings';

type Data = {
  clubMembershipSettings: {
    fullPriceFirstMonths: number;
  } | null;
};

export function AdhesionSettingsScreen() {
  const { data, loading } = useQuery<Data>(CLUB_MEMBERSHIP_SETTINGS, {
    errorPolicy: 'all',
  });

  const [fullPriceFirstMonths, setFullPriceFirstMonths] = useState('0');

  useEffect(() => {
    if (data?.clubMembershipSettings) {
      setFullPriceFirstMonths(
        String(data.clubMembershipSettings.fullPriceFirstMonths ?? 0),
      );
    }
  }, [data]);

  const [updateSettings, updateState] = useMutation(
    UPDATE_MEMBERSHIP_SETTINGS,
    { refetchQueries: [{ query: CLUB_MEMBERSHIP_SETTINGS }] },
  );

  const handleSave = async () => {
    const trimmed = fullPriceFirstMonths.trim();
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      Alert.alert(
        'Valeur invalide',
        "Le nombre de mois doit être un entier positif (0, 1, 2…).",
      );
      return;
    }
    try {
      await updateSettings({
        variables: { fullPriceFirstMonths: value },
      });
      Alert.alert('Réglages enregistrés', 'La période de plein tarif est mise à jour.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Impossible d'enregistrer.");
    }
  };

  if (loading && !data) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ADHÉSION"
          title="Configuration adhésions"
          showBack
          compact
        />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="ADHÉSION"
        title="Configuration adhésions"
        subtitle="Paramètres globaux"
        showBack
        compact
      />
      <View style={styles.body}>
        <Card title="Calcul du prix plein">
          <View style={styles.fields}>
            <TextField
              label="Mois plein tarif au début"
              value={fullPriceFirstMonths}
              onChangeText={setFullPriceFirstMonths}
              placeholder="0"
              keyboardType="number-pad"
              hint="Nombre de mois à plein tarif avant le passage au tarif prorata."
            />
            <Text style={styles.note}>
              Mettez 0 pour appliquer immédiatement le tarif au prorata des
              mois restants. Les remises éventuelles (famille, fidélité…)
              continuent de s'appliquer indépendamment.
            </Text>
          </View>
        </Card>

        <Button
          label="Enregistrer"
          variant="primary"
          icon="checkmark-circle-outline"
          onPress={handleSave}
          loading={updateState.loading}
          fullWidth
        />
      </View>
    </ScreenContainer>
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
  note: { ...typography.small, color: palette.muted },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
  },
});
