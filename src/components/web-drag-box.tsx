import { type ComponentRef, forwardRef, type ReactNode, useEffect, useRef } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';

export type WebDomDragEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
  clientX: number;
  clientY: number;
  currentTarget: EventTarget | null;
  dataTransfer: DataTransfer | null;
};

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  collapsable?: boolean;
  draggable?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onDragStart?: (event: WebDomDragEvent) => void;
  onDragEnd?: (event: WebDomDragEvent) => void;
  onDragOver?: (event: WebDomDragEvent) => void;
  onDragLeave?: (event: WebDomDragEvent) => void;
  onDrop?: (event: WebDomDragEvent) => void;
};

// react-native-web's <View> strips HTML5 drag props via pickProps().
// WebDragBox binds native DOM drag listeners directly to the host <div> on web,
// while remaining a zero-overhead <View> on iOS and Android.
export const WebDragBox = forwardRef<ComponentRef<typeof View>, Props>(function WebDragBox(
  {
    children,
    style,
    collapsable,
    draggable = false,
    onPointerEnter,
    onPointerLeave,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  },
  forwardedRef,
) {
  const hostRef = useRef<ComponentRef<typeof View> | null>(null);
  const handlersRef = useRef({
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  });

  useEffect(() => {
    handlersRef.current = {
      onDragStart,
      onDragEnd,
      onDragOver,
      onDragLeave,
      onDrop,
    };
  });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const el = hostRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') {
      return;
    }

    el.draggable = draggable;

    const handleDragStart = (event: DragEvent) => {
      handlersRef.current.onDragStart?.(event as unknown as WebDomDragEvent);
    };
    const handleDragEnd = (event: DragEvent) => {
      handlersRef.current.onDragEnd?.(event as unknown as WebDomDragEvent);
    };
    const handleDragOver = (event: DragEvent) => {
      handlersRef.current.onDragOver?.(event as unknown as WebDomDragEvent);
    };
    const handleDragLeave = (event: DragEvent) => {
      // Ignore synthetic dragleave when pointer moves into a descendant element.
      const related = event.relatedTarget as Node | null;
      if (related && el.contains(related)) {
        return;
      }
      handlersRef.current.onDragLeave?.(event as unknown as WebDomDragEvent);
    };
    const handleDrop = (event: DragEvent) => {
      handlersRef.current.onDrop?.(event as unknown as WebDomDragEvent);
    };

    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragend', handleDragEnd);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);

    return () => {
      el.draggable = false;
      el.removeEventListener('dragstart', handleDragStart);
      el.removeEventListener('dragend', handleDragEnd);
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('drop', handleDrop);
    };
  }, [draggable]);

  const pointerProps =
    Platform.OS === 'web'
      ? ({
          ...(onPointerEnter ? { onPointerEnter } : null),
          ...(onPointerLeave ? { onPointerLeave } : null),
        } as object)
      : {};

  return (
    <View
      {...pointerProps}
      ref={(node) => {
        hostRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      }}
      collapsable={collapsable}
      style={style}>
      {children}
    </View>
  );
});
