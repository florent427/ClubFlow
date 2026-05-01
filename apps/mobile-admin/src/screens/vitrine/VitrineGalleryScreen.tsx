import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ConfirmSheet,
  EmptyState,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ADD_VITRINE_GALLERY_PHOTO,
  CLUB_VITRINE_GALLERY_PHOTOS,
  DELETE_VITRINE_GALLERY_PHOTO,
} from '../../lib/documents/vitrine';
import { storage } from '../../lib/storage';

type Photo = {
  id: string;
  caption: string | null;
  category: string | null;
  imageUrl: string;
  sortOrder: number;
};

type Data = { clubVitrineGalleryPhotos: Photo[] };

function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE;
  if (explicit) return explicit.replace(/\/$/, '');
  const graphql =
    process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
  return graphql.replace(/\/graphql\/?$/, '') || 'http://localhost:3000';
}

export function VitrineGalleryScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_VITRINE_GALLERY_PHOTOS, {
    errorPolicy: 'all',
  });

  const [addPhoto, addState] = useMutation(ADD_VITRINE_GALLERY_PHOTO, {
    refetchQueries: [{ query: CLUB_VITRINE_GALLERY_PHOTOS }],
  });
  const [deletePhoto, deleteState] = useMutation(DELETE_VITRINE_GALLERY_PHOTO, {
    refetchQueries: [{ query: CLUB_VITRINE_GALLERY_PHOTOS }],
  });

  const [confirmDelete, setConfirmDelete] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);

  const photos = data?.clubVitrineGalleryPhotos ?? [];

  const handleAddPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à la galerie dans les réglages.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      // expo-image-picker v17+ : `MediaTypeOptions` est déprécié — on
      // passe un tableau de `MediaType` ('images' / 'videos' / 'livePhotos').
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];

    const token = await storage.getToken();
    const clubId = await storage.getClubId();
    if (!token || !clubId) {
      Alert.alert('Session expirée', 'Veuillez vous reconnecter.');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      const fileName = asset.fileName ?? `gallery-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      form.append('file', {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
      form.append('kind', 'IMAGE');
      const res = await fetch(`${getApiBaseUrl()}/media/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `Upload échoué (HTTP ${res.status}). ${text.slice(0, 200)}`,
        );
      }
      const uploaded = (await res.json()) as { id: string };
      await addPhoto({
        variables: {
          input: { mediaAssetId: uploaded.id, caption: '' },
        },
      });
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Impossible d'ajouter la photo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="GALERIE"
        title="Galerie photos"
        subtitle={`${photos.length} photo${photos.length > 1 ? 's' : ''}`}
        showBack
        compact
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refetch()}
            tintColor={palette.primary}
          />
        }
      >
        {loading && photos.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : photos.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="images-outline"
              title="Galerie vide"
              description="Ajoutez votre première photo via le bouton +"
            />
          </View>
        ) : (
          <View style={styles.grid}>
            {photos.map((photo) => (
              <Pressable
                key={photo.id}
                onLongPress={() => setConfirmDelete(photo)}
                accessibilityRole="imagebutton"
                accessibilityLabel={photo.caption ?? 'Photo de galerie'}
                style={({ pressed }) => [
                  styles.tile,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Image
                  source={{ uri: photo.imageUrl }}
                  style={styles.tileImage}
                  resizeMode="cover"
                />
                {photo.caption ? (
                  <View style={styles.captionOverlay}>
                    <Text style={styles.captionText} numberOfLines={2}>
                      {photo.caption}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => void handleAddPhoto()}
        disabled={uploading || addState.loading}
        style={({ pressed }) => [
          styles.fab,
          pressed && { opacity: 0.85 },
          (uploading || addState.loading) && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Ajouter une photo"
      >
        {uploading || addState.loading ? (
          <ActivityIndicator color={palette.surface} />
        ) : (
          <Ionicons name="add" size={28} color={palette.surface} />
        )}
      </Pressable>

      <ConfirmSheet
        visible={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          void deletePhoto({ variables: { id: confirmDelete.id } }).finally(
            () => setConfirmDelete(null),
          );
        }}
        title="Supprimer cette photo ?"
        message="La photo sera retirée de la galerie publique."
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading}
      />
    </ScreenContainer>
  );
}

const TILE_GAP = spacing.xs;

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
  },
  emptyWrap: {
    paddingTop: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    width: '32%',
    aspectRatio: 1,
    backgroundColor: palette.bgAlt,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tileImage: { width: '100%', height: '100%' },
  captionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  captionText: {
    ...typography.caption,
    color: '#ffffff',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
