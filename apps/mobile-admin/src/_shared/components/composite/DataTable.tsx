import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactElement, type ReactNode } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { palette, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

export type DataTableRow = {
  key: string;
  /** Avatar / icône optionnelle (40px). */
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  /** Pill statut (badge coloré) optionnel. */
  badge?: { label: string; color: string; bg: string } | null;
  trailing?: ReactNode;
};

type Props = {
  data: DataTableRow[];
  onPressRow?: (key: string) => void;
  onLongPressRow?: (key: string) => void;
  /** Skeleton si en cours de chargement. */
  loading?: boolean;
  /** Pull-to-refresh handler. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Empty state si data vide. */
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  /** Chargement de plus d'items au bas. */
  onEndReached?: () => void;
  ListHeaderComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
};

/**
 * Liste virtualizée standardisée avec skeleton, pull-to-refresh et
 * cellules normalisées (leading + title/subtitle + badge + chevron).
 */
export function DataTable({
  data,
  onPressRow,
  onLongPressRow,
  loading,
  onRefresh,
  refreshing,
  emptyTitle = 'Rien à afficher',
  emptySubtitle,
  emptyIcon = 'documents-outline',
  onEndReached,
  ListHeaderComponent,
  ListFooterComponent,
}: Props) {
  const renderItem: ListRenderItem<DataTableRow> = ({ item }: { item: DataTableRow }) => (
    <AnimatedPressable
      onPress={() => onPressRow?.(item.key)}
      onLongPress={() => onLongPressRow?.(item.key)}
      haptic
    >
      <View style={styles.row}>
        {item.leading ? (
          <View style={styles.leading}>{item.leading}</View>
        ) : null}
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>
        {item.badge ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: item.badge.bg },
            ]}
          >
            <Text
              style={[styles.badgeText, { color: item.badge.color }]}
              numberOfLines={1}
            >
              {item.badge.label}
            </Text>
          </View>
        ) : null}
        {item.trailing ?? (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={palette.mutedSoft}
          />
        )}
      </View>
    </AnimatedPressable>
  );

  if (loading && data.length === 0) {
    return (
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.row, { borderBottomWidth: 0 }]}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={[styles.body, { gap: 6 }]}>
              <Skeleton height={16} width={'65%' as `${number}%`} />
              <Skeleton height={12} width={'40%' as `${number}%`} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary}
          />
        ) : undefined
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={{ padding: spacing.huge }}>
            <EmptyState
              icon={emptyIcon}
              title={emptyTitle}
              description={emptySubtitle}
            />
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: palette.surface,
    minHeight: 64,
  },
  leading: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgAlt,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  subtitle: {
    ...typography.small,
    color: palette.muted,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...typography.caption,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginLeft: spacing.lg,
  },
});
