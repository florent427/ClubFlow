import { useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  EmptyState,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CLUB_VITRINE_PAGE } from '../../lib/documents/vitrine';
import type { VitrineStackParamList } from '../../navigation/types';

type Section = {
  id?: string;
  sectionType?: string;
  type?: string;
  dataJson?: unknown;
  data?: unknown;
};

type PageData = {
  clubVitrinePage: {
    id: string;
    slug: string;
    templateKey: string;
    status: string;
    seoTitle: string | null;
    seoDescription: string | null;
    sectionsJson: string;
    updatedAt: string;
  } | null;
};

type Rt = RouteProp<VitrineStackParamList, 'PageEditor'>;

const ADMIN_WEB_URL =
  process.env.EXPO_PUBLIC_ADMIN_APP_URL ?? 'https://clubflow.local';

/**
 * Tronque un JSON sérialisé pour preview.
 */
function summarizeData(value: unknown): string {
  try {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    if (!json) return '{}';
    return json.length > 140 ? `${json.slice(0, 140)}…` : json;
  } catch {
    return '—';
  }
}

export function VitrinePageEditorScreen() {
  const route = useRoute<Rt>();
  const slug = route.params?.slug ?? '';

  const { data, loading } = useQuery<PageData>(CLUB_VITRINE_PAGE, {
    variables: { slug },
    errorPolicy: 'all',
    skip: !slug,
  });

  const sections = useMemo<Section[]>(() => {
    const raw = data?.clubVitrinePage?.sectionsJson;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Section[];
      return [];
    } catch {
      return [];
    }
  }, [data]);

  const page = data?.clubVitrinePage;

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="ÉDITEUR"
        title={page?.seoTitle ?? slug}
        subtitle={page ? `Template ${page.templateKey} · ${page.status}` : 'Page vitrine'}
        showBack
        compact
      />

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {loading && !page ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : !page ? (
          <Card>
            <EmptyState
              icon="alert-circle-outline"
              title="Page introuvable"
              description={`Aucune page n'existe avec le slug « ${slug} ».`}
            />
          </Card>
        ) : (
          <>
            <Card title="Aperçu de la page" subtitle="Lecture seule sur mobile">
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Slug</Text>
                <Text style={styles.kvValue}>{page.slug}</Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Template</Text>
                <Text style={styles.kvValue}>{page.templateKey}</Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Statut</Text>
                <Text style={styles.kvValue}>{page.status}</Text>
              </View>
              {page.seoDescription ? (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>SEO description</Text>
                  <Text style={styles.kvValue}>{page.seoDescription}</Text>
                </View>
              ) : null}
            </Card>

            <Card title="Sections" subtitle={`${sections.length} bloc${sections.length > 1 ? 's' : ''}`}>
              {sections.length === 0 ? (
                <EmptyState
                  icon="layers-outline"
                  title="Aucune section"
                  description="Cette page n'a pas encore de blocs configurés."
                />
              ) : (
                <View style={styles.sectionsList}>
                  {sections.map((section, idx) => {
                    const sectionType =
                      section.sectionType ?? section.type ?? 'inconnu';
                    const data = section.dataJson ?? section.data ?? null;
                    return (
                      <View key={section.id ?? `${sectionType}-${idx}`} style={styles.sectionRow}>
                        <Text style={styles.sectionType}>{sectionType}</Text>
                        <Text style={styles.sectionPreview} numberOfLines={3}>
                          {summarizeData(data)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>

            <Card>
              <EmptyState
                icon="laptop-outline"
                title="Édition complète sur le web"
                description="L'édition fine du JSON des sections n'est pas disponible sur mobile. Ouvrez l'admin web pour modifier la page."
                action={
                  <Button
                    label="Ouvrir l'admin web"
                    icon="open-outline"
                    onPress={() => {
                      void Linking.openURL(`${ADMIN_WEB_URL}/vitrine`);
                    }}
                  />
                }
              />
            </Card>
          </>
        )}
      </ScrollView>
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
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
  },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  kvLabel: { ...typography.smallStrong, color: palette.muted },
  kvValue: {
    ...typography.body,
    color: palette.ink,
    flex: 1,
    textAlign: 'right',
  },
  sectionsList: { gap: spacing.sm },
  sectionRow: {
    backgroundColor: palette.bgAlt,
    borderRadius: 12,
    padding: spacing.md,
    gap: 4,
  },
  sectionType: { ...typography.smallStrong, color: palette.primary },
  sectionPreview: {
    ...typography.small,
    color: palette.body,
    fontFamily: 'monospace',
  },
});
