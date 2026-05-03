import {
  Card,
  EmptyState,
  ScreenContainer,
  ScreenHero,
  spacing,
} from '@clubflow/mobile-shared';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof EmptyState>['icon'];

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  hint?: string;
  icon?: IconName;
};

/**
 * Écran-placeholder utilisé pour les pages dont l'implémentation
 * détaillée est en cours. Garde un style cohérent avec le reste de l'app.
 */
export function PlaceholderScreen({
  eyebrow,
  title,
  subtitle,
  hint = 'Cette section arrive très bientôt.',
  icon = 'construct-outline',
}: Props) {
  return (
    <ScreenContainer scroll padding={0}>
      <ScreenHero
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        compact
      />
      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <EmptyState
          icon={icon}
          title="En construction"
          description={hint}
        />
      </Card>
    </ScreenContainer>
  );
}
