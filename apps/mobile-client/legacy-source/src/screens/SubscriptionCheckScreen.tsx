import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '../theme/brand';
import { logoSource } from '../assets/brandAssets';
import { useCommercial } from '../contexts/CommercialContext';

interface SubscriptionCheckScreenProps {
  onContinue: () => void;
  onViewPlans: () => void;
}

const FEATURES = [
  {
    icon: 'calendar-outline' as const,
    title: 'Agendamentos fáceis',
    text: 'Marque seus horários de forma rápida e prática, direto pelo app.',
  },
  {
    icon: 'heart-outline' as const,
    title: 'Tratamentos e planos',
    text: 'Conheça nossos tratamentos e escolha o plano ideal para você.',
  },
  {
    icon: 'person-outline' as const,
    title: 'Ajustes e preferências',
    text: 'Gerencie suas informações, preferências e comunicação com a clínica.',
  },
  {
    icon: 'time-outline' as const,
    title: 'Seu histórico',
    text: 'Acompanhe seus atendimentos, evoluções e procedimentos realizados.',
  },
];

/** Tela pós-anamnese: boas-vindas à clínica + convite ao Charme & Bela Club. */
export function SubscriptionCheckScreen({
  onContinue,
  onViewPlans,
}: SubscriptionCheckScreenProps) {
  const insets = useSafeAreaInsets();
  const { plans } = useCommercial();
  const maxTreatments = Math.max(0, ...plans.map((plan) => plan.maxTreatmentsPerMonth));

  return (
    <View style={styles.root}>
      <View style={[styles.orb, styles.orbChampagne]} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 28,
            paddingBottom: Math.max(insets.bottom, 12) + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.badge}>
          <Ionicons name="diamond" size={13} color={brand.gold} />
          <Text style={styles.badgeText}>Charme & Bela Club</Text>
        </View>

        <Text style={styles.title}>Seja bem-vindo(a)! </Text>
        <Text style={styles.subtitle}>
          Sua ficha foi concluída com sucesso. Agora você já faz parte da Charme & Bela
         e pode aproveitar tudo que preparamos para você!
        </Text>



        <View style={styles.card}>
          {FEATURES.map((item, index) => (
            <View key={item.title}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <View style={styles.iconCircle}>
                  <Ionicons name={item.icon} size={20} color={brand.rose} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowBody}>{item.text}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.clubCard}>
          <View style={styles.clubIconBox}>
            <Ionicons name="diamond-outline" size={26} color={brand.rose} />
          </View>
          <View style={styles.clubText}>
            <Text style={styles.clubTitle}>Charme & Bela Club</Text>
            <Text style={styles.clubBody}>
              Planos mensais com até {maxTreatments || 4} tratamentos inclusos, benefícios
              exclusivos e muita tecnologia para cuidar de você.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.primary} onPress={onViewPlans} activeOpacity={0.9}>
            <Text style={styles.primaryText}>Ver Charme & Bela Club</Text>
            <Ionicons name="arrow-forward" size={20} color={brand.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onContinue} activeOpacity={0.85}>
            <Text style={styles.secondaryText}>Continuar para o início</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  flex: { flex: 1 },
  orb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  orbChampagne: {
    top: -40,
    right: -80,
    backgroundColor: 'rgba(230, 201, 138, 0.28)',
  },
  sparkleTop: {
    position: 'absolute',
    top: 72,
    right: 36,
  },
  sparkleMid: {
    position: 'absolute',
    top: 96,
    right: 64,
  },
  content: {
    paddingHorizontal: 28,
    flexGrow: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(201,162,75,0.16)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#8a5a2d' },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: brand.ink,
    lineHeight: 34,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: brand.muted,
    marginBottom: 20,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 120,
    height: 120,
  },
  card: {
    backgroundColor: brand.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#2b1721',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    marginBottom: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(43, 23, 33, 0.08)',
    marginLeft: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fde8f1',
    borderWidth: 1,
    borderColor: 'rgba(236, 73, 152, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 3, paddingTop: 2 },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: brand.ink,
  },
  rowBody: {
    fontSize: 13,
    lineHeight: 18,
    color: brand.muted,
  },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fde8f1',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(236, 73, 152, 0.16)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 28,
  },
  clubIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: brand.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubText: { flex: 1, gap: 4 },
  clubTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: brand.ink,
  },
  clubBody: {
    fontSize: 13,
    lineHeight: 18,
    color: brand.muted,
  },
  footer: { gap: 12, marginTop: 'auto' },
  primary: {
    backgroundColor: brand.rose,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: brand.rose,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryText: { fontSize: 16, fontWeight: '600', color: brand.white },
  secondary: {
    borderWidth: 1.5,
    borderColor: brand.rose,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: brand.white,
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: brand.rose },
});
