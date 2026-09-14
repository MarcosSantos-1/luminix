import { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationsPanel, resolveNotificationNav } from '../../components/NotificationsPanel';
import { usePushNotificationHandlers } from '../../lib/pushNotifications';
import { ClinicInfoPanel } from '../../components/ClinicInfoPanel';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCommercial } from '../../contexts/CommercialContext';
import {
  CATEGORY_META,
  isExpiredUnpaidHold,
  isOnlinePaymentHold,
  isActivatedPackage,
  maxPlanSavingsPercent,
  type PackagePurchase,
  type ServiceCategory,
} from '../../types/commercial';
import { displayUserFirstName } from '../../lib/userDisplay';
import { getCategoryIllustrations, logoSource } from '../../assets/brandAssets';
import { getUnreadNotificationsCount } from '../../lib/api';
import { HomePromoCarousel } from '../../components/HomePromoCarousel';
import {
  HOME_BANNER_ASPECT_RATIO,
  HOME_BANNER_BORDER_RADIUS,
} from '../../constants/homeBanner';

const { width } = Dimensions.get('window');

const NO_PLAN_CARD = {
  gradientColors: ['#ec4899', '#be185d'] as const,
};

const CATEGORY_GRADIENT: Record<ServiceCategory, readonly [string, string]> = {
  COMBO: ['#94a3b8', '#475569'],
  FACIAL: ['#a78bfa', '#7c3aed'],
  CORPORAL: ['#60a5fa', '#2563eb'],
  MASSAGEM: ['#34d399', '#059669'],
};

function isVisibleHomePackage(purchase: PackagePurchase) {
  if (!isActivatedPackage(purchase)) return false;
  if (purchase.remainingSessions > 0) return true;
  return (purchase.appointments ?? []).some(
    (item) => item.status === 'PENDING' || item.status === 'CONFIRMED',
  );
}

function packageCardSubtitle(purchase: PackagePurchase) {
  const done = purchase.sessionCount - purchase.remainingSessions;
  if (purchase.remainingSessions > 0) {
    return `${done}/${purchase.sessionCount} · agendar próxima`;
  }
  const completed = (purchase.appointments ?? []).filter((item) => item.status === 'COMPLETED').length;
  return `${completed}/${purchase.sessionCount} concluídas`;
}

