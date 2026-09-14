import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '../../../theme/brand';

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  emoji?: string;
  description?: string;
}

interface ChoiceCardsProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2;
}

export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  columns = 1,
}: ChoiceCardsProps<T>) {
  return (
    <View style={[styles.wrap, columns === 2 && styles.wrap2]}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.88}
            style={[
              styles.card,
              columns === 2 && styles.cardHalf,
              selected && styles.cardSelected,
            ]}
          >
            <View style={styles.row}>
              {opt.emoji ? <Text style={styles.emoji}>{opt.emoji}</Text> : null}
              <View style={styles.textCol}>
                <Text style={[styles.label, selected && styles.labelSelected]}>
                  {opt.label}
                </Text>
                {opt.description ? (
                  <Text style={styles.description}>{opt.description}</Text>
                ) : null}
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? (
                  <Ionicons name="checkmark" size={14} color={brand.white} />
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  wrap2: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1.5,
    borderColor: brand.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardHalf: { width: '48%', flexGrow: 1 },
  cardSelected: {
    borderColor: brand.rose,
    backgroundColor: brand.blush,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 22 },
  textCol: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600', color: brand.ink },
  labelSelected: { color: brand.roseDeep },
  description: { fontSize: 12, color: brand.muted, marginTop: 2, lineHeight: 16 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: brand.rose,
    borderColor: brand.rose,
  },
});
