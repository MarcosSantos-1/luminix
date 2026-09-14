import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand } from '../../theme/brand';
import { logoSource } from '../../assets/brandAssets';
import { PageIndicator } from './PageIndicator';
import { getPlans } from '../../lib/api';
import { maxPlanSavingsPercent } from '../../types/commercial';

interface ClubStepProps {
  total: number;
  current: number;
  onNext: () => void;
  onBack: () => void;
  onSelect: (i: number) => void;
  width: number;
}

export function ClubStep({ total, current, onNext, onBack, onSelect, width }: ClubStepProps) {
  const insets = useSafeAreaInsets();
  const [maxTreatments, setMaxTreatments] = useState(4);
  const [savingsPercent, setSavingsPercent] = useState(0);

  useEffect(() => {
    let active = true;
    void getPlans()
      .then((plans) => {
        if (active && plans.length) {
          setMaxTreatments(Math.max(...plans.map((plan) => plan.maxTreatmentsPerMonth)));
          setSavingsPercent(maxPlanSavingsPercent(plans));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const benefits = [
    'Tratamentos garantidos todo mês',
    savingsPercent > 0 ? `Até ${savingsPercent}% de economia em serviços` : 'Economia em serviços inclusos',
    'Bronze, Prata ou Ouro — escolha o seu ritmo',
  ];

  return (
    <View style={[styles.slide, { width }]}>
      <LinearGradient
        colors={[brand.champagne, brand.background, brand.blush]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orb} />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 12) + 16,
          },
        ]}
      >
        <View style={styles.badge}>
          <Ionicons name="flower" size={14} color="#8a5a2d" />
          <Text style={styles.badgeText}>Charme & Bela Club</Text>
        </View>

        <View style={styles.cardWrap}>
          <LinearGradient
            colors={['#3a2230', '#2b1721', '#1c0f16']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.vipCard}
          >
            <View style={styles.vipOrb} />
            <View style={styles.vipTop}>
              <View style={styles.vipBrand}>
                <Image source={logoSource} style={styles.vipLogo} resizeMode="contain" />
                <Text style={styles.vipLabel}>Club</Text>
              </View>
              <View style={styles.memberPill}>
                <Text style={styles.memberPillText}>Membro</Text>
              </View>
            </View>

            <Text style={styles.subLabel}>Assinatura mensal</Text>
            <Text style={styles.planName}>Plano Ouro</Text>
            <Text style={styles.planHint}>O plano mais completo do clube</Text>

            <View style={styles.vipBottom}>
              <View>
                <Text style={styles.memberName}>Seu nome aqui</Text>
                <Text style={styles.memberCode}>Até {maxTreatments} sessões / mês</Text>
              </View>
              <View style={styles.offPill}>
                <Ionicons name="pricetag" size={12} color={brand.white} />
                <Text style={styles.offPillText}>
                  {savingsPercent > 0 ? `ATÉ ${savingsPercent}% OFF` : 'ECONOMIZE'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <Text style={styles.title}>Beleza com previsibilidade.</Text>
        <Text style={styles.subtitle}>
          Assine, agende pelo app e aproveite tratamentos todo mês com valor fixo.
        </Text>
        <View style={styles.benefits}>
          {benefits.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <View style={styles.check}>
                <Ionicons name="checkmark" size={14} color="#8a5a2d" />
              </View>
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>

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
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    top: 40,
    right: -64,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: brand.goldSoft,
    opacity: 0.35,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(201, 162, 75, 0.15)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8a5a2d',
  },
  cardWrap: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 304,
    marginBottom: 8,
  },
  vipCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(230, 201, 138, 0.4)',
    overflow: 'hidden',
  },
  vipOrb: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(201, 162, 75, 0.2)',
  },
  vipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vipBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vipLogo: {
    width: 32,
    height: 32,
  },
  vipLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: brand.champagne,
  },
  memberPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(230, 201, 138, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  memberPillText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: brand.goldSoft,
  },
  subLabel: {
    marginTop: 32,
    fontSize: 11,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: 'rgba(247, 233, 221, 0.5)',
  },
  planName: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '600',
    color: brand.goldSoft,
  },
  planHint: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(247, 233, 221, 0.55)',
  },
  vipBottom: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  memberName: {
    fontSize: 11,
    color: 'rgba(247, 233, 221, 0.5)',
  },
  memberCode: {
    fontSize: 14,
    fontWeight: '500',
    color: brand.champagne,
  },
  offPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: brand.rose,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  offPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: brand.white,
  },
  title: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    color: brand.ink,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: brand.muted,
  },
  benefits: {
    marginTop: 16,
    gap: 10,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(201, 162, 75, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: brand.ink,
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
