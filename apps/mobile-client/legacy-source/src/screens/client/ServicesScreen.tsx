import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { getCategoryIllustrations } from '../../assets/brandAssets';
import { useAuth } from '../../contexts/AuthContext';
import { useCommercial } from '../../contexts/CommercialContext';
import { HomePromoCarousel } from '../../components/HomePromoCarousel';
import { mergeVouchers } from '../../lib/api';
import {
  CATEGORY_META,
  getApiErrorMessage,
  isAmountCreditVoucher,
  isVoucherAvailable,
  voucherCreditBalance,
  type Service,
  type ServiceCategory,
  type Subscription,
  type Voucher,
  isActivatedPackage,
} from '../../types/commercial';
import {
  HOME_BANNER_ASPECT_RATIO,
  HOME_BANNER_BORDER_RADIUS,
} from '../../constants/homeBanner';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isServiceInPlan(service: Service, subscription: Subscription | null) {
  if (!subscription) return false;
  const stillActive =
    subscription.status === 'ACTIVE' ||
    (subscription.status === 'CANCELED' && Boolean(subscription.endDate && new Date(subscription.endDate) > new Date()));
  if (!stillActive) return false;
  return subscription.plan.services.some((planService) => planService.id === service.id);
}

function isUsableServiceVoucher(voucher: Voucher) {
  if (!isVoucherAvailable(voucher)) return false;
  if (voucher.type === 'FREE_MONTH') return false;
  return voucher.type === 'FREE_TREATMENT' || voucher.type === 'DISCOUNT';
}

function voucherAppliesToService(voucher: Voucher, service: Service) {
  // DISCOUNT costuma valer na lista inteira (mesmo critério do Booking)
  if (voucher.type === 'DISCOUNT') return true;
  if (voucher.anyService) return true;
  return Boolean(voucher.serviceId && voucher.serviceId === service.id);
}

function priceWithVoucher(service: Service, voucher: Voucher) {
  if (voucher.type === 'FREE_TREATMENT') return 0;
  if (voucher.discountPercent != null && voucher.discountPercent > 0) {
    return Math.max(0, service.price * (1 - voucher.discountPercent / 100));
  }
  const credit = voucherCreditBalance(voucher);
  if (credit > 0) {
    return Math.max(0, service.price - credit);
  }
  return service.price;
}

function voucherBenefitLabel(voucher: Voucher) {
  if (voucher.type === 'FREE_TREATMENT') return 'Tratamento cortesia';
  if (voucher.discountPercent) return `${voucher.discountPercent}% OFF`;
  const credit = voucherCreditBalance(voucher);
  if (credit > 0) return `${formatCurrency(credit)} OFF`;
  if (voucher.discountAmount) return `${formatCurrency(voucher.discountAmount)} OFF`;
  return 'Desconto disponível';
}

