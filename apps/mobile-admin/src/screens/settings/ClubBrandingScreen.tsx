import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
} from '@clubflow/mobile-shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import {
  CLUB_BRANDING_DETAIL,
  UPDATE_CLUB_BRANDING,
} from '../../lib/documents/settings';

type ClubData = {
  club: {
    id: string;
    name: string;
    logoUrl: string | null;
    siret: string | null;
    address: string | null;
    legalMentions: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  } | null;
};

export function ClubBrandingScreen() {
  const { data, loading } = useQuery<ClubData>(CLUB_BRANDING_DETAIL, {
    errorPolicy: 'all',
  });

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [siret, setSiret] = useState('');
  const [address, setAddress] = useState('');
  const [legalMentions, setLegalMentions] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  useEffect(() => {
    if (data?.club) {
      setName(data.club.name ?? '');
      setLogoUrl(data.club.logoUrl ?? '');
      setSiret(data.club.siret ?? '');
      setAddress(data.club.address ?? '');
      setLegalMentions(data.club.legalMentions ?? '');
      setContactPhone(data.club.contactPhone ?? '');
      setContactEmail(data.club.contactEmail ?? '');
    }
  }, [data]);

  const [updateBranding, updateState] = useMutation(UPDATE_CLUB_BRANDING, {
    refetchQueries: [{ query: CLUB_BRANDING_DETAIL }],
  });

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 1) {
      Alert.alert('Champ manquant', 'Le nom du club ne peut pas être vide.');
      return;
    }
    try {
      await updateBranding({
        variables: {
          input: {
            name: trimmedName,
            logoUrl: logoUrl.trim().length > 0 ? logoUrl.trim() : null,
            siret: siret.trim().length > 0 ? siret.trim() : null,
            address: address.trim().length > 0 ? address.trim() : null,
            legalMentions:
              legalMentions.trim().length > 0 ? legalMentions.trim() : null,
            contactPhone:
              contactPhone.trim().length > 0 ? contactPhone.trim() : null,
            contactEmail:
              contactEmail.trim().length > 0 ? contactEmail.trim() : null,
          },
        },
      });
      Alert.alert('Identité mise à jour', 'Les informations du club sont enregistrées.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Impossible d'enregistrer.");
    }
  };

  if (loading && !data) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="IDENTITÉ"
          title="Identité du club"
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
        eyebrow="IDENTITÉ"
        title="Identité du club"
        subtitle="Logo, mentions légales, contact"
        showBack
        compact
      />
      <View style={styles.body}>
        <Card title="Présentation">
          <View style={styles.fields}>
            <TextField
              label="Nom du club *"
              value={name}
              onChangeText={setName}
              placeholder="Mon club"
              autoCapitalize="words"
            />
            <TextField
              label="URL du logo"
              value={logoUrl}
              onChangeText={setLogoUrl}
              placeholder="URL du logo, à uploader plus tard"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        </Card>

        <Card title="Informations légales">
          <View style={styles.fields}>
            <TextField
              label="SIRET"
              value={siret}
              onChangeText={setSiret}
              placeholder="123 456 789 00012"
              keyboardType="numbers-and-punctuation"
            />
            <TextField
              label="Adresse"
              value={address}
              onChangeText={setAddress}
              placeholder="Adresse postale du siège"
              multiline
              numberOfLines={2}
            />
            <TextField
              label="Mentions légales"
              value={legalMentions}
              onChangeText={setLegalMentions}
              placeholder="Mentions imprimées en pied de facture"
              multiline
              numberOfLines={4}
            />
          </View>
        </Card>

        <Card title="Contact">
          <View style={styles.fields}>
            <TextField
              label="Téléphone"
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="+33 1 23 45 67 89"
              keyboardType="phone-pad"
            />
            <TextField
              label="E-mail"
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="contact@club.fr"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
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
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
  },
});
