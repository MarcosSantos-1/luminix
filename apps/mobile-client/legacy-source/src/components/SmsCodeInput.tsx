import { useRef } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

/** Um único input permite colar e preencher automaticamente os seis dígitos. */
export function SmsCodeInput({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<TextInput>(null);
  return (
    <TouchableOpacity activeOpacity={1} onPress={() => input.current?.focus()} disabled={disabled}>
      <View style={styles.row} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={[styles.box, index === value.length && styles.active]}>
            <Text style={styles.digit}>{value[index] || ''}</Text>
          </View>
        ))}
      </View>
      <TextInput ref={input} style={styles.input} value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 6))}
        accessibilityLabel="Código SMS de seis dígitos" keyboardType="number-pad"
        textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6}
        editable={!disabled} autoFocus caretHidden />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, height: 52, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  active: { borderColor: '#ec4899' },
  digit: { fontSize: 22, fontWeight: '600', color: '#111827' },
  input: { ...StyleSheet.absoluteFillObject, opacity: 0.02, color: 'transparent' },
});
