import { useQuery } from '@apollo/client/react';
import {
  Card,
  EmptyState,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CLUB_VITRINE_BRANDING } from '../../lib/documents/vitrine';

type Branding = {
  clubName: string;
  logoUrl: string | null;
  kanjiTagline: string | null;
  paletteJson: string | null;
  fontsJson: string | null;
};

type Data = { clubVitrineBranding: Branding | null };

function safeParse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

type PaletteShape = Record<string, string | null | undefined>;
type FontsShape = Record<string, string | null | undefined>;

export function VitrineBrandingScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_VITRINE_BRANDING, {
    errorPolicy: 'all',
  });

  const branding = data?.clubVitrineBranding ?? null;
  const paletteObj = safeParse<PaletteShape>(branding?.paletteJson ?? null);
  const fontsObj = safeParse<FontsShape>(branding?.fontsJson ?? null);

  const colorEntries: Array<[string, string]> = paletteObj
    ? Object.entries(paletteObj).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[1].length > 0,
      )
    : [];

  const fontEntries: Array<[string, string]> = fontsObj
    ? Object.entries(fontsObj).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[1].length > 0,
      )
    : [];

  if (loading && !branding) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="VITRINE"
          title="Identité visuelle"
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
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="VITRINE"
        title="Identité visuelle"
        subtitle={branding?.clubName}
        showBack
        compact
      />

      <View style={styles.body}>
        {colorEntries.length > 0 ? (
          <Card title="Palette de couleurs">
            <View style={styles.colorsGrid}>
              {colorEntries.map(([name, color]) => (
                <View key={name} style={styles.colorTile}>
                  <View
                    style={[styles.colorSwatch, { backgroundColor: color }]}
                  />
                  <Text style={styles.colorName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.colorHex}>{color}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {fontEntries.length > 0 ? (
          <Card title="Typographies">
            <View style={styles.fontsList}>
              {fontEntries.map(([key, value]) => (
                <View key={key} style={styles.fontRow}>
                  <Text style={styles.fontKey}>{key}</Text>
                  <Text style={styles.fontValue} numberOfLines={1}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {branding?.kanjiTagline ? (
          <Card title="Tagline">
            <Text style={styles.tagline}>{branding.kanjiTagline}</Text>
          </Card>
        ) : null}

        {colorEntries.length === 0 && fontEntries.length === 0 ? (
          <Card>
            <EmptyState
              icon="color-palette-outline"
              title="Identité non personnalisée"
              description="Ajoutez votre palette et vos typographies pour personnaliser votre vitrine."
            />
          </Card>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  loaderWrap: { padding: spacing.xxl, alignItems: 'center' },
  colorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  colorTile: {
    width: '30%',
    alignItems: 'center',
    gap: 4,
  },
  colorSwatch: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    marginBottom: 4,
  },
  colorName: {
    ...typography.smallStrong,
    color: palette.ink,
    textAlign: 'center',
  },
  colorHex: {
    ...typography.caption,
    color: palette.muted,
  },
  fontsList: { gap: spacing.sm },
  fontRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  fontKey: {
    ...typography.smallStrong,
    color: palette.ink,
  },
  fontValue: {
    ...typography.small,
    color: palette.muted,
    flexShrink: 1,
    textAlign: 'right',
  },
  tagline: {
    ...typography.h3,
    color: palette.ink,
    textAlign: 'center',
  },
});
