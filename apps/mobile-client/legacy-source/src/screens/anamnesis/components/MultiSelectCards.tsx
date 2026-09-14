import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '../../../theme/brand';

export interface MultiOption {
  value: string;
  label: string;
  emoji?: string;
}

interface MultiSelectCardsProps {
  options: MultiOption[];
  values: string[];
  onToggle: (value: string) => void;
}

export function MultiSelectCards({ options, values, onToggle }: MultiSelectCardsProps) {
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const selected = values.includes(opt.value);
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onToggle(opt.value)}
            activeOpacity={0.88}
            style={[styles.card, selected && styles.cardSelected]}
          >
            {opt.emoji ? <Text style={styles.emoji}>{opt.emoji}</Text> : null}
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={2}>
              {opt.label}
            </Text>
            <View style={[styles.check, selected && styles.checkSelected]}>
              {selected ? (
                <Ionicons name="checkmark" size={12} color={brand.white} />
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '47%',
    flexGrow: 1,
    minHeight: 72,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1.5,
    borderColor: brand.border,
    borderRadius: 16,
    padding: 14,
    justifyContent: 'space-between',
  },
  cardSelected: {
    borderColor: brand.rose,
    backgroundColor: brand.blush,
  },
  emoji: { fontSize: 18, marginBottom: 6 },
  label: { fontSize: 14, fontWeight: '600', color: brand.ink, paddingRight: 18 },
  labelSelected: { color: brand.roseDeep },
  check: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: brand.rose,
    borderColor: brand.rose,
  },
});
