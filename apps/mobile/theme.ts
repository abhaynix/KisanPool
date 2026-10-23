/**
 * Shared ChaiUI tokens for the native app. Dark is the default. The app follows
 * the device appearance so the same screens remain readable in light mode.
 */
import { Appearance, type TextStyle, type ViewStyle } from 'react-native';

const darkColors = {
  primary: '#f5f5f5',
  onPrimary: '#f5f5f5',
  primaryContainer: '#181818',
  onPrimaryContainer: '#f5f5f5',

  secondary: '#e5e5e5',
  onSecondary: '#0a0a0a',
  secondaryContainer: '#202020',
  onSecondaryContainer: '#e5e5e5',

  tertiary: '#ffedd5',
  onTertiary: '#171717',
  tertiaryContainer: '#252018',
  onTertiaryContainer: '#ffedd5',

  error: '#fca5a5',
  onError: '#171717',
  errorContainer: '#2a1717',
  onErrorContainer: '#fca5a5',

  surface: '#0a0a0a',
  background: '#0a0a0a',
  surfaceContainerLowest: '#101010',
  surfaceContainerLow: '#121212',
  surfaceContainer: '#171717',
  surfaceContainerHigh: '#1d1d1d',
  surfaceContainerHighest: '#242424',
  surfaceVariant: '#242424',

  onSurface: '#f5f5f5',
  onSurfaceVariant: '#b3b3b3',
  outline: '#85817b',
  outlineVariant: '#393631',

  inverseSurface: '#f5f5f5',
  inverseOnSurface: '#171717',
  surfaceTint: '#f5f5f5',

  infoContainer: '#17191c',
  onInfoContainer: '#bfdbfe',
  warningContainer: '#1d1a15',
  onWarningContainer: '#fcd34d',
  statusSuccess: '#86efac',
  statusWarning: '#fcd34d',
  statusDanger: '#fca5a5',
  statusInfo: '#bfdbfe',
} as const;

const lightColors = {
  primary: '#171717',
  onPrimary: '#171717',
  primaryContainer: '#f1f0ed',
  onPrimaryContainer: '#171717',

  secondary: '#404040',
  onSecondary: '#ffffff',
  secondaryContainer: '#efeeeb',
  onSecondaryContainer: '#262626',

  tertiary: '#854d0e',
  onTertiary: '#ffffff',
  tertiaryContainer: '#f5eee3',
  onTertiaryContainer: '#854d0e',

  error: '#b91c1c',
  onError: '#ffffff',
  errorContainer: '#fef2f2',
  onErrorContainer: '#991b1b',

  surface: '#faf9f6',
  background: '#faf9f6',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f7f6f3',
  surfaceContainer: '#f2f1ee',
  surfaceContainerHigh: '#ebe9e5',
  surfaceContainerHighest: '#e5e2dd',
  surfaceVariant: '#e5e2dd',

  onSurface: '#171717',
  onSurfaceVariant: '#5b5a57',
  outline: '#77736d',
  outlineVariant: '#ded9d0',

  inverseSurface: '#262626',
  inverseOnSurface: '#f5f5f5',
  surfaceTint: '#171717',

  infoContainer: '#f1f3f5',
  onInfoContainer: '#1d4ed8',
  warningContainer: '#f7f3ea',
  onWarningContainer: '#854d0e',
  statusSuccess: '#15803d',
  statusWarning: '#854d0e',
  statusDanger: '#b91c1c',
  statusInfo: '#1d4ed8',
} as const;

const initialColorScheme = Appearance.getColorScheme() ?? 'dark';
export const colors = initialColorScheme === 'light' ? lightColors : darkColors;
export const isDarkMode = initialColorScheme !== 'light';

export const fontFamily = 'Manrope_400Regular';
export const cardTitleFamily = 'Montserrat_600SemiBold';
export const highlightFamily = 'Montserrat_500Medium';
export const wordmarkFamily = 'Onest_500Medium';

export const type = {
  displayLg: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.64,
  },
  headlineLg: { fontFamily: 'Manrope_600SemiBold', fontSize: 24, fontWeight: '600', lineHeight: 32 },
  headlineMd: { fontFamily: 'Manrope_600SemiBold', fontSize: 20, fontWeight: '600', lineHeight: 28 },
  bodyLg: { fontFamily: 'Manrope_400Regular', fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodyMd: { fontFamily: 'Manrope_400Regular', fontSize: 14, fontWeight: '400', lineHeight: 20 },
  labelLg: {
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: 0.14,
  },
  labelSm: { fontFamily: 'Manrope_500Medium', fontSize: 12, fontWeight: '500', lineHeight: 16 },
  bilingualSubtext: { fontFamily: 'Manrope_400Regular', fontSize: 13, fontWeight: '400', lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export const space = {
  xs: 4,
  sm: 8,
  gutter: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/** Depth comes from the surface fill and its warm hairline, with no shadows. */
export const elevation = {
  level0: {} as ViewStyle,
  level1: {} as ViewStyle,
  level2: {} as ViewStyle,
} as const;

export const layout = {
  edgeMargin: space.md,
  minTouchTarget: 48,
  navHeight: 72,
  fabOffset: 88,
} as const;

export const theme = {
  colors,
  fontFamily,
  cardTitleFamily,
  highlightFamily,
  wordmarkFamily,
  type,
  space,
  radius,
  elevation,
  layout,
} as const;
export default theme;
