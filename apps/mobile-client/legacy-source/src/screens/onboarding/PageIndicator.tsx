import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { brand } from '../../theme/brand';

interface PageIndicatorProps {
  total: number;
  current: number;
  onSelect?: (index: number) => void;
  light?: boolean;
}

export function PageIndicator({ total, current, onSelect, light }: PageIndicatorProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === current;
        return (
          <TouchableOpacity
            key={i}
            disabled={!onSelect}
            onPress={() => onSelect?.(i)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Ir para passo ${i + 1}`}
          >
            <View
              style={[
                styles.dot,
                active && styles.dotActive,
                light && styles.dotLight,
                light && active && styles.dotActiveLight,
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(236, 73, 152, 0.25)',
  },
  dotActive: {
    width: 28,
    backgroundColor: brand.rose,
  },
  dotLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  dotActiveLight: {
    backgroundColor: brand.white,
  },
});
