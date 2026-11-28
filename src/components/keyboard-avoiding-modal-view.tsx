import { type ReactNode, useEffect, useState } from 'react';
import { Keyboard, Platform, type StyleProp, View, type ViewStyle } from 'react-native';

/**
 * Tracks the on-screen keyboard height across iOS, Android (including inside
 * transparent Modals), and Mobile Web (via `window.visualViewport`).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.visualViewport) {
        return;
      }
      const vv = window.visualViewport;
      const update = () => {
        const raw = window.innerHeight - vv.height - vv.offsetTop;
        // Ignore tiny browser toolbar fluctuations (< 80px)
        setInset(raw > 80 ? Math.round(raw) : 0);
      };
      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const height = event.endCoordinates?.height ?? 0;
      setInset(height > 0 ? Math.round(height) : 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return inset;
}

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function KeyboardAvoidingModalView({ children, style }: Props) {
  const keyboardInset = useKeyboardInset();

  return (
    <View
      style={[
        style,
        keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
      ]}>
      {children}
    </View>
  );
}
