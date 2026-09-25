import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

let toastListener: ((message: string) => void) | null = null;

export const showCenterToast = (message: string): void => { toastListener?.(message); };

/** One non-blocking overlay shared by image cards across product surfaces. */
export const CenterToast = () => {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    toastListener = (next) => {
      setMessage(next);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), 2800);
    };
    return () => {
      toastListener = null;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);
  return message ? <View pointerEvents="none" style={styles.overlay}><View style={styles.bubble}><Text style={styles.text}>{message}</Text></View></View> : null;
};

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 100 },
  bubble: { backgroundColor: 'rgba(34,34,34,0.9)', borderRadius: 12, maxWidth: 260, paddingHorizontal: 18, paddingVertical: 11 },
  text: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
