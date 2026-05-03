import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  spacing,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  CLUB_BLOG_POSTS,
  UPDATE_CLUB_BLOG_POST,
} from '../../lib/documents/blog';
import type { BlogStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<BlogStackParamList, 'BlogPostEditor'>;
type Route = RouteProp<BlogStackParamList, 'BlogPostEditor'>;

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  coverImageUrl: string | null;
  status: string;
  publishedAt: string | null;
};

type Data = { clubBlogPosts: BlogPost[] };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  ARCHIVED: 'Archivé',
};

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  ARCHIVED: 'warning',
};

export function BlogPostEditorScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { postId } = route.params;

  const { data, loading } = useQuery<Data>(CLUB_BLOG_POSTS, {
    errorPolicy: 'all',
  });

  const post = useMemo(
    () => data?.clubBlogPosts.find((p) => p.id === postId) ?? null,
    [data, postId],
  );

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && post) {
      setTitle(post.title);
      setSlug(post.slug);
      setExcerpt(post.excerpt ?? '');
      setBody(post.body ?? '');
      setCoverImageUrl(post.coverImageUrl ?? '');
      setHydrated(true);
    }
  }, [hydrated, post]);

  const [updatePost, { loading: submitting }] = useMutation(
    UPDATE_CLUB_BLOG_POST,
  );

  const onSubmit = async () => {
    if (!post) return;
    if (!title.trim()) {
      Alert.alert('Champ requis', 'Le titre est obligatoire.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Champ requis', 'Le contenu de l\'article est obligatoire.');
      return;
    }
    const finalSlug = slug.trim();
    if (finalSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(finalSlug)) {
      Alert.alert(
        'Slug invalide',
        'Format attendu : kebab-case (ex: mon-article).',
      );
      return;
    }

    try {
      await updatePost({
        variables: {
          input: {
            id: post.id,
            title: title.trim(),
            slug: finalSlug || undefined,
            excerpt: excerpt.trim() ? excerpt.trim() : undefined,
            body: body.trim(),
            coverImageUrl: coverImageUrl.trim()
              ? coverImageUrl.trim()
              : undefined,
          },
        },
      });
      Alert.alert('Article mis à jour', 'Les modifications sont enregistrées.');
      navigation.goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sauvegarde impossible.';
      Alert.alert('Erreur', msg);
    }
  };

  if (loading && !post) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ARTICLE"
          title="Chargement…"
          compact
          showBack
        />
      </ScreenContainer>
    );
  }

  if (!post) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ARTICLE"
          title="Introuvable"
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Article introuvable"
            description="L'article n'existe plus ou n'est pas accessible."
          />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding padding={0}>
      <ScreenHero
        eyebrow="ÉDITER"
        title={post.title}
        subtitle={STATUS_LABEL[post.status] ?? post.status}
        compact
        showBack
      />

      <View style={styles.body}>
        <Card title="Statut">
          <View style={styles.pillRow}>
            <Pill
              label={STATUS_LABEL[post.status] ?? post.status}
              tone={STATUS_TONE[post.status] ?? 'neutral'}
            />
          </View>
        </Card>

        <Card title="Identité">
          <View style={styles.fields}>
            <TextField
              label="Titre"
              value={title}
              onChangeText={setTitle}
              placeholder="Titre de l'article"
            />
            <TextField
              label="Slug"
              value={slug}
              onChangeText={setSlug}
              placeholder="mon-article"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label="Image de couverture (URL)"
              value={coverImageUrl}
              onChangeText={setCoverImageUrl}
              placeholder="https://…"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        </Card>

        <Card title="Contenu">
          <View style={styles.fields}>
            <TextField
              label="Chapô"
              value={excerpt}
              onChangeText={setExcerpt}
              placeholder="Phrase d'accroche"
              multiline
              numberOfLines={3}
            />
            <TextField
              label="Corps de l'article (markdown)"
              value={body}
              onChangeText={setBody}
              placeholder="Votre contenu…"
              multiline
              numberOfLines={8}
            />
          </View>
        </Card>

        <Button
          label="Sauvegarder"
          variant="primary"
          icon="save-outline"
          onPress={() => void onSubmit()}
          loading={submitting}
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
    gap: spacing.lg,
  },
  fields: {
    gap: spacing.md,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