function nextBillingLabel(startDate: string) {
  const start = new Date(startDate);
  const dayOfMonth = start.getDate();
  const next = new Date();
  next.setHours(12, 0, 0, 0);
  next.setDate(dayOfMonth);
  if (new Date().getDate() >= dayOfMonth) {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function friendlyLoadError(error: string | null) {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('internet') ||
    lower.includes('offline') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound')
  ) {
    return 'Sem conexão com a internet. Verifique sua rede e tente novamente.';
  }
  return error;
}

export function ClientHomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const categoryIllustrations = getCategoryIllustrations(user?.anamnesisForm?.personalData?.sex);
  const {
    services,
    appointments,
    plans,
    subscription,
    packagePurchases,
    clientBanners,
    clinicInfo,
    loading,
    refreshing,
    error,
    refresh,
  } = useCommercial();
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [clinicInfoVisible, setClinicInfoVisible] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const firstName = displayUserFirstName(user);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!user?.id) {
      setUnreadNotifications(0);
      return;
    }
    try {
      setUnreadNotifications(await getUnreadNotificationsCount(user.id));
    } catch {
      // silencioso — painel tenta de novo ao abrir
    }
  }, [user?.id]);

  const refreshHome = useCallback(async () => {
    await Promise.all([refresh(), refreshUnread()]);
  }, [refresh, refreshUnread]);

  const navigateToNotificationTarget = useCallback(
    (target: NonNullable<ReturnType<typeof resolveNotificationNav>>) => {
      if (target.stack === 'Plan') {
        navigation.navigate('Plan');
        return;
      }
      if (target.tab === 'Profile' && target.profileScreen) {
        navigation.navigate('Profile', { openScreen: target.profileScreen as 'history' });
        return;
      }
      if (target.tab === 'Services') {
        navigation.navigate('Services', target.applyVoucherId ? { applyVoucherId: target.applyVoucherId } : undefined);
        return;
      }
      if (target.tab) {
        navigation.navigate(target.tab);
      }
    },
    [navigation],
  );

  usePushNotificationHandlers({
    onReceived: () => {
      void refreshUnread();
    },
    onOpened: (payload) => {
      void refreshUnread();
      const target = resolveNotificationNav(payload.actionUrl ?? undefined);
      if (target) navigateToNotificationTarget(target);
      else setNotificationsVisible(true);
    },
  });

  // Home só consome banners já preparados no loading — sem refetch no focus
  useFocusEffect(
    useCallback(() => {
      scrollToTop();
      void refreshUnread();
      const unsubscribe = navigation.addListener('tabPress', scrollToTop);
      return unsubscribe;
    }, [navigation, scrollToTop, refreshUnread])
  );

  const showInitialSkeleton = loading && services.length === 0;
  const showHardError = Boolean(error) && services.length === 0 && !loading;
  const showSoftError = Boolean(error) && services.length > 0;
  const errorMessage = friendlyLoadError(error);

  const activePlan = subscription && (subscription.status !== 'CANCELED' || Boolean(subscription.endDate && new Date(subscription.endDate) > new Date())) ? {
    hasActivePlan: true,
    planName: subscription.plan.name,
    planEmoji: subscription.plan.tier === 'GOLD' ? '🥇' : subscription.plan.tier === 'SILVER' ? '🥈' : '🥉',
    usedTreatments: subscription.currentMonthUsage.totalTreatments,
    totalTreatments: subscription.plan.maxTreatmentsPerMonth,
    status: subscription.status,
    nextPayment:
      subscription.status === 'CANCELED' && subscription.endDate
        ? new Date(subscription.endDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
        : subscription.startDate
          ? nextBillingLabel(subscription.startDate)
          : '—',
    gradientColors: subscription.plan.tier === 'GOLD' ? ['#8b5cf6', '#7c3aed'] : subscription.plan.tier === 'SILVER' ? ['#64748b', '#475569'] : ['#2563eb', '#0891b2'],
  } : null;
  const categories = (Object.keys(CATEGORY_META) as ServiceCategory[]).map((category) => ({
    id: category,
    name: CATEGORY_META[category].label,
    icon: CATEGORY_META[category].icon,
    count: services.filter((service) => service.category === category).length,
    color: CATEGORY_META[category].color,
    included: Boolean(subscription?.plan.services.some((service) => service.category === category)),
  })).filter((category) => category.count > 0);
  const nextAppointments = appointments
    .filter((item) => {
      if (isExpiredUnpaidHold(item)) return false;
      if (!['PENDING', 'CONFIRMED'].includes(item.status)) return false;
      return new Date(`${item.startTime.slice(0, 10)}T${item.startTime.slice(11, 16)}:00`) > new Date();
    })
    .slice(0, 3)
    .map((item) => {
      const paymentHold = isOnlinePaymentHold(item);
      const paymentType =
        item.origin === 'SUBSCRIPTION'
          ? 'plan'
          : item.origin === 'ADMIN_CREATED'
            ? 'clinic'
            : paymentHold || item.paymentStatus === 'PENDING'
              ? 'pending'
              : 'cash';
      return {
        id: item.id,
        service: item.service.name,
        date: item.startTime.slice(8, 10),
        month: new Date(`${item.startTime.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        time: item.startTime.slice(11, 16),
        paymentType,
        status: item.status === 'CONFIRMED' ? 'confirmed' : 'pending',
        sessionLabel:
          item.packageSessionIndex && item.packagePurchase?.sessionCount
            ? `${item.packageSessionIndex}/${item.packagePurchase.sessionCount}`
            : null,
      };
    });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView ref={scrollRef} style={styles.scrollView} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshHome()} tintColor="#ec4899" />}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.logoCircle}
              onPress={() => setClinicInfoVisible(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Sobre a clínica"
            >
              <Image source={logoSource} style={styles.logoImage} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.greeting}>Olá,</Text>
              <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">{firstName}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => setNotificationsVisible(true)}
            accessibilityLabel={
              unreadNotifications > 0
                ? `${unreadNotifications} notificações não lidas`
                : 'Notificações'
            }
          >
            <Ionicons name="notifications-outline" size={24} color="#111827" />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? '9+' : String(unreadNotifications)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {showSoftError ? (
          <TouchableOpacity style={styles.softErrorBanner} onPress={() => void refresh()} activeOpacity={0.85}>
            <Ionicons name="cloud-offline-outline" size={18} color="#b45309" />
            <Text style={styles.softErrorText} numberOfLines={2}>
              {errorMessage || 'Não foi possível atualizar. Toque para tentar de novo.'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Card principal: plano + banners no mesmo carrossel 2:1 */}
        <View style={styles.planCardContainer}>
          {showInitialSkeleton ? (
            <PlanCardSkeleton />
          ) : (
            <HomePromoCarousel
              banners={clientBanners}
              onBannerPress={(banner) => {
                if (banner.machineKind === 'LASER' || banner.machineKind === 'CRYO') {
                  navigation.navigate('Services', { machine: banner.machineKind });
                  return;
                }
                if (banner.linkPath?.includes('machine=LASER')) {
                  navigation.navigate('Services', { machine: 'LASER' });
                } else if (banner.linkPath?.includes('machine=CRYO')) {
                  navigation.navigate('Services', { machine: 'CRYO' });
                } else {
                  navigation.navigate('Services');
                }
              }}
              planSlide={
                activePlan ? (
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => navigation.navigate('Plan')}
                    style={styles.heroSlideFill}
                  >
                    <ActivePlanCard plan={activePlan} embedded />
                  </TouchableOpacity>
                ) : (
                  <NoPlanCard
                    onPress={() => navigation.navigate('Plan')}
                    maxTreatments={Math.max(0, ...plans.map((plan) => plan.maxTreatmentsPerMonth)) || 4}
                    savingsPercent={maxPlanSavingsPercent(plans)}
                    embedded
                  />
                )
              }
            />
          )}
        </View>

        {showHardError ? (
          <View style={styles.hardErrorBox}>
            <Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />
            <Text style={styles.hardErrorTitle}>Não foi possível carregar</Text>
            <Text style={styles.hardErrorMessage}>
              {errorMessage || 'Verifique sua conexão e tente novamente.'}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void refresh()}>
              <Text style={styles.retryButtonText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {packagePurchases.filter(isVisibleHomePackage).length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Seus pacotes</Text>
                {packagePurchases.filter(isVisibleHomePackage).map((purchase) => (
                  <TouchableOpacity
                    key={purchase.id}
                    onPress={() => navigation.navigate('PackageTimeline', { purchaseId: purchase.id })}
                    style={styles.packageCard}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#94a3b8', '#475569']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.packageCardFill}
                    >
                      <Text style={styles.packageCardName}>
                        {purchase.packageService?.name || 'Pacote'}
                      </Text>
                      <Text style={styles.packageCardMeta}>{packageCardSubtitle(purchase)}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* Próximos Agendamentos */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Próximos Agendamentos</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Agenda')}>
                  <Text style={styles.seeAllLink}>ver todos</Text>
                </TouchableOpacity>
              </View>

              {showInitialSkeleton ? (
                <AppointmentsSkeleton />
              ) : (
                <View style={styles.appointmentsList}>
                  {nextAppointments.map(appointment => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      onPress={() => navigation.navigate('Agenda', { appointmentId: appointment.id })}
                    />
                  ))}
                  {nextAppointments.length === 0 ? <Text style={{ color: '#6b7280', textAlign: 'center', paddingVertical: 18 }}>Nenhum agendamento futuro</Text> : null}
                </View>
              )}

              <TouchableOpacity style={styles.newAppointmentButton} onPress={() => navigation.navigate('Services')}>
                <Ionicons name="add-circle-outline" size={24} color="white" />
                <Text style={styles.newAppointmentButtonText}>Novo Agendamento</Text>
              </TouchableOpacity>
            </View>

            {/* Procedimentos */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Procedimentos</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Services', { category: 'ALL' })}>
                  <Text style={styles.seeAllLink}>ver todos</Text>
                </TouchableOpacity>
              </View>

              {showInitialSkeleton ? (
                <CategoriesSkeleton />
              ) : (
                <View style={styles.categoriesGrid}>
                  {categories.map(category => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      hasPlan={category.included}
                      illustration={categoryIllustrations[category.id as ServiceCategory]}
                      onPress={() => navigation.navigate('Services', { category: category.id })}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* Ações Rápidas */}
            <View style={styles.section}>
              <View style={styles.quickActionsGrid}>
                <TouchableOpacity
                  style={[styles.quickActionCard, styles.quickActionAnamnesis]}
                  onPress={() => navigation.navigate('Profile', { openScreen: 'anamnesis' })}
                  activeOpacity={0.88}
                >
                  <View style={styles.quickActionIcon}>
                    <Ionicons name="clipboard-outline" size={28} color="#ffffff" />
                  </View>
                  <Text style={styles.quickActionTitleLight}>Minha Anamnese</Text>
                  <Text style={styles.quickActionSubtitleLight}>Histórico médico</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionCard, styles.quickActionPlan]}
                  onPress={() => navigation.navigate('Plan')}
                  activeOpacity={0.88}
                >
                  <View style={styles.quickActionIcon}>
                    <Ionicons name="card-outline" size={28} color="#ffffff" />
                  </View>
                  <Text style={styles.quickActionTitleLight}>Meu Plano</Text>
                  <Text style={styles.quickActionSubtitleLight}>Gerenciar assinatura</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <NotificationsPanel
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
        userId={user?.id}
        onUnreadCountChange={setUnreadNotifications}
        onNavigate={navigateToNotificationTarget}
      />
      <ClinicInfoPanel
        visible={clinicInfoVisible}
        onClose={() => setClinicInfoVisible(false)}
        clinic={clinicInfo}
      />
    </SafeAreaView>
  );
}

function SkeletonBlock({ style }: { style?: object }) {
  return <View style={[styles.skeletonBlock, style]} />;
}

function PlanCardSkeleton() {
  return (
    <View style={styles.planCardSkeleton}>
      <SkeletonBlock style={{ width: '55%', height: 22, marginBottom: 10 }} />
      <SkeletonBlock style={{ width: '40%', height: 14, marginBottom: 28 }} />
      <SkeletonBlock style={{ width: '100%', height: 8, borderRadius: 4, marginBottom: 12 }} />
      <SkeletonBlock style={{ width: '45%', height: 16 }} />
    </View>
  );
}

function AppointmentsSkeleton() {
  return (
    <View style={styles.appointmentsList}>
      {[0, 1].map((key) => (
        <View key={key} style={styles.appointmentCard}>
          <SkeletonBlock style={{ width: 56, height: 56, borderRadius: 12, marginRight: 16 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBlock style={{ width: '70%', height: 16 }} />
            <SkeletonBlock style={{ width: '45%', height: 12 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function CategoriesSkeleton() {
  return (
    <View style={styles.categoriesGrid}>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={[styles.categoryCard, { backgroundColor: '#f3f4f6', padding: 16 }]}>
          <SkeletonBlock style={{ width: 82, height: 82, borderRadius: 41, marginBottom: 12 }} />
          <SkeletonBlock style={{ width: '70%', height: 16, marginBottom: 8 }} />
          <SkeletonBlock style={{ width: '50%', height: 12 }} />
        </View>
      ))}
    </View>
  );
}

function ActivePlanCard({ plan, embedded }: { plan: any; embedded?: boolean }) {
  const progress = (plan.usedTreatments / plan.totalTreatments) * 100;
  const remaining = plan.totalTreatments - plan.usedTreatments;

  const card = (
      <LinearGradient
        colors={plan.gradientColors}
        style={[styles.planCard, embedded && styles.planCardEmbedded]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.planCardHeader}>
          <View>
            <Text style={styles.planName}>
              {plan.planEmoji} {plan.planName}
            </Text>
            <Text style={styles.planNextPayment}>
              {plan.status === 'CANCELED' ? 'Acesso até' : 'Próxima cobrança'}: {plan.nextPayment}
            </Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>Tratamentos usados este mês</Text>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {plan.usedTreatments}/{plan.totalTreatments}
            </Text>
          </View>
          <Text style={styles.remainingText}>
            Restam: {remaining} {remaining === 1 ? 'tratamento' : 'tratamentos'}
          </Text>
        </View>
      </LinearGradient>
  );

  if (embedded) return card;
  return <View style={styles.planCardContainer}>{card}</View>;
}

function NoPlanCard({
  onPress,
  maxTreatments,
  savingsPercent,
  embedded,
}: {
  onPress: () => void;
  maxTreatments: number;
  savingsPercent: number;
  embedded?: boolean;
}) {
  const card = (
      <LinearGradient
        colors={[...NO_PLAN_CARD.gradientColors]}
        style={[styles.planCard, styles.planCardNoPlan, embedded && styles.planCardEmbedded]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.planCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>Sem Plano Ativo</Text>
            <Text style={styles.planNextPayment}>
              Assine e {savingsPercent > 0 ? `economize até ${savingsPercent}%` : 'economize'} em tratamentos
            </Text>
          </View>
        </View>

        <View style={styles.noPlanContent}>
          <Text style={styles.noPlanText}>
            Até {maxTreatments} procedimentos por mês{'\n'}
            Valor fixo e previsível
          </Text>
          <TouchableOpacity style={styles.subscribeCTA} onPress={onPress}>
            <Text style={styles.subscribeCTAText}>Assinar Agora</Text>
            <Ionicons name="arrow-forward" size={20} color="#be185d" />
          </TouchableOpacity>
        </View>
      </LinearGradient>
  );

  if (embedded) return card;
  return <View style={styles.planCardContainer}>{card}</View>;
}

function CategoryCard({
  category,
  hasPlan,
  illustration,
  onPress,
}: {
  category: any;
  hasPlan: boolean;
  illustration: any;
  onPress: () => void;
}) {
  const colors = CATEGORY_GRADIENT[category.id as ServiceCategory] || [category.color, category.color];
  return (
    <TouchableOpacity style={styles.categoryCard} onPress={onPress} activeOpacity={0.9}>
      <LinearGradient colors={[...colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.categoryCardFill}>
        <View style={styles.categoryIconContainer}>
          <View style={styles.categoryIconCircle} />
          <Image source={illustration} style={styles.categoryIllustration} resizeMode="contain" />
        </View>
        <Text style={styles.categoryName}>{category.name}</Text>
        <Text style={styles.categoryCount}>
          {hasPlan ? 'Inclusos no plano' : `${category.count} serviços`}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function AppointmentCard({ appointment, onPress }: { appointment: any; onPress: () => void }) {
  const getPaymentInfo = () => {
    switch (appointment.paymentType) {
      case 'plan':
        return { icon: 'checkmark-circle', color: '#10b981', text: 'Plano' };
      case 'pending':
        return { icon: 'alert-circle', color: '#ef4444', text: 'Pendente pagamento' };
      case 'cash':
        return { icon: 'cash', color: '#f59e0b', text: 'Pago' };
      case 'clinic':
        return { icon: 'card', color: '#6366f1', text: 'Pagar na clínica' };
      default:
        return { icon: 'help-circle', color: '#6b7280', text: 'N/A' };
    }
  };

  const payment = getPaymentInfo();

  return (
    <TouchableOpacity style={styles.appointmentCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.appointmentDate}>
        <Text style={styles.appointmentDay}>{appointment.date}</Text>
        <Text style={styles.appointmentMonth}>{appointment.month}</Text>
      </View>

      <View style={styles.appointmentInfo}>
        <Text style={styles.appointmentService}>{appointment.service}</Text>
        <View style={styles.appointmentMeta}>
          <View style={styles.appointmentTime}>
            <Ionicons name="time-outline" size={14} color="#6b7280" />
            <Text style={styles.appointmentTimeText}>{appointment.time}</Text>
          </View>
          <View style={[styles.appointmentPayment, { backgroundColor: `${payment.color}15` }]}>
            <Ionicons name={payment.icon as any} size={14} color={payment.color} />
            <Text style={[styles.appointmentPaymentText, { color: payment.color }]}>
              {payment.text}{appointment.sessionLabel ? ` · ${appointment.sessionLabel}` : ''}
            </Text>
          </View>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
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
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    gap: 12,
  },
  logoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  logoImage: {
    width: 30,
    height: 30,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    fontSize: 14,
    color: '#6b7280',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 2,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  softErrorBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  softErrorText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    fontWeight: '500',
  },
  hardErrorBox: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 24,
    padding: 28,
    borderRadius: 16,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  hardErrorTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  hardErrorMessage: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 18,
    backgroundColor: '#ec4899',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  skeletonBlock: {
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
  },
  planCardSkeleton: {
    borderRadius: HOME_BANNER_BORDER_RADIUS,
    padding: 20,
    backgroundColor: '#f3f4f6',
    aspectRatio: HOME_BANNER_ASPECT_RATIO,
    width: '100%',
    justifyContent: 'center',
  },
  planCardContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  heroSlideFill: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  planCard: {
    borderRadius: HOME_BANNER_BORDER_RADIUS,
    padding: 20,
    aspectRatio: HOME_BANNER_ASPECT_RATIO,
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  planCardEmbedded: {
    aspectRatio: undefined,
    flex: 1,
    height: '100%',
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  planCardNoPlan: {
    justifyContent: 'flex-start',
  },
  /** Overlay de imagem futura: cover dentro do mesmo aspect 2:1. */
  planCardImage: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: HOME_BANNER_BORDER_RADIUS,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 2,
  },
  planNextPayment: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  progressSection: {
    marginTop: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: 'white',
  },
  remainingText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'white',
    marginTop: 8,
  },
  noPlanContent: {
    marginTop: 10,
    gap: 10,
  },
  noPlanText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
  },
  subscribeCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  subscribeCTAText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#be185d',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  seeAllLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ec4899',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: (width - 52) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryCardFill: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    minHeight: 168,
  },
  categoryIconContainer: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryIconCircle: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  categoryIllustration: {
    width: 82,
    height: 82,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  categoryCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
  },
  packageCard: {
    marginTop: 10,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  packageCardFill: {
    padding: 16,
  },
  packageCardName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  packageCardMeta: {
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
    fontWeight: '700',
  },
  appointmentsList: {
    gap: 12,
    marginBottom: 16,
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  appointmentDate: {
    width: 56,
    height: 56,
    backgroundColor: '#fce7f3',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  appointmentDay: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ec4899',
  },
  appointmentMonth: {
    fontSize: 12,
    color: '#ec4899',
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentService: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  appointmentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appointmentTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  appointmentTimeText: {
    fontSize: 13,
    color: '#6b7280',
  },
  appointmentPayment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  appointmentPaymentText: {
    fontSize: 11,
    fontWeight: '600',
  },
  newAppointmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ec4899',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  newAppointmentButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#111827',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  quickActionAnamnesis: {
    backgroundColor: '#db2777',
  },
  quickActionPlan: {
    backgroundColor: '#4f46e5',
  },
  quickActionIcon: {
    marginBottom: 12,
  },
  quickActionTitleLight: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
  },
  quickActionSubtitleLight: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'center',
  },
});
