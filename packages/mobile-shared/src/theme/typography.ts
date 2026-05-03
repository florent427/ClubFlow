export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  black: 'Inter_900Black',
} as const;

export const typography = {
  displayXl: {
    fontSize: 36,
    lineHeight: 42,
    fontFamily: fontFamily.extrabold,
    letterSpacing: -1.2,
  },
  displayLg: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.8,
  },
  h1: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: fontFamily.semibold,
    letterSpacing: -0.2,
  },
  bodyLg: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fontFamily.regular,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamily.regular,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamily.semibold,
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
  },
  smallStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamily.semibold,
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.medium,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  metric: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: fontFamily.extrabold,
    letterSpacing: -0.8,
  },
  metricLg: {
    fontSize: 36,
    lineHeight: 40,
    fontFamily: fontFamily.extrabold,
    letterSpacing: -1.2,
  },
} as const;
