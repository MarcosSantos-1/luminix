import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand } from '../../theme/brand';
import { heroAutocuidadoSource } from '../../assets/brandAssets';
import { PageIndicator } from './PageIndicator';

interface ExperienceStepProps {
  total: number;
  current: number;
  onNext: () => void;
  onBack: () => void;
  onSelect: (i: number) => void;
  width: number;
}

export function ExperienceStep({
  total,
  current,
  onNext,
  onBack,
  onSelect,
  width,
}: ExperienceStepProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.hero}>
        <Image
          source={heroAutocuidadoSource}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(253,247,244,0.15)', brand.background]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.floatCard, styles.floatLeft, { top: insets.top + 48 }]}>
          <View style={styles.floatIcon}>
            <Ionicons name="time-outline" size={20} color={brand.rose} />
          </View>
          <View>
            <Text style={styles.floatLabel}>Hoje</Text>
            <Text style={styles.floatValue}>Limpeza de pele</Text>
          </View>
        </View>

        <View style={[styles.floatCard, styles.floatRight]}>
          <Ionicons name="flower" size={16} color={brand.gold} />
          <Text style={styles.floatSeal}>Autocuidado diário</Text>
        </View>
      </View>

      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <View style={styles.badge}>
          <Ionicons name="heart-outline" size={14} color={brand.ink} />
          <Text style={styles.badgeText}>A experiência</Text>
        </View>
        <Text style={styles.title}>Seu momento de autocuidado, simplificado.</Text>
        <Text style={styles.copy}>
          Agende procedimentos e acompanhe seus horários em poucos toques, com uma experiência
          pensada para você.
        </Text>

        <View style={styles.footer}>
          <PageIndicator total={total} current={current} onSelect={onSelect} />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onBack} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.9}>
              <Text style={styles.primaryBtnText}>Continuar</Text>
              <Ionicons name="arrow-forward" size={20} color={brand.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    backgroundColor: brand.background,
  },
  hero: {
    height: '52%',
    width: '100%',
    overflow: 'hidden',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  floatCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: brand.rose,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  floatLeft: {
    top: 96,
    left: 20,
  },
  floatRight: {
    bottom: 32,
    right: 20,
  },
  floatIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(236, 73, 152, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: brand.muted,
  },
  floatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: brand.ink,
  },
  floatSeal: {
    fontSize: 12,
    fontWeight: '500',
    color: brand.ink,
  },
  body: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: brand.blush,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: brand.ink,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    color: brand.ink,
  },
  copy: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: brand.muted,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  secondaryBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: brand.muted,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: brand.rose,
    borderRadius: 999,
    paddingVertical: 16,
    shadowColor: brand.rose,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryBtnText: {
    color: brand.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
