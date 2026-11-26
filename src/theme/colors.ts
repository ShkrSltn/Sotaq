import { useWindowDimensions } from 'react-native';

import { useIsClient } from '@/hooks/use-is-client';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

export const DESKTOP_BREAKPOINT = 900;

export const themePalette = {
  light: {
    background: '#F3F4F6',
    surface: '#FFFFFF',
    surfaceSubtle: '#F6F7F8',
    surfaceActive: '#E7E8EC',
    text: '#16181D',
    muted: '#7B818C',
    line: '#E4E7EC',
    accent: '#16181D',
    accentText: '#F8F9FA',
    success: '#1E8E5A',
    successBg: '#E8F6EE',
    warning: '#B4690E',
    warningBg: '#FDF3E3',
    danger: '#C9372C',
    dangerBg: '#FCEBE9',
  },
  dark: {
    background: '#111214',
    surface: '#1C1D21',
    surfaceSubtle: '#25262B',
    surfaceActive: '#2E3036',
    text: '#F3F4F6',
    muted: '#9AA0A8',
    line: '#2C2E33',
    accent: '#F3F4F6',
    accentText: '#16181D',
    success: '#4CC38A',
    successBg: '#163024',
    warning: '#E6A23C',
    warningBg: '#322614',
    danger: '#F06A60',
    dangerBg: '#351B19',
  },
} as const;

export type ThemeColors = (typeof themePalette)['light'] | (typeof themePalette)['dark'];

export function useThemeColors(): ThemeColors {
  return themePalette[useResolvedColorScheme()];
}

export function useViewport() {
  const isClient = useIsClient();
  const { width, height } = useWindowDimensions();

  return {
    width,
    height,
    isMounted: isClient,
    isDesktop: isClient && width >= DESKTOP_BREAKPOINT,
  };
}
