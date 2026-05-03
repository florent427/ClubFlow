import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import {
  CLUB_VITRINE_ARTICLES,
  CREATE_VITRINE_ARTICLE,
  UPDATE_VITRINE_ARTICLE,
  VITRINE_ARTICLES_DETAIL,
} from '../../lib/documents/vitrine';
import type { VitrineStackParamList } from '../../navigation/types';

type Channel = 'NEWS' | 'BLOG';

type ArticleDetail = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyJson: string;
  status: string;
  channel: Channel;
  publishedAt: string | null;
  pinned: boolean;
  coverImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoH1: string | null;
};

type DetailData = { clubVitrineArticles: ArticleDetail[] };

type Nav = NativeStackNavigationProp<VitrineStackParamList, 'ArticleEditor'>;
type Rt = RouteProp<VitrineStackParamList, 'ArticleEditor'>;

/**
 * Slugify français basique : minuscules, remplace les caractères non
 * alphanumériques par des tirets, retire les accents.
 */
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

/**
 * Extrait le texte markdown stocké dans `bodyJson` (sérialisé JSON
 * `{ type: 'markdown', body: text }`). Si la structure n'est pas
 * reconnue, on renvoie une chaîne vide pour permettre une saisie neuve.
 */
function decodeBody(bodyJson: string | null | undefined): string {
  if (!bodyJson) return '';
  try {
    const parsed = JSON.parse(bodyJson) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'body' in parsed &&
      typeof (parsed as { body: unknown }).body === 'string'
    ) {
      return (parsed as { body: string }).body;
    }
    // Fallback : tenter d'afficher quelque chose d'éditable.
    return JSON.stringify(parsed, null, 2);
  } catch {
    return '';
  }
}

