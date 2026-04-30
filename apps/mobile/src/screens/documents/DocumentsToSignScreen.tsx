import { useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  EmptyState,
  GradientButton,
  Pill,
  ScreenHero,
  Skeleton,
} from '../../components/ui';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  VIEWER_DOCUMENTS_TO_SIGN,
  type ClubDocumentToSign,
  type ViewerDocumentsToSignData,
} from '../../lib/documents-graphql';
import {
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../../lib/theme';
import type { DocumentsStackParamList } from '../../types/navigation';

type Nav = NativeStackNavigationProp<DocumentsStackParamList>;

function DocumentCard({
  doc,
  onSign,
}: {
  doc: ClubDocumentToSign;
  onSign: () => void;
}) {
  const icon = CATEGORY_ICON[doc.category] ?? 'document-outline';
  const catLabel = CATEGORY_LABEL[doc.category] ?? 'Document';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconBubble}>
          <Ionicons name={icon} size={24} color={palette.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {doc.name}
          </Text>
          {doc.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {doc.description}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.pillsRow}>
        <Pill icon="folder-outline" tone="neutral" label={catLabel} />
        {doc.isRequired ? (
          <Pill icon="alert-circle-outline" tone="danger" label="Obligatoire" />
        ) : null}
        {doc.minorsOnly ? (
          <Pill icon="people-outline" tone="info" label="Mineurs" />
        ) : null}
        <Pill
          icon="git-branch-outline"
          tone="neutral"
          label={`v${doc.version}`}
        />
      </View>

      <GradientButton
        label="Signer"
        onPress={onSign}
        icon="create-outline"
        gradient="primary"
        fullWidth
      />
    </View>
  );
}

export function DocumentsToSignScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refetch } = useQuery<ViewerDocumentsToSignData>(
    VIEWER_DOCUMENTS_TO_SIGN,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );
  const docs = data?.viewerDocumentsToSign ?? [];

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="ESPACE MEMBRE"
        title="Documents à signer"
        subtitle={
          docs.length > 0
            ? `${docs.length} document${docs.length > 1 ? 's' : ''} en attente`
            : 'Tous vos documents sont à jour.'
        }
        gradient="hero"
        showBack
      />
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.list}
        data={docs}
        keyExtractor={(d) => d.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refetch()}
            tintColor={palette.primary}
          />
        }
        renderItem={({ item }) => (
          <DocumentCard
            doc={item}
            onSign={() =>
              navigation.navigate('DocumentSign', { documentId: item.id })
            }
          />
        )}
        ListEmptyComponent={
          loading && docs.length === 0 ? (
            <View style={{ gap: spacing.md }}>
              <Skeleton height={180} borderRadius={radius.xl} />
              <Skeleton height={180} borderRadius={radius.xl} />
            </View>
          ) : (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Tout est à jour"
              description="Vous n'avez aucun document en attente de signature."
              variant="card"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },

  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: spacing.md,
    ...shadow.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    color: palette.ink,
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.small,
    color: palette.body,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
