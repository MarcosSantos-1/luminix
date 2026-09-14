import { View, Text, TextInput, StyleSheet } from 'react-native';
import { brand } from '../../../theme/brand';
import { dismissKeyboard } from '../../../components/KeyboardForm';

interface RevealInputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}

export function RevealInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType = 'default',
  maxLength,
  autoCapitalize,
  autoCorrect,
}: RevealInputProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(138, 112, 120, 0.55)"
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        style={[styles.input, multiline && styles.multiline]}
        textAlignVertical={multiline ? 'top' : 'center'}
        returnKeyType={multiline ? 'default' : 'done'}
        blurOnSubmit={!multiline}
        onSubmitEditing={multiline ? undefined : dismissKeyboard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: brand.ink },
  input: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: brand.ink,
    minHeight: 52,
  },
  multiline: {
    minHeight: 88,
    paddingTop: 14,
  },
});
