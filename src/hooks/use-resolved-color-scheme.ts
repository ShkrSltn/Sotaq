import { useEffect, useState } from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';

// Server and the first client render must match. The system scheme is applied after mount.
export function useResolvedColorScheme(): NonNullable<ColorSchemeName> {
  const systemScheme = useColorScheme();
  const [scheme, setScheme] = useState<NonNullable<ColorSchemeName>>('light');

  useEffect(() => {
    setScheme(systemScheme === 'dark' ? 'dark' : 'light');
  }, [systemScheme]);

  return scheme;
}