export function VitrineArticleEditorScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const articleId = route.params?.articleId ?? null;
  const isEdit = articleId != null;

  // Charger les détails seulement en mode édition.
  const { data, loading: loadingDetail } = useQuery<DetailData>(
    VITRINE_ARTICLES_DETAIL,
    {
      skip: !isEdit,
      errorPolicy: 'all',
    },
  );

  const existing = useMemo<ArticleDetail | null>(() => {
    if (!isEdit) return null;
    return (
      data?.clubVitrineArticles?.find((a) => a.id === articleId) ?? null
    );
  }, [data, isEdit, articleId]);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<Channel>('NEWS');
  const [publishNow, setPublishNow] = useState(false);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoH1, setSeoH1] = useState('');

  // Hydrate l'état quand les données arrivent (mode édition).
  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setSlug(existing.slug);
    setSlugTouched(true);
    setExcerpt(existing.excerpt ?? '');
    setBody(decodeBody(existing.bodyJson));
    setChannel(existing.channel);
    setPublishNow(existing.status === 'PUBLISHED');
    setSeoTitle(existing.seoTitle ?? '');
    setSeoDescription(existing.seoDescription ?? '');
    setSeoH1(existing.seoH1 ?? '');
  }, [existing]);

  // Auto-suggestion du slug tant que l'utilisateur n'y a pas touché.
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(title));
    }
  }, [title, slugTouched]);

  const [createArticle, createState] = useMutation(CREATE_VITRINE_ARTICLE, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });
  const [updateArticle, updateState] = useMutation(UPDATE_VITRINE_ARTICLE, {
    refetchQueries: [
      { query: CLUB_VITRINE_ARTICLES },
      { query: VITRINE_ARTICLES_DETAIL },
    ],
  });

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (trimmedTitle.length < 1) {
      Alert.alert('Champs manquants', 'Le titre est obligatoire.');
      return;
    }
    if (trimmedBody.length < 1) {
      Alert.alert('Champs manquants', 'Le contenu de l\'article est obligatoire.');
      return;
    }
    const bodyJson = JSON.stringify({ type: 'markdown', body: trimmedBody });
    const seoTitleVal = seoTitle.trim();
    const seoDescriptionVal = seoDescription.trim();
    const seoH1Val = seoH1.trim();
    const slugVal = (slugTouched ? slug.trim() : slugify(trimmedTitle));

    try {
      if (isEdit && articleId) {
        await updateArticle({
          variables: {
            input: {
              id: articleId,
              title: trimmedTitle,
              slug: slugVal.length > 0 ? slugVal : undefined,
              excerpt: excerpt.trim().length > 0 ? excerpt.trim() : null,
              bodyJson,
              seoTitle: seoTitleVal.length > 0 ? seoTitleVal : null,
              seoDescription:
                seoDescriptionVal.length > 0 ? seoDescriptionVal : null,
              seoH1: seoH1Val.length > 0 ? seoH1Val : null,
            },
          },
        });
        Alert.alert('Article mis à jour', 'Vos modifications sont enregistrées.');
      } else {
        await createArticle({
          variables: {
            input: {
              title: trimmedTitle,
              slug: slugVal.length > 0 ? slugVal : undefined,
              excerpt: excerpt.trim().length > 0 ? excerpt.trim() : undefined,
              bodyJson,
              channel,
              publishNow,
              seoTitle: seoTitleVal.length > 0 ? seoTitleVal : undefined,
              seoDescription:
                seoDescriptionVal.length > 0 ? seoDescriptionVal : undefined,
              seoH1: seoH1Val.length > 0 ? seoH1Val : undefined,
            },
          },
        });
        Alert.alert('Article créé', 'L\'article a bien été enregistré.');
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible d\'enregistrer.');
    }
  };

  if (isEdit && loadingDetail && !existing) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ÉDITEUR"
          title="Édition d'article"
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
        eyebrow={isEdit ? 'ÉDITEUR' : 'NOUVEAU'}
        title={isEdit ? 'Édition d\'article' : 'Nouvel article'}
        subtitle={isEdit ? existing?.title ?? undefined : 'Actualité ou article de blog'}
        showBack
        compact
      />
      <View style={styles.body}>
        <Card title="Contenu">
          <View style={styles.fields}>
            <TextField
              label="Titre *"
              value={title}
              onChangeText={setTitle}
              placeholder="Le titre de votre article"
              autoCapitalize="sentences"
            />
            <TextField
              label="Slug"
              value={slug}
              onChangeText={(v) => {
                setSlug(v);
                setSlugTouched(true);
              }}
              placeholder="auto-suggéré depuis le titre"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label="Extrait"
              value={excerpt}
              onChangeText={setExcerpt}
              placeholder="Résumé court (affiché dans la liste)"
              multiline
              numberOfLines={2}
            />
            <TextField
              label="Contenu *"
              value={body}
              onChangeText={setBody}
              placeholder="Markdown ou texte brut…"
              multiline
              numberOfLines={10}
              hint="Le contenu sera enregistré au format Markdown."
            />
            {!isEdit ? (
              <View style={styles.pillsRow}>
                <Pill
                  label="Actualités"
                  tone={channel === 'NEWS' ? 'primary' : 'neutral'}
                  icon={channel === 'NEWS' ? 'megaphone' : 'megaphone-outline'}
                  onPress={() => setChannel('NEWS')}
                />
                <Pill
                  label="Blog"
                  tone={channel === 'BLOG' ? 'primary' : 'neutral'}
                  icon={channel === 'BLOG' ? 'reader' : 'reader-outline'}
                  onPress={() => setChannel('BLOG')}
                />
                <Pill
                  label={publishNow ? 'Publié' : 'Brouillon'}
                  tone={publishNow ? 'success' : 'neutral'}
                  icon={publishNow ? 'send' : 'document-outline'}
                  onPress={() => setPublishNow((v) => !v)}
                />
              </View>
            ) : null}
          </View>
        </Card>

        <Card title="SEO" subtitle="Référencement (optionnel)">
          <View style={styles.fields}>
            <TextField
              label="Titre SEO"
              value={seoTitle}
              onChangeText={setSeoTitle}
              placeholder="Affiché dans l'onglet du navigateur"
            />
            <TextField
              label="Description SEO"
              value={seoDescription}
              onChangeText={setSeoDescription}
              placeholder="Méta description affichée sur Google"
              multiline
              numberOfLines={3}
            />
            <TextField
              label="Titre principal (H1)"
              value={seoH1}
              onChangeText={setSeoH1}
              placeholder="Titre principal sur la page de l'article"
            />
          </View>
        </Card>

        <Button
          label={isEdit ? 'Enregistrer' : 'Créer l\'article'}
          variant="primary"
          icon="checkmark-circle-outline"
          onPress={handleSubmit}
          loading={createState.loading || updateState.loading}
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
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
  },
});

