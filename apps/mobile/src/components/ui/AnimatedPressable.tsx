import { type ReactNode, useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Échelle au tap (1 = pas d'effet, 0.96 par défaut). */
  scale?: number;
  /** Vibration légère au press (false par défaut). */
  haptic?: boolean;
};

/**
 * Pressable avec animation d'échelle premium au tap (style Linear/Stripe).
 * Les composants UI (Button, Card cliquable) doivent utiliser ça plutôt
 * qu'un Pressable nu pour le ressenti tactile.
 */
export function AnimatedPressable({
  children,
  style,
  scale = 0.96,
  haptic = false,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const animatedScale = useRef(new Animated.Value(1)).current;

  const handlePressIn: PressableProps['onPressIn'] = (e) => {
    Animated.spring(animatedScale, {
      toValue: scale,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
    if (haptic) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPressIn?.(e);
  };
  const handlePressOut: PressableProps['onPressOut'] = (e) => {
    Animated.spring(animatedScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
    onPressOut?.(e);
  };

  return (
    <Animated.View style={[{ transform: [{ scale: animatedScale }] }, style]}>
      <Pressable {...rest} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
