import { useMutation } from '@apollo/client/react';
import {
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  spacing,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { CREATE_CLUB_BLOG_POST } from '../../lib/documents/blog';
import type { BlogStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<BlogStackParamList, 'NewBlogPost'>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function NewBlogPostScreen() {
  const navigation = useNavigation<Nav>();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [publishNow, setPublishNow] = useState(false);

  const [createPost, { loading: submitting }] = useMutation(
    CREATE_CLUB_BLOG_POST,
  );

  const onTitleBlur = () => {
    if (!slug.trim() && title.trim()) {
      setSlug(slugify(title));
    }
  };

  const onSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Champ requis', 'Le titre est obligatoire.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Champ requis', 'Le contenu de l\'article est obligatoire.');
      return;
    }
    const finalSlug = slug.trim() || slugify(title);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(finalSlug)) {
      Alert.alert(
        'Slug invalide',
        'Format attendu : kebab-case (ex: mon-article).',
      );
      return;
    }

    try {
      await createPost({
        variables: {
          input: {
            title: title.trim(),
            slug: finalSlug,
            excerpt: excerpt.trim() ? excerpt.trim() : undefined,
            body: body.trim(),
            coverImageUrl: coverImageUrl.trim()
              ? coverImageUrl.trim()
              : undefined,
            publishNow,
          },
        },
      });
      Alert.alert(
        'Article créé',
        publishNow ? 'L\'article a été publié.' : 'L\'article est en brouillon.',
      );
      navigation.goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Création impossible.';
      Alert.alert('Erreur', msg);
    }
  };

  return (
    <ScreenContainer keyboardAvoiding padding={0}>
      <ScreenHero
        eyebrow="NOUVEL ARTICLE"
        title="Rédaction"
        compact
        showBack
      />

      <View style={styles.body}>
        <Card title="Identité">
          <View style={styles.fields}>
            <TextField
              label="Titre"
              value={title}
              onChangeText={setTitle}
              onBlur={onTitleBlur}
              placeholder="Ex : Reprise des cours en septembre"
            />
            <TextField
              label="Slug (auto)"
              value={slug}
              onChangeText={setSlug}
              placeholder="reprise-des-cours-en-septembre"
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
              placeholder="Phrase d'accroche affichée dans la liste"
              multiline
              numberOfLines={3}
            />
            <TextField
              label="Corps de l'article (markdown)"
              value={body}
              onChangeText={setBody}
              placeholder="# Titre\n\nVotre contenu ici…"
              multiline
              numberOfLines={8}
            />
          </View>
        </Card>

        <Card title="Publication">
          <View style={styles.pillRow}>
            <Pill
              label="Brouillon"
              tone={!publishNow ? 'primary' : 'neutral'}
              onPress={() => setPublishNow(false)}
            />
            <Pill
              label="Publier maintenant"
              tone={publishNow ? 'primary' : 'neutral'}
              onPress={() => setPublishNow(true)}
            />
          </View>
        </Card>

        <Button
          label="Créer"
          variant="primary"
          icon="checkmark-circle-outline"
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
