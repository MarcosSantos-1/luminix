import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Linking, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getConfig, getPlans } from '../lib/api';
import { clinicInfoFromConfig } from '../constants/clinicInfo';
import { maxPlanSavingsPercent, type Plan } from '../types/commercial';

const { width } = Dimensions.get('window');

export function HomeScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [systemConfig, setSystemConfig] = useState<Awaited<ReturnType<typeof getConfig>> | null>(null);
  const clinic = useMemo(() => clinicInfoFromConfig(systemConfig), [systemConfig]);
  const maxTreatments = Math.max(0, ...plans.map((plan) => plan.maxTreatmentsPerMonth)) || 4;
  const savingsPercent = maxPlanSavingsPercent(plans);

  useEffect(() => {
    let active = true;
    void Promise.all([getPlans(), getConfig()])
      .then(([nextPlans, nextConfig]) => {
        if (!active) return;
        setPlans(nextPlans);
        setSystemConfig(nextConfig);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const openWhatsApp = () => {
    Linking.openURL(`https://wa.me/${clinic.whatsappE164}`);
  };

  const openInstagram = () => {
    Linking.openURL(clinic.instagramUrl);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logo}
            />
            <Text style={styles.headerTitle}>Charme & Bela</Text>
          </View>
          <TouchableOpacity style={styles.loginButton}>
            <Text style={styles.loginButtonText}>Entrar</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Ionicons name="flower" size={16} color="#831843" />
            <Text style={styles.badgeText}>Especialistas em Estética</Text>
          </View>

          <Text style={styles.heroTitle}>
            Sua beleza,{'\n'}
            <Text style={styles.heroTitleAccent}>nosso cuidado</Text>
          </Text>

          <Text style={styles.heroDescription}>
            Mais que uma clínica, um universo de possibilidades para revelar a sua beleza única.
          </Text>

          {/* Hero Image */}
          <View style={styles.heroImageContainer}>
            <View style={styles.heroImagePlaceholder}>
              <Ionicons name="heart" size={60} color="#ec4899" />
            </View>

            {/* Rating Card */}
            <View style={styles.ratingCard}>
              <View style={styles.ratingIcon}>
                <Ionicons name="star" size={24} color="#ec4899" />
              </View>
              <View>
                <Text style={styles.ratingValue}>4.9</Text>
                <Text style={styles.ratingLabel}>Avaliação</Text>
              </View>
            </View>
          </View>

          {/* CTA Buttons */}
          <View style={styles.ctaButtons}>
            <TouchableOpacity style={styles.primaryButton}>
              <Ionicons name="calendar" size={20} color="white" />
              <Text style={styles.primaryButtonText}>Agendar Consulta</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.outlineButton} onPress={openWhatsApp}>
              <Ionicons name="logo-whatsapp" size={20} color="#ec4899" />
              <Text style={styles.outlineButtonText}>Fale Conosco</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={styles.stats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>Centenas</Text>
              <Text style={styles.statLabel}>Clientes Felizes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>10+</Text>
              <Text style={styles.statLabel}>Anos de Experiência</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>98%</Text>
              <Text style={styles.statLabel}>Satisfação</Text>
            </View>
          </View>
        </View>

        {/* Treatment Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nossos Tratamentos</Text>
          <Text style={styles.sectionSubtitle}>
            Descubra nossos procedimentos estéticos personalizados
          </Text>

          <View style={styles.categoriesGrid}>
            {[
              {
                title: 'Tratamentos Faciais',
                description: 'Limpeza de pele, peelings, microagulhamento e mais',
                icon: 'face-woman-outline',
                gradient: ['#fce7f3', '#fbcfe8']
              },
              {
                title: 'Tratamentos Corporais',
                description: 'Drenagem, massagem modeladora, radiofrequência',
                icon: 'human',
                gradient: ['#f3e8ff', '#e9d5ff']
              },
              {
                title: 'Procedimentos Injetáveis',
                description: 'Botox, preenchimentos, bioestimuladores',
                icon: 'needle',
                gradient: ['#dbeafe', '#bfdbfe']
              },
              {
                title: 'Pós-Operatório',
                description: 'Drenagem especializada e cuidados pós-cirúrgicos',
                icon: 'hospital-box-outline',
                gradient: ['#d1fae5', '#a7f3d0']
              }
            ].map((category, index) => (
              <TouchableOpacity key={index} style={styles.categoryCard}>
                <View style={[styles.categoryIcon, { backgroundColor: category.gradient[0] }]}>
                  <MaterialCommunityIcons
                    name={category.icon as any}
                    size={32}
                    color="#ec4899"
                  />
                </View>
                <Text style={styles.categoryTitle}>{category.title}</Text>
                <Text style={styles.categoryDescription}>{category.description}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Ver Todos os Serviços</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Subscription CTA */}
        <View style={styles.subscriptionBanner}>
          <View style={styles.subscriptionBadge}>
            <Ionicons name="flower" size={14} color="white" />
            <Text style={styles.subscriptionBadgeText}>Charme & Bela Club</Text>
          </View>

          <Text style={styles.subscriptionTitle}>
            Assine e {savingsPercent > 0 ? `Economize até ${savingsPercent}%` : 'Economize nos Tratamentos'}
          </Text>

          <Text style={styles.subscriptionDescription}>
            Tenha até {maxTreatments} tratamentos por um valor fixo mensal
          </Text>

          <View style={styles.subscriptionFeatures}>
            {[
              'Sem taxa de adesão',
              'Cancele quando quiser',
              'Agende online 24/7',
              `Até ${maxTreatments} procedimentos/mês`
            ].map((feature, index) => (
              <View key={index} style={styles.subscriptionFeature}>
                <Ionicons name="checkmark-circle" size={20} color="white" />
                <Text style={styles.subscriptionFeatureText}>{feature}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.subscriptionButton}>
            <Text style={styles.subscriptionButtonText}>Quero Assinar Agora</Text>
          </TouchableOpacity>
        </View>

        {/* Plans Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Planos de Assinatura</Text>
          <Text style={styles.sectionSubtitle}>
            Escolha o plano perfeito para você
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.plansScroll}>
            {plans.map((plan) => {
              const visual = plan.tier === 'BRONZE'
                ? { emoji: '🥉', color: '#f59e0b' }
                : plan.tier === 'SILVER'
                  ? { emoji: '🥈', color: '#ec4899' }
                  : { emoji: '🥇', color: '#8b5cf6' };
              return (
              <View key={plan.id} style={[styles.planCard, plan.tier === 'SILVER' && styles.planCardPopular]}>
                {plan.tier === 'SILVER' && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>MAIS POPULAR</Text>
                  </View>
                )}
                <Text style={styles.planEmoji}>{visual.emoji}</Text>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>
                  {plan.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </Text>
                <Text style={styles.planPeriod}>/mês</Text>

                <View style={styles.planFeatures}>
                  <View style={styles.planFeature}>
                    <Ionicons name="checkmark" size={16} color={visual.color} />
                    <Text style={styles.planFeatureText}>
                      {plan.maxTreatmentsPerMonth} tratamentos por mês
                    </Text>
                  </View>
                  <View style={styles.planFeature}>
                    <Ionicons name="checkmark" size={16} color={visual.color} />
                    <Text style={styles.planFeatureText}>{plan.description}</Text>
                  </View>
                </View>

                <TouchableOpacity style={[styles.planButton, { backgroundColor: visual.color }]}>
                  <Text style={styles.planButtonText}>Escolher Plano</Text>
                </TouchableOpacity>
              </View>
            )})}
          </ScrollView>
        </View>

        {/* Contact Section */}
        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Entre em Contato</Text>

          <TouchableOpacity style={styles.contactCard} onPress={openWhatsApp}>
            <View style={styles.contactIcon}>
              <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>WhatsApp</Text>
              <Text style={styles.contactValue}>{clinic.whatsappDisplay}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={openInstagram}>
            <View style={styles.contactIcon}>
              <Ionicons name="logo-instagram" size={24} color="#E1306C" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Instagram</Text>
              <Text style={styles.contactValue}>{clinic.instagramHandle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>

          <View style={styles.contactCard}>
            <View style={styles.contactIcon}>
              <Ionicons name="location" size={24} color="#ec4899" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Endereço</Text>
              <Text style={styles.contactValue}>
                {clinic.addressLine1}{'\n'}{clinic.addressLine2} — {clinic.cityState}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2025 Charme & Bela</Text>
          <Text style={styles.footerSubtext}>Fundado em 2015</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#fce7f3',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  loginButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  loginButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  hero: {
    padding: 20,
    backgroundColor: '#fdf2f8',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fce7f3',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  badgeText: {
    color: '#831843',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  heroTitle: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
    lineHeight: 48,
  },
  heroTitleAccent: {
    color: '#ec4899',
  },
  heroDescription: {
    fontSize: 17,
    color: '#4b5563',
    lineHeight: 26,
    marginBottom: 24,
  },
  heroImageContainer: {
    marginBottom: 24,
    position: 'relative',
  },
  heroImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fce7f3',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingCard: {
    position: 'absolute',
    bottom: -20,
    left: 20,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  ratingIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#fce7f3',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  ratingValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  ratingLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  ctaButtons: {
    marginTop: 32,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#ec4899',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  outlineButton: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#ec4899',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  outlineButtonText: {
    color: '#ec4899',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stats: {
    flexDirection: 'row',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#fce7f3',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ec4899',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#fce7f3',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  categoriesGrid: {
    gap: 16,
    marginBottom: 24,
  },
  categoryCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  categoryDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  secondaryButton: {
    backgroundColor: '#ec4899',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subscriptionBanner: {
    backgroundColor: '#be185d',
    padding: 24,
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 20,
  },
  subscriptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  subscriptionBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  subscriptionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subscriptionDescription: {
    fontSize: 16,
    color: '#fce7f3',
    marginBottom: 20,
    lineHeight: 24,
  },
  subscriptionFeatures: {
    gap: 12,
    marginBottom: 20,
  },
  subscriptionFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subscriptionFeatureText: {
    color: 'white',
    fontSize: 14,
  },
  subscriptionButton: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  subscriptionButtonText: {
    color: '#be185d',
    fontSize: 16,
    fontWeight: 'bold',
  },
  plansScroll: {
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    marginRight: 16,
    width: width * 0.75,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  planCardPopular: {
    borderColor: '#ec4899',
    borderWidth: 3,
  },
  popularBadge: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 12,
  },
  popularBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  planEmoji: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 12,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  planPeriod: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  planFeatures: {
    gap: 8,
    marginBottom: 20,
  },
  planFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planFeatureText: {
    fontSize: 13,
    color: '#4b5563',
    flex: 1,
  },
  planButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  planButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  contactSection: {
    padding: 20,
    backgroundColor: '#f9fafb',
  },
  contactTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  contactCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  contactIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#f9fafb',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  footer: {
    padding: 32,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  footerText: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 4,
  },
  footerSubtext: {
    color: '#6b7280',
    fontSize: 12,
  },
});