export function ServicesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const categoryIllustrations = getCategoryIllustrations(user?.anamnesisForm?.personalData?.sex);
  const { services, subscription, vouchers, packagePurchases, clientBanners, loading, refreshing, error, refresh } = useCommercial();
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
  const [machineFilter, setMachineFilter] = useState<'LASER' | 'CRYO' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [planOnly, setPlanOnly] = useState(false);
  const [appliedVoucherId, setAppliedVoucherId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const usableVouchers = useMemo(
    () => vouchers.filter(isUsableServiceVoucher),
    [vouchers],
  );
  const activeVoucher = usableVouchers.find((voucher) => voucher.id === appliedVoucherId) ?? null;
  const voucherApplied = Boolean(activeVoucher);
  const amountCredits = useMemo(
    () => usableVouchers.filter(isAmountCreditVoucher),
    [usableVouchers],
  );
  const creditsTotal = amountCredits.reduce((sum, voucher) => sum + voucherCreditBalance(voucher), 0);

  const runMergeCredits = useCallback(
    async (voucherIds: string[]) => {
      try {
        const merged = await mergeVouchers(voucherIds);
        await refresh();
        setAppliedVoucherId(merged.id);
      } catch (mergeError) {
        Alert.alert('Não foi possível unificar', getApiErrorMessage(mergeError, 'Tente de novo em instantes.'));
      }
    },
    [refresh],
  );

  const confirmMergeCredits = useCallback(
    (voucherIds: string[], onSkip?: () => void) => {
      const selected = voucherIds
        .map((id) => usableVouchers.find((voucher) => voucher.id === id))
        .filter((voucher): voucher is Voucher => Boolean(voucher));
      const total = selected.reduce((sum, voucher) => sum + voucherCreditBalance(voucher), 0);
      const breakdown = selected.map((voucher) => formatCurrency(voucherCreditBalance(voucher))).join(' + ');
      Alert.alert(
        'Unificar créditos?',
        `${breakdown} = ${formatCurrency(total)}. Você passa a ter um único crédito com esse valor.`,
        [
          { text: 'Agora não', style: 'cancel', onPress: onSkip },
          { text: 'Unificar', onPress: () => { void runMergeCredits(voucherIds); } },
        ],
      );
    },
    [runMergeCredits, usableVouchers],
  );

  const onToggleVoucher = useCallback(
    (voucher: Voucher) => {
      if (appliedVoucherId === voucher.id) {
        setAppliedVoucherId(null);
        return;
      }
      const current = usableVouchers.find((item) => item.id === appliedVoucherId);
      if (current && isAmountCreditVoucher(current) && isAmountCreditVoucher(voucher)) {
        confirmMergeCredits([current.id, voucher.id], () => setAppliedVoucherId(voucher.id));
        return;
      }
      setAppliedVoucherId(voucher.id);
    },
    [appliedVoucherId, confirmMergeCredits, usableVouchers],
  );

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setPlanOnly(false);
      const category = route.params?.category;
      const machine = route.params?.machine;
      const applyVoucherId = route.params?.applyVoucherId;
      if (machine === 'LASER' || machine === 'CRYO') {
        setMachineFilter(machine);
        setSelectedCategory(null);
      } else {
        setMachineFilter(null);
        if (category && category in CATEGORY_META) {
          setSelectedCategory(category as ServiceCategory);
        } else if (category === 'ALL') {
          setSelectedCategory(null);
        }
      }
      if (applyVoucherId) {
        setAppliedVoucherId(applyVoucherId);
        navigation.setParams({ applyVoucherId: undefined });
      }
      scrollToTop();
      const unsubscribe = navigation.addListener('tabPress', scrollToTop);
      return unsubscribe;
    }, [navigation, route.params?.applyVoucherId, route.params?.category, route.params?.machine, scrollToTop]),
  );

  const categories = (Object.keys(CATEGORY_META) as ServiceCategory[])
    .filter((category) => services.some((service) => service.category === category))
    .map((category) => ({ id: category, ...CATEGORY_META[category] }));

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.trim().length > 0) {
      setSelectedCategory(null);
      setMachineFilter(null);
    }
  }, []);

  const filteredServices = services.filter((service) => {
    if (planOnly && !isServiceInPlan(service, subscription)) return false;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      `${service.name} ${service.description} ${CATEGORY_META[service.category].label}`
        .toLowerCase()
        .includes(query);
    if (query) return matchesSearch;
    if (machineFilter) return service.machineKind === machineFilter;
    const matchesCategory = !selectedCategory || service.category === selectedCategory;
    return matchesCategory;
  });

  const bookService = (service: Service) => {
    const active = packagePurchases.find(
      (item) =>
        item.packageServiceId === service.id &&
        isActivatedPackage(item) &&
        item.remainingSessions > 0,
    );
    if (active) {
      navigation.navigate('PackageTimeline', { purchaseId: active.id });
      return;
    }
    navigation.navigate('Booking', {
      serviceId: service.id,
      ...(voucherApplied && activeVoucher
        ? { applyVoucherId: activeVoucher.id }
        : {}),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Serviços</Text>
        <Text style={styles.headerSubtitle}>
          {machineFilter === 'LASER'
            ? 'Depilação a Laser disponível'
            : machineFilter === 'CRYO'
              ? 'Criolipólise disponível'
              : 'Escolha seu tratamento'}
        </Text>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar serviços…"
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#ec4899" />}
      >
        <View style={styles.categoriesWrap}>
          <TouchableOpacity
            style={[styles.categoryChip, planOnly && styles.categoryChipActive]}
            onPress={() => setPlanOnly((current) => !current)}
          >
            <Ionicons
              name={planOnly ? 'ribbon' : 'ribbon-outline'}
              size={13}
              color={planOnly ? 'white' : '#6b7280'}
              style={styles.categoryIcon}
            />
            <Text style={[styles.categoryChipText, planOnly && styles.categoryChipTextActive]}>
              Apenas do plano
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.categoryChip, !selectedCategory && !machineFilter && styles.categoryChipActive]}
            onPress={() => {
              setSelectedCategory(null);
              setMachineFilter(null);
            }}
          >
            <Text style={[styles.categoryChipText, !selectedCategory && !machineFilter && styles.categoryChipTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>

          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryChip,
                selectedCategory === category.id && !machineFilter && styles.categoryChipActive,
              ]}
              onPress={() => {
                setMachineFilter(null);
                setSelectedCategory(category.id);
              }}
            >
              <MaterialCommunityIcons
                name={category.icon as any}
                size={13}
                color={selectedCategory === category.id && !machineFilter ? 'white' : '#6b7280'}
                style={styles.categoryIcon}
              />
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === category.id && !machineFilter && styles.categoryChipTextActive,
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {clientBanners.length > 0 ? (
          <View style={styles.promoCarouselWrap}>
            <HomePromoCarousel
              banners={clientBanners}
              onBannerPress={(banner) => {
                if (banner.machineKind === 'LASER' || banner.machineKind === 'CRYO') {
                  setMachineFilter(banner.machineKind);
                  setSelectedCategory(null);
                  setSearchQuery('');
                  return;
                }
                if (banner.linkPath?.includes('machine=LASER')) {
                  setMachineFilter('LASER');
                  setSelectedCategory(null);
                  setSearchQuery('');
                } else if (banner.linkPath?.includes('machine=CRYO')) {
                  setMachineFilter('CRYO');
                  setSelectedCategory(null);
                  setSearchQuery('');
                }
              }}
            />
          </View>
        ) : null}

        {amountCredits.length >= 2 ? (
          <TouchableOpacity
            style={styles.mergeCreditsButton}
            onPress={() => confirmMergeCredits(amountCredits.map((voucher) => voucher.id))}
            activeOpacity={0.85}
          >
            <Ionicons name="layers-outline" size={18} color="#be185d" />
            <Text style={styles.mergeCreditsText}>
              Unificar créditos · {formatCurrency(creditsTotal)}
            </Text>
          </TouchableOpacity>
        ) : null}

        {usableVouchers.map((voucher) => (
          <VoucherPromoBanner
            key={voucher.id}
            voucher={voucher}
            applied={appliedVoucherId === voucher.id}
            onToggle={() => onToggleVoucher(voucher)}
          />
        ))}

        <View style={styles.servicesList}>
          {loading ? (
            <ActivityIndicator size="large" color="#ec4899" style={styles.loader} />
          ) : error && services.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={58} color="#d1d5db" />
              <Text style={styles.emptyStateTitle}>Não foi possível carregar</Text>
              <Text style={styles.emptyStateText}>{error}</Text>
              <TouchableOpacity style={[styles.bookButton, { marginTop: 18 }]} onPress={refresh}>
                <Text style={styles.bookButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : filteredServices.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyStateTitle}>Nenhum serviço encontrado</Text>
              <Text style={styles.emptyStateText}>Tente outro termo ou categoria</Text>
            </View>
          ) : (
            filteredServices.map((service) => {
              const applies =
                voucherApplied && activeVoucher
                  ? voucherAppliesToService(activeVoucher, service)
                  : false;
              const discounted =
                applies && activeVoucher ? priceWithVoucher(service, activeVoucher) : null;

              return (
                <ServiceCard
                  key={service.id}
                  service={service}
                  includedInPlan={isServiceInPlan(service, subscription)}
                  discountActive={applies}
                  discountedPrice={discounted}
                  categoryIllustration={categoryIllustrations[service.category]}
                  onBook={() => bookService(service)}
                />
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function VoucherPromoBanner({
  voucher,
  applied,
  onToggle,
}: {
  voucher: Voucher;
  applied: boolean;
  onToggle: () => void;
}) {
  const benefit = voucherBenefitLabel(voucher);
  const scope = voucher.anyService
    ? 'Válido em tratamentos avulsos elegíveis'
    : 'Válido no tratamento indicado pela clínica';

  return (
    <View style={styles.voucherBannerWrap}>
      <LinearGradient
        colors={applied ? ['#059669', '#047857'] : ['#ec4899', '#db2777', '#a21caf']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.voucherBanner}
      >
        <View style={styles.voucherBannerTop}>
          <View style={styles.voucherPill}>
            <Ionicons name="ticket-outline" size={14} color="#be185d" />
            <Text style={styles.voucherPillText}>Voucher disponível</Text>
          </View>
          <Text style={styles.voucherBenefit}>{benefit}</Text>
        </View>
        <Text style={styles.voucherTitle} numberOfLines={2}>
          {voucher.description || 'Você tem um benefício para usar'}
        </Text>
        <Text style={styles.voucherScope}>{scope}</Text>
        <TouchableOpacity
          style={[styles.voucherCta, applied && styles.voucherCtaApplied]}
          onPress={onToggle}
          activeOpacity={0.9}
        >
          <Text style={[styles.voucherCtaText, applied && styles.voucherCtaTextApplied]}>
            {applied ? 'Voucher aplicado — toque para remover' : 'Usar voucher nos preços'}
          </Text>
          <Ionicons
            name={applied ? 'checkmark-circle' : 'arrow-forward'}
            size={18}
            color={applied ? '#047857' : '#be185d'}
          />
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

function ServiceCard({
  service,
  includedInPlan,
  discountActive,
  discountedPrice,
  categoryIllustration,
  onBook,
}: {
  service: Service;
  includedInPlan: boolean;
  discountActive: boolean;
  discountedPrice: number | null;
  categoryIllustration: any;
  onBook: () => void;
}) {
  const meta = CATEGORY_META[service.category];
  const showDiscount =
    discountActive && discountedPrice !== null && discountedPrice < service.price;

  return (
    <TouchableOpacity
      style={[styles.serviceCard, showDiscount && styles.serviceCardDiscount]}
      onPress={onBook}
    >
      <View style={styles.serviceHeader}>
        <View style={[styles.serviceIconContainer, { backgroundColor: `${meta.color}18` }]}>
          <Image
            source={categoryIllustration}
            style={styles.serviceCategoryIcon}
            resizeMode="contain"
          />
        </View>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName}>{service.name}</Text>
          <Text style={[styles.serviceCategory, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {includedInPlan ? (
          <View style={styles.planBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#be185d" />
            <Text style={styles.planBadgeText}>No plano</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.serviceDescription} numberOfLines={2}>
        {service.description}
      </Text>

      <View style={styles.serviceFooter}>
        <View style={styles.serviceDetails}>
          <View style={styles.serviceDetail}>
            <Ionicons name="time-outline" size={16} color="#6b7280" />
            <Text style={styles.serviceDetailText}>{service.duration} min</Text>
          </View>
          <View style={styles.priceBlock}>
            {showDiscount ? (
              <>
                <Text style={styles.priceStruck}>{formatCurrency(service.price)}</Text>
                <Text style={styles.priceDiscount}>
                  {discountedPrice === 0 ? 'Grátis' : formatCurrency(discountedPrice!)}
                </Text>
              </>
            ) : (
              <View style={styles.serviceDetail}>
                <Ionicons name="cash-outline" size={16} color="#6b7280" />
                <Text style={styles.serviceDetailText}>{formatCurrency(service.price)}</Text>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.bookButton} onPress={onBook}>
          <Text style={styles.bookButtonText}>Agendar</Text>
          <Ionicons name="arrow-forward" size={16} color="white" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6b7280',
  },
  searchBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 0,
  },
  content: {
    flex: 1,
  },
  categoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 8,
  },
  promoCarouselWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryChipActive: {
    backgroundColor: '#ec4899',
    shadowColor: '#ec4899',
    shadowOpacity: 0.28,
  },
  categoryIcon: {
    marginRight: 5,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  categoryChipTextActive: {
    color: 'white',
  },
  voucherBannerWrap: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  mergeCreditsButton: {
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fdf2f8',
    borderWidth: 1,
    borderColor: '#f9a8d4',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  mergeCreditsText: {
    color: '#be185d',
    fontWeight: '700',
    fontSize: 14,
  },
  voucherBanner: {
    width: '100%',
    aspectRatio: HOME_BANNER_ASPECT_RATIO,
    borderRadius: HOME_BANNER_BORDER_RADIUS,
    padding: 18,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  voucherBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  voucherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  voucherPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#be185d',
  },
  voucherBenefit: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  },
  voucherTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    marginTop: 8,
  },
  voucherScope: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  voucherCta: {
    marginTop: 10,
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  voucherCtaApplied: {
    backgroundColor: '#ecfdf5',
  },
  voucherCtaText: {
    color: '#be185d',
    fontWeight: '800',
    fontSize: 14,
  },
  voucherCtaTextApplied: {
    color: '#047857',
  },
  servicesList: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  loader: {
    marginTop: 48,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },
  serviceCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  serviceCardDiscount: {
    borderColor: '#6ee7b7',
    backgroundColor: '#f0fdf4',
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  serviceCategoryIcon: {
    width: 36,
    height: 36,
  },
  serviceInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  serviceName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  serviceCategory: {
    fontSize: 13,
    color: '#6b7280',
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fce7f3',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f9a8d4',
  },
  planBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#be185d',
  },
  serviceDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  serviceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceDetails: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    flexShrink: 1,
  },
  serviceDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  serviceDetailText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  priceBlock: {
    gap: 2,
  },
  priceStruck: {
    fontSize: 12,
    color: '#9ca3af',
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  priceDiscount: {
    fontSize: 16,
    color: '#059669',
    fontWeight: '900',
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ec4899',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
});
