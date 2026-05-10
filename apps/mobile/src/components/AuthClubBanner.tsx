import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as storage from '../lib/storage';
import { palette, radius, spacing, typography } from '../lib/theme';

interface Props {
  /** Action quand le user veut changer de club (reset selectedClub +
   *  nav vers SelectClubScreen). */
  onChangeClub: () => void;
}

/**
 * Banner club affiché en haut des écrans Login / Register / Forgot.
 * Parité avec le web : "Vous rejoignez X" (logo + nom) + bouton
 * "Changer". Évite les inscriptions accidentelles sur le mauvais
 * tenant et clarifie le contexte tenant à chaque étape auth.
 *
 * Si aucun club sélectionné (cas dégradé — ne devrait pas arriver
 * puisque SelectClubScreen est forcé au 1er lancement), on affiche
 * un placeholder "ClubFlow" générique.
 */
export function AuthClubBanner({ onChangeClub }: Props) {
  const [club, setClub] = useState<storage.SelectedClub | null>(null);

  useEffect(() => {
    void (async () => {
      setClub(await storage.getSelectedClub());
    })();
  }, []);

  if (!club) return null;

  const initials = club.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.banner}>
      {club.logoUrl ? (
        <Image source={{ uri: club.logoUrl }} style={styles.logo} />
      ) : (
        <View style={[styles.logo, styles.logoFallback]}>
          <Text style={styles.logoInitials}>{initials}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.eyebrow}>VOUS REJOIGNEZ</Text>
        <Text style={styles.name} numberOfLines={1}>
          {club.name}
        </Text>
      </View>
      <Pressable
        onPress={onChangeClub}
        accessibilityRole="button"
        accessibilityLabel="Changer de club"
        style={({ pressed }) => [
          styles.changeBtn,
          pressed && { opacity: 0.7 },
        ]}
        hitSlop={4}
      >
        <Text style={styles.changeBtnText}>Changer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: '#eff6ff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(21, 101, 192, 0.2)',
    marginBottom: spacing.md,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: '#ffffff',
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(21, 101, 192, 0.25)',
  },
  logoInitials: {
    ...typography.bodyStrong,
    color: '#1565c0',
    fontSize: 14,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1565c0',
    letterSpacing: 0.5,
  },
  name: {
    ...typography.bodyStrong,
    color: palette.ink,
    fontSize: 14,
  },
  changeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(21, 101, 192, 0.25)',
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1565c0',
  },
});
