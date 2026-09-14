import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { brand } from '../theme/brand';
import { cardBrandLabel } from '../types/commercial';

export function CardNicknameModal({
  visible,
  brandName,
  last4,
  initialValue,
  onSave,
  onSkip,
}: {
  visible: boolean;
  brandName?: string | null;
  last4?: string | null;
  initialValue?: string | null;
  onSave: (nickname: string) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState(initialValue || '');

  useEffect(() => {
    if (visible) setValue(initialValue || '');
  }, [initialValue, visible]);

  const trimmed = value.trim();
  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onSkip} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Apelido do cartão</Text>
          <Text style={styles.subtitle}>
            Como você quer ver {cardBrandLabel(brandName)}
            {last4 ? ` •••• ${last4}` : ''} na hora de pagar?
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Ex.: Nubank pessoal, cartão da empresa"
            placeholderTextColor={brand.muted}
            maxLength={40}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (trimmed) onSave(trimmed);
            }}
          />
          <TouchableOpacity
            style={[styles.primary, !trimmed && styles.primaryDisabled]}
            disabled={!trimmed}
            onPress={() => onSave(trimmed)}
          >
            <Text style={styles.primaryText}>Salvar apelido</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} style={styles.skip}>
            <Text style={styles.skipText}>Agora não</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 23, 33, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: brand.white,
    borderRadius: 24,
    padding: 22,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: brand.ink },
  subtitle: { color: brand.muted, fontSize: 13, lineHeight: 19 },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: brand.ink,
  },
  primary: {
    marginTop: 8,
    backgroundColor: brand.rose,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: brand.white, fontWeight: '800' },
  skip: { alignItems: 'center', paddingVertical: 8 },
  skipText: { color: brand.muted, fontWeight: '700' },
});
