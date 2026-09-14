import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { brand } from '../../../theme/brand';

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function SwitchRow({ label, description, value, onChange }: SwitchRowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onChange(!value)}
      style={[styles.row, value && styles.rowOn]}
    >
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(43,23,33,0.12)', true: 'rgba(236,73,152,0.45)' }}
        thumbColor={value ? brand.rose : '#f4f3f4'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowOn: {
    borderColor: brand.rose,
    backgroundColor: brand.blush,
  },
  textCol: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600', color: brand.ink },
  description: { fontSize: 12, color: brand.muted, marginTop: 3, lineHeight: 16 },
});
