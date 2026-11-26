import { type ColorSchemeName, useColorScheme } from 'react-native';

import { useIsClient } from '@/hooks/use-is-client';

// Server and the first client render match; the system scheme applies on the client.
export function useResolvedColorScheme(): NonNullable<ColorSchemeName> {
  const isClient = useIsClient();
  const systemScheme = useColorScheme();
  return isClient && systemScheme === 'dark' ? 'dark' : 'light';
}
