import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/** Native-driven pulse for image preview loading. */
export const BreathingSkeleton = ({ style }: Readonly<{ style?: StyleProp<ViewStyle> }>) => {
  const opacity = useRef(new Animated.Value(0.42)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { duration: 1050, toValue: 0.95, useNativeDriver: true }),
      Animated.timing(opacity, { duration: 1050, toValue: 0.42, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return <Animated.View pointerEvents="none" style={[styles.skeleton, style, { opacity }]} />;
};

const styles = StyleSheet.create({ skeleton: { backgroundColor: '#E9E7E2' } });
