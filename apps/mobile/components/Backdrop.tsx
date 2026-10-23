import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Mask, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { isDarkMode } from '../theme';

const HEXAGONS = [
  '36,6 60,20 60,48 36,62 12,48 12,20',
  '84,34 108,48 108,76 84,90 60,76 60,48',
  '180,8 204,22 204,50 180,64 156,50 156,22',
  '276,36 300,50 300,78 276,92 252,78 252,50',
  '324,4 348,18 348,46 324,60 300,46 300,18',
  '132,86 156,100 156,128 132,142 108,128 108,100',
  '228,86 252,100 252,128 228,142 204,128 204,100',
];

export function Backdrop() {
  const { width } = useWindowDimensions();
  const edge = isDarkMode ? '#f7e8d2' : '#6d5739';
  const glow = isDarkMode ? '#e8cba2' : '#b99b70';

  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityElementsHidden>
      <Svg width={width} height={360} viewBox="0 0 360 360">
        <Defs>
          <RadialGradient id="chaiGlow" cx="50%" cy="6%" rx="68%" ry="62%">
            <Stop offset="0%" stopColor={glow} stopOpacity={isDarkMode ? 0.14 : 0.11} />
            <Stop offset="100%" stopColor={glow} stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="chaiFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="74%" stopColor="#ffffff" stopOpacity="0.8" />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </LinearGradient>
          <Mask id="chaiFadeMask" x="0" y="0" width="100%" height="100%">
            <Rect width="360" height="360" fill="url(#chaiFade)" />
          </Mask>
        </Defs>
        <G mask="url(#chaiFadeMask)">
          <Rect width="360" height="360" fill="url(#chaiGlow)" />
          {HEXAGONS.map((points) => (
            <Polygon
              key={points}
              points={points}
              fill="none"
              stroke={edge}
              strokeOpacity={isDarkMode ? 0.12 : 0.1}
              strokeWidth="0.8"
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 360,
    alignItems: 'center',
    overflow: 'hidden',
  },
});
