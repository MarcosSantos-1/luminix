import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '../../../theme/brand';

interface ConsentItem {
  key: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

interface ConsentChecksProps {
  items: ConsentItem[];
}

export function ConsentChecks({ items }: ConsentChecksProps) {
  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          onPress={() => item.onChange(!item.value)}
          activeOpacity={0.88}
          style={[styles.row, item.value && styles.rowOn]}
        >
          <View style={[styles.box, item.value && styles.boxOn]}>
            {item.value ? (
              <Ionicons name="checkmark" size={14} color={brand.white} />
            ) : null}
          </View>
          <Text style={styles.label}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 16,
    padding: 14,
  },
  rowOn: {
    borderColor: brand.rose,
    backgroundColor: brand.blush,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: brand.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: {
    backgroundColor: brand.rose,
    borderColor: brand.rose,
  },
  label: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: brand.ink,
    fontWeight: '500',
  },
});
