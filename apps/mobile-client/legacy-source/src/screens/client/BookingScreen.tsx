import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ClientStackParamList } from '../../navigation/ClientNavigator';
import { getCategoryIllustrations } from '../../assets/brandAssets';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useCommercial } from '../../contexts/CommercialContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  createAppointment,
  createPackagePurchase,
  getAvailableDays,
  getAvailableSlots,
  getDayMarkers,
  rescheduleAppointment,
  schedulePackageSessions,
  type DayMarker,
} from '../../lib/api';
import {
  CATEGORY_META,
  getApiErrorMessage,
  isActivatedPackage,
  isPackageService,
  packageItemsOf,
  voucherCreditBalance,
  isVoucherAvailable,
  type AppointmentOrigin,
  type PackagePurchase,
  type Plan,
  type Subscription,
} from '../../types/commercial';

type Props = NativeStackScreenProps<ClientStackParamList, 'Booking'>;
type Step = 'details' | 'date' | 'time' | 'review';
type BookableOrigin = Extract<AppointmentOrigin, 'SUBSCRIPTION' | 'SINGLE' | 'VOUCHER'>;

const TIER_ORDER: Record<Plan['tier'], number> = { BRONZE: 0, SILVER: 1, GOLD: 2 };

const SHIFT_META = [
  { id: 'morning' as const, label: 'Manhã', icon: 'sunny-outline' as const, match: (h: number) => h < 12 },
  { id: 'afternoon' as const, label: 'Tarde', icon: 'partly-sunny-outline' as const, match: (h: number) => h >= 12 && h < 18 },
  { id: 'evening' as const, label: 'Noite', icon: 'moon-outline' as const, match: (h: number) => h >= 18 },
];

export function BookingScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const categoryIllustrations = getCategoryIllustrations(user?.anamnesisForm?.personalData?.sex);
  const { services, plans, subscription, vouchers, packagePurchases, appointments, refresh } = useCommercial();
  const service = services.find((item) => item.id === route.params.serviceId);
  const isRescheduling = Boolean(route.params.appointmentId);
  const isPackage = Boolean(service && isPackageService(service));
  const activePurchase = packagePurchases.find(
    (item) =>
      item.packageServiceId === service?.id &&
      isActivatedPackage(item) &&
      item.remainingSessions > 0,
  ) as PackagePurchase | undefined;
  const requestedPurchase = route.params.packagePurchaseId
    ? packagePurchases.find((item) => item.id === route.params.packagePurchaseId)
    : undefined;
  const schedulingPurchaseId =
    requestedPurchase && isActivatedPackage(requestedPurchase)
      ? requestedPurchase.id
      : activePurchase?.id;
  const isSchedulingPaidSession = Boolean(
    isPackage &&
    !isRescheduling &&
    schedulingPurchaseId,
  );
  const rescheduleRecord = appointments.find((item) => item.id === route.params.appointmentId);
  const isPackageSessionReview = Boolean(
    isSchedulingPaidSession ||
    (isRescheduling && (rescheduleRecord?.origin === 'PACKAGE' || rescheduleRecord?.packagePurchaseId)),
  );
  const [step, setStep] = useState<Step>(isRescheduling || route.params.packagePurchaseId ? 'date' : 'details');
  const [draftSlots, setDraftSlots] = useState<Array<{ date: string; time: string }>>([]);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [slotsReason, setSlotsReason] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingOrigin, setBookingOrigin] = useState<BookableOrigin>('SINGLE');
  const [originInitialized, setOriginInitialized] = useState(false);
  const [dayMarkers, setDayMarkers] = useState<string[]>([]);
  const [loadingDays, setLoadingDays] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const preferredVoucherId = route.params.applyVoucherId;

  const matchingVoucher = useMemo(() => {
    const usable = vouchers.filter((voucher) => {
      if (voucher.type === 'FREE_MONTH') return false;
      if (!isVoucherAvailable(voucher)) return false;
      return voucher.type === 'DISCOUNT' || voucher.type === 'FREE_TREATMENT';
    });
    if (preferredVoucherId) {
      const preferred = usable.find((voucher) => voucher.id === preferredVoucherId);
      if (
        preferred &&
        (preferred.anyService || preferred.serviceId === service?.id || preferred.type === 'DISCOUNT')
      ) {
        return preferred;
      }
    }
    return usable.find((voucher) => {
      return voucher.anyService || voucher.serviceId === service?.id || voucher.type === 'DISCOUNT';
    });
  }, [preferredVoucherId, service?.id, vouchers]);

  const cancelInProgress = Boolean(
    subscription?.cancelInProgress ||
      (subscription?.status === 'CANCELED' &&
        subscription.endDate &&
        new Date(subscription.endDate) > new Date()),
  );
  const serviceInUserPlan = Boolean(
    (subscription?.status === 'ACTIVE' || cancelInProgress) &&
    service?.allowOnSubscription !== false &&
    !service?.machineKind &&
    Boolean(subscription?.plan.services.some((item) => item.id === service?.id)),
  );
  // machineKind services default to avulso unless allowOnSubscription
  const machineBlocksPlan = Boolean(service?.machineKind && service.allowOnSubscription === false);
  const remainingSessions = subscription?.remaining.thisMonth ?? 0;
  const canUsePlan = serviceInUserPlan && !machineBlocksPlan;

  const startingPlan = useMemo(() => {
    if (!service) return null;
    const candidates = plans
      .filter((plan) => plan.isActive && plan.services.some((item) => item.id === service.id))
      .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.price - b.price);
    return candidates[0] ?? null;
  }, [plans, service]);

  const voucherPrice = useMemo(() => {
    if (!service || !matchingVoucher) return null;
    if (matchingVoucher.type === 'FREE_TREATMENT') return 0;
    if (matchingVoucher.discountPercent) {
      return Math.max(0, service.price * (1 - matchingVoucher.discountPercent / 100));
    }
    const credit = voucherCreditBalance(matchingVoucher);
    if (credit > 0) {
      return Math.max(0, service.price - credit);
    }
    return service.price;
  }, [matchingVoucher, service]);

  const finalPrice = useMemo(() => {
    if (!service) return 0;
    if (bookingOrigin === 'SUBSCRIPTION') return 0;
    if (bookingOrigin === 'VOUCHER' && voucherPrice !== null) return voucherPrice;
    return service.price;
  }, [bookingOrigin, service, voucherPrice]);

  useEffect(() => {
    if (originInitialized || !service) return;
    if (isSchedulingPaidSession) setBookingOrigin('SINGLE');
    else if (preferredVoucherId && matchingVoucher) setBookingOrigin('VOUCHER');
    else if (matchingVoucher) setBookingOrigin('VOUCHER');
    else if (canUsePlan && !isPackage) setBookingOrigin('SUBSCRIPTION');
    else setBookingOrigin('SINGLE');
    setOriginInitialized(true);
  }, [canUsePlan, isPackage, isSchedulingPaidSession, matchingVoucher, originInitialized, preferredVoucherId, service]);

  useEffect(() => {
    if (!date || !service) return;
    setLoadingSlots(true);
    setError(null);
    setTime('');
    setSlotsReason(null);
    getAvailableSlots(date, service.id)
      .then((result) => {
        const futureSlots = filterFutureSlots(date, result.slots || []);
        const futureBooked = filterFutureSlots(date, result.bookedSlots || []);
        setSlots(futureSlots);
        setBookedSlots(futureBooked);
        if (result.reason) {
          setSlotsReason(result.reason);
        } else if (futureSlots.length === 0 && futureBooked.length === 0 && date === localDateKey(new Date())) {
          setSlotsReason('Não há mais horários disponíveis para hoje');
        }
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError, 'Erro ao buscar horários')))
      .finally(() => setLoadingSlots(false));
  }, [date, service]);

  const minDate = localDateKey(new Date());
  const defaultMax = service?.machineKind ? lastDayOfNextMonth() : addDays(minDate, 29);
  const planUntil =
    cancelInProgress && subscription?.endDate
      ? localDateKey(new Date(subscription.endDate))
      : null;
  const maxDate = planUntil && planUntil < defaultMax ? planUntil : defaultMax;

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    setLoadingDays(true);
    void (async () => {
      try {
        const res = await getAvailableDays(minDate, maxDate, service.id);
        if (!cancelled) setDayMarkers((res.days || []).map((day) => day.date));
      } catch {
        try {
          const res = await getDayMarkers(minDate, maxDate);
          const machineKind = service.machineKind || null;
          if (!cancelled) {
            setDayMarkers(
              (res.days || [])
                .filter((marker) => isBookableDay(marker, machineKind))
                .map((marker) => marker.date),
            );
          }
        } catch (requestError) {
          if (!cancelled) {
            setDayMarkers([]);
            setError(getApiErrorMessage(requestError, 'Erro ao buscar dias disponíveis'));
          }
        }
      } finally {
        if (!cancelled) setLoadingDays(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [minDate, maxDate, service?.id, service?.machineKind]);

  const daysByMonth = useMemo(() => groupDaysByMonth(dayMarkers), [dayMarkers]);
  const remainingForSelectedDate = remainingForMonth(subscription, date);
  const planMonthFull = Boolean(
    date && bookingOrigin === 'SUBSCRIPTION' && remainingForSelectedDate <= 0,
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, 0);
    return () => clearTimeout(handle);
  }, [step]);

  useEffect(() => {
    if (step !== 'date' || !date) return;
    const handle = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(handle);
  }, [date, step, planMonthFull]);

  const selectDay = (ymd: string) => {
    if (date === ymd) {
      setDate('');
      setTime('');
      return;
    }
    setDate(ymd);
    setTime('');
  };

  if (!service) {
    return <CenteredMessage title="Serviço indisponível" action={() => navigation.goBack()} />;
  }

  const allSlots = Array.from(new Set([...slots, ...bookedSlots])).sort();
  const availableCount = slots.length;
  const shifts = SHIFT_META.map((shift) => ({
    ...shift,
    slots: allSlots.filter((slot) => shift.match(hourFromSlot(slot))),
  })).filter((shift) => shift.slots.length > 0);

  const canProceedFromDetails =
    bookingOrigin === 'SINGLE' ||
    (bookingOrigin === 'VOUCHER' && Boolean(matchingVoucher)) ||
    (bookingOrigin === 'SUBSCRIPTION' && canUsePlan);

  const sessionCount =
    rescheduleRecord?.packagePurchase?.sessionCount ||
    activePurchase?.sessionCount ||
    service.packageSessionCount ||
    1;
  const scheduledAppointments = (activePurchase?.appointments ?? []).filter(
    (item) => item.status !== 'CANCELED' && item.packageSessionIndex != null,
  );
  const usedSessionIndexes = new Set(
    scheduledAppointments.map((item) => item.packageSessionIndex as number),
  );
  const slotCount = Math.max(1, draftSlots.length + (date && time ? 1 : 0));
  const nextIndexes: number[] = [];
  for (let i = 1; i <= sessionCount && nextIndexes.length < slotCount; i++) {
    if (!usedSessionIndexes.has(i)) nextIndexes.push(i);
  }
  const sessionStartIndex =
    rescheduleRecord?.packageSessionIndex ||
    (scheduledAppointments.length > 0 ? nextIndexes[0] : undefined) ||
    (activePurchase ? activePurchase.sessionsScheduled + 1 : 1);
  const sessionEndIndex = isRescheduling
    ? sessionStartIndex
    : scheduledAppointments.length > 0
      ? nextIndexes[nextIndexes.length - 1] || sessionStartIndex
      : sessionStartIndex + slotCount - 1;
  const sessionBadge =
    isPackageSessionReview && sessionCount
      ? sessionEndIndex > sessionStartIndex
        ? `Sessão ${sessionStartIndex}–${sessionEndIndex}/${sessionCount}`
        : `Sessão ${sessionStartIndex}/${sessionCount}`
      : undefined;

  const summaryValue =
    bookingOrigin === 'SUBSCRIPTION'
      ? 'Incluso'
      : finalPrice === 0
        ? 'Grátis'
        : currency(finalPrice);

  const submit = async () => {
    if (!user || !date || !time) return;
    setSubmitting(true);
    setError(null);
    const startTime = `${date}T${time}:00.000Z`;
    try {
      if (route.params.appointmentId) {
        await rescheduleAppointment(route.params.appointmentId, startTime);
        await refresh();
        Alert.alert('Horário alterado', 'Seu agendamento voltou para confirmação da clínica.', [
          { text: 'Ver agenda', onPress: () => navigation.navigate('ClientTabs', { screen: 'Agenda' }) },
        ]);
        return;
      }

      if (isPackage) {
        const purchaseId = schedulingPurchaseId;
        const selected = [...draftSlots];
        if (!selected.some((slot) => slot.date === date && slot.time === time)) {
          selected.push({ date, time });
        }
        const isoSlots = selected.map((slot) => `${slot.date}T${slot.time}:00.000Z`);

        if (purchaseId && (activePurchase?.remainingSessions || route.params.packagePurchaseId)) {
          const updated = await schedulePackageSessions(purchaseId, isoSlots);
          await refresh();
          Alert.alert('Sessão agendada', 'A clínica confirmará seu horário em breve.', [
            {
              text: 'Ver pacote',
              onPress: () => navigation.navigate('PackageTimeline', { purchaseId: updated.id }),
            },
          ]);
          return;
        }

        const purchase = await createPackagePurchase({
          userId: user.id,
          serviceId: service.id,
          slots: isoSlots,
          voucherId: bookingOrigin === 'VOUCHER' ? matchingVoucher?.id : undefined,
        });
        if (bookingOrigin === 'VOUCHER' && finalPrice === 0) {
          await refresh();
          Alert.alert('Pacote confirmado', 'Voucher aplicado. A clínica confirmará seus horários em breve.', [
            { text: 'Ver agenda', onPress: () => navigation.navigate('ClientTabs', { screen: 'Agenda' }) },
            {
              text: 'Ver pacote',
              onPress: () => navigation.navigate('PackageTimeline', { purchaseId: purchase.id }),
            },
          ]);
          return;
        }
        navigation.navigate('Checkout', {
          serviceId: service.id,
          appointmentId: purchase.appointments?.[0]?.id,
          packagePurchaseId: purchase.id,
          amount: finalPrice,
          customDescription: finalPrice < service.price ? 'Voucher aplicado no app' : undefined,
          description: `Pacote ${service.name}`,
        });
        return;
      }

      const appointment = await createAppointment({
        userId: user.id,
        serviceId: service.id,
        startTime,
        origin: bookingOrigin,
        voucherId: bookingOrigin === 'VOUCHER' ? matchingVoucher?.id : undefined,
        paymentAmount: bookingOrigin === 'SINGLE' ? finalPrice : undefined,
        notes: '',
      });

      if (bookingOrigin === 'SINGLE' || (bookingOrigin === 'VOUCHER' && finalPrice > 0)) {
        navigation.navigate('Checkout', {
          serviceId: service.id,
          appointmentId: appointment.id,
          amount: finalPrice,
          customDescription: finalPrice < service.price ? 'Voucher aplicado no app' : undefined,
          description: service.name,
        });
        return;
      }

      await refresh();
      Alert.alert('Agendamento solicitado', 'A clínica confirmará seu horário em breve.', [
        { text: 'Ver agenda', onPress: () => navigation.navigate('ClientTabs', { screen: 'Agenda' }) },
      ]);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Não foi possível agendar');
      if (message.toLowerCase().includes('anamnese')) {
        navigation.navigate('AnamnesisBridge', { serviceId: service.id });
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader style={{ borderBottomWidth: 0, paddingHorizontal: 16, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => (step === 'details' || isRescheduling ? navigation.goBack() : setStep(previousStep(step)))}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{isRescheduling ? 'Reagendar' : 'Agendar horário'}</Text>
          <Text style={styles.headerStep}>{stepLabel(step)}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="close" size={24} color="#111827" />
        </TouchableOpacity>
      </ScreenHeader>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${progress(step)}%` }]} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {step === 'details' && (
          <>
            <View style={[styles.heroIcon, { backgroundColor: `${CATEGORY_META[service.category].color}22` }]}>
              <Image
                source={categoryIllustrations[service.category]}
                style={styles.heroCategoryIcon}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={[styles.category, { color: CATEGORY_META[service.category].color }]}>
              {CATEGORY_META[service.category].label}
            </Text>
            <Text style={styles.description}>{service.description}</Text>

            {isPackage ? (
              <View style={styles.packageItems}>
                {(packageItemsOf(service).length ? packageItemsOf(service) : []).map((item) => (
                  <View key={item.name} style={styles.packageItemRow}>
                    <Ionicons name="flower-outline" size={16} color={CATEGORY_META.COMBO.color} />
                    <Text style={styles.packageItemName}>{item.name}</Text>
                    <Text style={styles.packageItemDuration}>{item.durationMinutes} min</Text>
                  </View>
                ))}
                <Text style={styles.packageMeta}>
                  {String(service.packageSessionCount || 1).padStart(2, '0')} sessões · {service.duration} min por visita
                </Text>
              </View>
            ) : null}

            <View style={styles.summaryRow}>
              <Summary icon="time-outline" label="Duração" value={`${service.duration} min`} accent="#0ea5e9" />
              <Summary
                icon="cash-outline"
                label="Valor"
                value={summaryValue}
                accent={bookingOrigin === 'SUBSCRIPTION' || finalPrice === 0 ? '#10b981' : '#ec4899'}
              />
            </View>

            {isPackage && activePurchase && activePurchase.remainingSessions > 0 ? (
              <PrimaryButton
                title={`Continuar pacote · ${activePurchase.sessionCount - activePurchase.remainingSessions}/${activePurchase.sessionCount}`}
                onPress={() => navigation.navigate('PackageTimeline', { purchaseId: activePurchase.id })}
              />
            ) : (
              <>
            {(serviceInUserPlan || startingPlan) && !isPackage ? (
              <View style={styles.planInfoCard}>
                {serviceInUserPlan ? (
                  <View style={styles.planBadgeRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#be185d" />
                    <Text style={styles.planBadgeText}>Incluso no seu plano</Text>
                  </View>
                ) : null}
                {serviceInUserPlan ? (
                  <Text style={styles.planSessionsText}>
                    {remainingSessions} {remainingSessions === 1 ? 'sessão disponível' : 'sessões disponíveis'} este
                    mês · a sessão conta no mês da data
                  </Text>
                ) : null}
                {startingPlan ? (
                  <View style={[styles.startingPlanRow, serviceInUserPlan && { marginTop: 10 }]}>
                    <Ionicons name="diamond-outline" size={16} color="#ec4899" />
                    <Text style={styles.startingPlanText}>
                      {serviceInUserPlan && subscription?.planId === startingPlan.id
                        ? `Coberto pelo plano ${startingPlan.name}`
                        : `Disponível a partir do plano ${startingPlan.name}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {isPackage && !isSchedulingPaidSession ? (
              <>
                <Text style={styles.paymentSectionTitle}>Forma de pagamento</Text>
                {matchingVoucher ? (
                  <PaymentOption
                    selected={bookingOrigin === 'VOUCHER'}
                    icon="gift-outline"
                    title={voucherPrice === 0 ? 'Usar Voucher — Grátis' : 'Usar Voucher'}
                    subtitle={
                      voucherPrice === 0
                        ? 'Pacote totalmente gratuito'
                        : `${currency(voucherPrice!)} · de ${currency(service.price)}`
                    }
                    accent="#10b981"
                    onPress={() => setBookingOrigin('VOUCHER')}
                  />
                ) : null}
                <PaymentOption
                  selected={bookingOrigin === 'SINGLE'}
                  icon="gift-outline"
                  title="Pacote à vista"
                  subtitle={`${currency(service.price)} · ${service.packageSessionCount || 1} sessões`}
                  accent="#ec4899"
                  onPress={() => setBookingOrigin('SINGLE')}
                />
              </>
            ) : !isPackage ? (
              <>
            <Text style={styles.paymentSectionTitle}>Forma de pagamento</Text>

            {serviceInUserPlan ? (
              <PaymentOption
                selected={bookingOrigin === 'SUBSCRIPTION'}
                disabled={!canUsePlan}
                icon="ribbon-outline"
                title="Usar Plano"
                subtitle={
                  canUsePlan
                    ? 'A sessão conta no mês da data escolhida'
                    : 'Este tratamento não pode ser agendado pelo plano'
                }
                accent="#8b5cf6"
                onPress={() => canUsePlan && setBookingOrigin('SUBSCRIPTION')}
              />
            ) : null}

            {matchingVoucher ? (
              <PaymentOption
                selected={bookingOrigin === 'VOUCHER'}
                icon="gift-outline"
                title={voucherPrice === 0 ? 'Usar Voucher — Grátis' : 'Usar Voucher'}
                subtitle={
                  voucherPrice === 0
                    ? 'Tratamento totalmente gratuito'
                    : `${currency(voucherPrice!)} · de ${currency(service.price)}`
                }
                accent="#10b981"
                onPress={() => setBookingOrigin('VOUCHER')}
              />
            ) : null}

            <PaymentOption
              selected={bookingOrigin === 'SINGLE'}
              icon="card-outline"
              title="Pagamento avulso"
              subtitle={
                serviceInUserPlan && canUsePlan
                  ? `${currency(service.price)} · Não consome sessão do plano`
                  : currency(service.price)
              }
              accent="#ec4899"
              onPress={() => setBookingOrigin('SINGLE')}
            />
              </>
            ) : null}

            <PrimaryButton
              title={isPackage ? 'Escolher primeira sessão' : 'Escolher data'}
              onPress={() => setStep('date')}
              disabled={!canProceedFromDetails}
            />
              </>
            )}
          </>
        )}

        {step === 'date' && (
          <>
            <Text style={styles.sectionTitle}>Escolha o melhor dia</Text>

            {loadingDays ? (
              <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 48 }} />
            ) : daysByMonth.length === 0 ? (
              <View style={styles.emptySlotsBox}>
                <Ionicons name="calendar-outline" size={42} color="#d1d5db" />
                <Text style={styles.emptySlotsTitle}>Nenhum dia disponível</Text>
                <Text style={styles.emptySlotsHint}>
                  {service.machineKind
                    ? 'Este tratamento só pode ser agendado no dia liberado da máquina.'
                    : 'Não há dias com horário nesta janela. Tente novamente mais tarde.'}
                </Text>
              </View>
            ) : (
              <>
                {service.machineKind ? (
                  <Text style={styles.machineHint}>
                    Este tratamento só pode ser agendado no dia liberado da máquina.
                  </Text>
                ) : null}

                {daysByMonth.map((group) => (
                  <View key={group.key} style={styles.shiftBlock}>
                    <View style={styles.shiftHeader}>
                      <View style={styles.shiftIconWrap}>
                        <Ionicons name="calendar-outline" size={16} color="#ec4899" />
                      </View>
                      <Text style={styles.shiftLabel}>{group.title}</Text>
                      <View style={styles.shiftLine} />
                    </View>
                    <View style={styles.slots}>
                      {group.days.map((day) => {
                        const selected = date === day;
                        const isToday = day === minDate;
                        return (
                          <TouchableOpacity
                            key={day}
                            onPress={() => selectDay(day)}
                            activeOpacity={0.85}
                            style={[styles.slot, styles.dayChip, selected && styles.slotSelected]}
                          >
                            <Text
                              style={[
                                isToday ? styles.dayChipTodayLabel : styles.dayChipNumber,
                                selected && styles.slotTextSelected,
                              ]}
                            >
                              {isToday ? 'Hoje' : dayNumber(day)}
                            </Text>
                            <Text style={[styles.dayChipWeekday, selected && styles.dayChipWeekdaySelected]}>
                              {weekdayShort(day)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </>
            )}

            {date ? (
              <View style={styles.dateConfirmBlock}>
                {planMonthFull ? (
                  <View style={styles.onlyBookedBanner}>
                    <Ionicons name="information-circle-outline" size={18} color="#be185d" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.onlyBookedText}>
                        Sem sessões em {monthTitle(date)} — pague avulso ou escolha outro dia.
                      </Text>
                      <TouchableOpacity
                        onPress={() => setBookingOrigin('SINGLE')}
                        style={styles.emptySlotsButton}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.emptySlotsButtonText}>Pagar avulso neste dia</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.dateConfirmLabel}>{formatConfirmDate(date)}</Text>
                )}
                <PrimaryButton
                  title="Ver horários"
                  onPress={() => setStep('time')}
                  disabled={planMonthFull}
                />
              </View>
            ) : null}
          </>
        )}

        {step === 'time' && (
          <>
            <Text style={styles.sectionTitle}>Horários · {formatSlotDate(date)}</Text>

            {loadingSlots ? (
              <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 48 }} />
            ) : allSlots.length === 0 ? (
              <View style={styles.emptySlotsBox}>
                <Ionicons name="time-outline" size={42} color="#d1d5db" />
                <Text style={styles.emptySlotsTitle}>
                  {slotsReason || 'Nenhum horário disponível'}
                </Text>
                <Text style={styles.emptySlotsHint}>
                  {date === localDateKey(new Date())
                    ? 'Os horários de hoje já passaram ou estão ocupados. Escolha outro dia.'
                    : 'Tente outra data para ver horários livres.'}
                </Text>
                <TouchableOpacity style={styles.emptySlotsButton} onPress={() => setStep('date')} activeOpacity={0.85}>
                  <Text style={styles.emptySlotsButtonText}>Escolher outra data</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.legend}>
                  <LegendItem tone="available" label="Disponível" />
                  <LegendItem tone="selected" label="Selecionado" />
                  <LegendItem tone="booked" label="Ocupado" />
                </View>

                {availableCount === 0 ? (
                  <View style={styles.onlyBookedBanner}>
                    <Ionicons name="information-circle-outline" size={18} color="#be185d" />
                    <Text style={styles.onlyBookedText}>
                      Não restam horários livres neste dia. Os abaixo já estão ocupados.
                    </Text>
                  </View>
                ) : null}

                {shifts.map((shift) => (
                  <View key={shift.id} style={styles.shiftBlock}>
                    <View style={styles.shiftHeader}>
                      <View style={styles.shiftIconWrap}>
                        <Ionicons name={shift.icon} size={16} color="#ec4899" />
                      </View>
                      <Text style={styles.shiftLabel}>{shift.label}</Text>
                      <View style={styles.shiftLine} />
                    </View>
                    <View style={styles.slots}>
                      {shift.slots.map((slot) => {
                        const booked = bookedSlots.includes(slot) || !slots.includes(slot);
                        return (
                          <TouchableOpacity
                            key={slot}
                            disabled={booked}
                            onPress={() => setTime(slot)}
                            style={[
                              styles.slot,
                              booked && styles.slotDisabled,
                              time === slot && styles.slotSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.slotText,
                                booked && styles.slotTextDisabled,
                                time === slot && styles.slotTextSelected,
                              ]}
                            >
                              {slot}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </>
            )}
            {time ? (
              <>
                {isPackage && (draftSlots.length + 1) < (activePurchase?.remainingSessions || service.packageSessionCount || 1) ? (
                  <TouchableOpacity
                    onPress={() => {
                      setDraftSlots((current) =>
                        current.some((slot) => slot.date === date && slot.time === time)
                          ? current
                          : [...current, { date, time }],
                      );
                      setDate('');
                      setTime('');
                      setStep('date');
                    }}
                    style={{ alignItems: 'center', marginBottom: 10 }}
                  >
                    <Text style={{ color: '#ec4899', fontWeight: '800' }}>Adicionar outra data</Text>
                  </TouchableOpacity>
                ) : null}
                {draftSlots.length > 0 ? (
                  <Text style={{ textAlign: 'center', color: '#6b7280', marginBottom: 8 }}>
                    {draftSlots.length + 1} {(draftSlots.length + 1) === 1 ? 'sessão escolhida' : 'sessões escolhidas'}
                  </Text>
                ) : null}
                <PrimaryButton title="Revisar agendamento" onPress={() => setStep('review')} />
              </>
            ) : null}
          </>
        )}

        {step === 'review' && (
          <>
            <Text style={styles.sectionTitle}>
              {isPackageSessionReview && !isRescheduling ? 'Confirmar agendamento' : 'Revise antes de confirmar'}
            </Text>
            <View style={styles.reviewCard}>
              <ReviewRow
                icon="flower-outline"
                label="Tratamento"
                value={service.name}
                badge={sessionBadge}
              />
              <ReviewRow
                icon="calendar-outline"
                label={isPackage && !isRescheduling ? 'Primeira sessão' : 'Data'}
                value={formatReviewDate(date)}
                suffix={date === localDateKey(new Date()) ? '(Hoje)' : undefined}
              />
              <ReviewRow icon="time-outline" label="Horário" value={time} />
              {!isRescheduling && !isPackageSessionReview && (
                <ReviewRow
                  icon="wallet-outline"
                  label="Pagamento"
                  value={
                    bookingOrigin === 'SUBSCRIPTION'
                      ? `Sessão de ${monthTitle(date)} (${remainingForSelectedDate} restantes)`
                      : originLabel(bookingOrigin)
                  }
                />
              )}
              {!isRescheduling && !isPackageSessionReview && bookingOrigin !== 'SUBSCRIPTION' && (
                <ReviewRow icon="cash-outline" label="Total" value={currency(finalPrice)} />
              )}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton
              title={
                isRescheduling
                  ? 'Confirmar novo horário'
                  : isSchedulingPaidSession ||
                      bookingOrigin === 'SUBSCRIPTION' ||
                      (bookingOrigin === 'VOUCHER' && finalPrice === 0)
                    ? 'Confirmar agendamento'
                    : 'Ir para pagamento'
              }
              onPress={submit}
              loading={submitting}
            />
          </>
        )}
        {error && step !== 'review' ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function PaymentOption({
  selected,
  disabled,
  icon,
  title,
  subtitle,
  accent,
  onPress,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.paymentOption,
        selected && { borderColor: accent, backgroundColor: `${accent}12` },
        disabled && styles.paymentOptionDisabled,
      ]}
    >
      <View style={[styles.paymentIconWrap, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={20} color={disabled ? '#9ca3af' : accent} />
      </View>
      <View style={styles.paymentCopy}>
        <Text style={[styles.paymentTitle, disabled && styles.paymentTextDisabled]}>{title}</Text>
        <Text style={[styles.paymentSubtitle, disabled && styles.paymentTextDisabled]}>{subtitle}</Text>
      </View>
      {selected && !disabled ? <Ionicons name="checkmark-circle" size={22} color={accent} /> : null}
    </TouchableOpacity>
  );
}

function LegendItem({ tone, label }: { tone: 'available' | 'selected' | 'booked'; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          tone === 'available' && styles.legendAvailable,
          tone === 'selected' && styles.legendSelected,
          tone === 'booked' && styles.legendBooked,
        ]}
      />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      disabled={loading || disabled}
      style={[styles.primaryButton, (loading || disabled) && { opacity: 0.55 }]}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>{title}</Text>}
    </TouchableOpacity>
  );
}

function Summary({
  icon,
  label,
  value,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <View style={styles.summary}>
      <View style={[styles.summaryIconWrap, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ReviewRow({
  icon,
  label,
  value,
  suffix,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  suffix?: string;
  badge?: string;
}) {
  return (
    <View style={styles.reviewRow}>
      <Ionicons name={icon} size={21} color="#ec4899" />
      <View style={{ flex: 1 }}>
        <Text style={styles.reviewLabel}>{label}</Text>
        <View style={styles.reviewValueRow}>
          <Text style={styles.reviewValue}>
            {value}
            {suffix ? <Text style={styles.reviewValueSuffix}> {suffix}</Text> : null}
          </Text>
          {badge ? (
            <View style={styles.sessionBadge}>
              <Text style={styles.sessionBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function CenteredMessage({ title, action, compact }: { title: string; action: () => void; compact?: boolean }) {
  return (
    <View style={[styles.centered, compact && { minHeight: 180 }]}>
      <Ionicons name="calendar-outline" size={50} color="#d1d5db" />
      <Text style={styles.centeredText}>{title}</Text>
      <TouchableOpacity onPress={action}>
        <Text style={styles.link}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );
}

function previousStep(step: Step): Step {
  return step === 'review' ? 'time' : step === 'time' ? 'date' : 'details';
}
function progress(step: Step) {
  return ({ details: 25, date: 50, time: 75, review: 100 })[step];
}
function stepLabel(step: Step) {
  return ({ details: 'Detalhes', date: 'Escolha a data', time: 'Escolha o horário', review: 'Confirmação' })[step];
}
function originLabel(origin: BookableOrigin) {
  return origin === 'SUBSCRIPTION'
    ? 'Incluso no seu plano'
    : origin === 'VOUCHER'
      ? 'Voucher aplicado'
      : 'Pagamento avulso';
}
function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function formatSlotDate(value: string) {
  if (!value) return '';
  const dateValue = new Date(`${value}T12:00:00`);
  const weekday = capitalize(
    dateValue.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/-feira$/i, ''),
  );
  const day = dateValue.toLocaleDateString('pt-BR', { day: '2-digit' });
  const month = dateValue.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${weekday}, ${day} de ${month}.`;
}
/** Ex.: "Segunda-Feira, dia 27 de julho" */
function formatConfirmDate(value: string) {
  if (!value) return '';
  const dateValue = new Date(`${value}T12:00:00`);
  const weekdayRaw = dateValue.toLocaleDateString('pt-BR', { weekday: 'long' });
  const weekday = weekdayRaw
    .split('-')
    .map((part) => capitalize(part))
    .join('-');
  const day = dateValue.toLocaleDateString('pt-BR', { day: 'numeric' });
  const month = dateValue.toLocaleDateString('pt-BR', { month: 'long' });
  return `${weekday}, dia ${day} de ${month}`;
}
function formatReviewDate(value: string) {
  if (!value) return '';
  const formatted = new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  return capitalize(formatted);
}
function hourFromSlot(slot: string) {
  const hour = Number(slot.slice(0, 2));
  return Number.isFinite(hour) ? hour : 0;
}
function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function addDays(ymd: string, days: number) {
  const dateValue = new Date(`${ymd}T12:00:00`);
  dateValue.setDate(dateValue.getDate() + days);
  return localDateKey(dateValue);
}
function lastDayOfNextMonth() {
  const now = new Date();
  return localDateKey(new Date(now.getFullYear(), now.getMonth() + 2, 0));
}
function isBookableDay(marker: DayMarker, machineKind: 'LASER' | 'CRYO' | null) {
  if (machineKind === 'LASER') {
    return marker.markers.includes('LASER') && marker.released.LASER;
  }
  if (machineKind === 'CRYO') {
    return marker.markers.includes('CRYO') && marker.released.CRYO;
  }
  return !marker.closed && !marker.laserExclusive;
}
function remainingForMonth(subscription: Subscription | null | undefined, ymd: string) {
  if (!subscription || !ymd) return 0;
  const key = ymd.slice(0, 7);
  const mapped = subscription.remaining.byMonth?.[key];
  if (typeof mapped === 'number') return mapped;
  const todayKey = localDateKey(new Date()).slice(0, 7);
  if (key === todayKey) return subscription.remaining.thisMonth;
  return subscription.plan.maxTreatmentsPerMonth;
}
function dayNumber(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit' });
}
function weekdayShort(ymd: string) {
  const weekday = new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' });
  return capitalize(weekday.replace('.', ''));
}
function monthTitle(ymd: string) {
  return capitalize(new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' }));
}
function groupDaysByMonth(days: string[]) {
  const groups: Array<{ key: string; title: string; days: string[] }> = [];
  for (const day of days) {
    const key = day.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.days.push(day);
    } else {
      groups.push({ key, title: monthTitle(day), days: [day] });
    }
  }
  return groups;
}
/** Remove slots cujo início já passou no dia de hoje (hora local do dispositivo). */
function filterFutureSlots(date: string, list: string[]) {
  if (date !== localDateKey(new Date())) return list;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  return list.filter((slot) => {
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m > nowMinutes;
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  headerStep: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  progress: { height: 4, backgroundColor: '#fce7f3' },
  progressFill: { height: 4, backgroundColor: '#ec4899' },
  content: { padding: 22, paddingBottom: 44 },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fce7f3',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    overflow: 'hidden',
  },
  heroCategoryIcon: { width: 52, height: 52 },
  serviceName: {
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    color: '#111827',
    marginTop: 18,
  },
  category: { fontWeight: '700', textAlign: 'center', marginTop: 5 },
  description: {
    fontSize: 15,
    lineHeight: 23,
    color: '#4b5563',
    textAlign: 'center',
    marginVertical: 22,
  },
  packageItems: {
    backgroundColor: '#fff1f2',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  packageItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  packageItemName: { flex: 1, color: '#111827', fontWeight: '600' },
  packageItemDuration: { color: '#9f1239', fontSize: 12, fontWeight: '700' },
  packageMeta: { marginTop: 6, color: '#475569', fontWeight: '800', fontSize: 13 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summary: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  summaryLabel: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 3 },

  planInfoCard: {
    marginTop: 14,
    backgroundColor: '#fdf2f8',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(236,73,152,0.18)',
  },
  planBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planBadgeText: { color: '#be185d', fontWeight: '800', fontSize: 14 },
  planSessionsText: { color: '#9d174d', fontSize: 13, marginTop: 6, fontWeight: '600' },
  startingPlanRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  startingPlanText: { color: '#9d174d', fontSize: 13, fontWeight: '600', flex: 1 },

  paymentSectionTitle: {
    marginTop: 22,
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
  },
  paymentOptionDisabled: { opacity: 0.55 },
  paymentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCopy: { flex: 1 },
  paymentTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  paymentSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2, lineHeight: 18 },
  paymentTextDisabled: { color: '#9ca3af' },

  primaryButton: {
    backgroundColor: '#ec4899',
    borderRadius: 14,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  primaryButtonText: { color: 'white', fontWeight: '800', fontSize: 16 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 18 },
  machineHint: {
    fontSize: 12,
    color: '#be185d',
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 16,
  },
  dayChip: {
    flexGrow: 0,
    paddingVertical: 12,
    minHeight: 72,
  },
  dayChipNumber: { fontSize: 20, fontWeight: '800', color: '#111827' },
  dayChipTodayLabel: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dayChipWeekday: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 2 },
  dayChipWeekdaySelected: { color: 'rgba(255,255,255,0.92)' },
  dateConfirmBlock: {
    marginTop: 18,
  },
  dateConfirmLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 4,
  },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 18,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4 },
  legendAvailable: { backgroundColor: 'white', borderWidth: 2, borderColor: '#e5e7eb' },
  legendSelected: { backgroundColor: '#ec4899' },
  legendBooked: { backgroundColor: '#e5e7eb', borderWidth: 1, borderColor: '#d1d5db' },
  legendLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },

  shiftBlock: { marginBottom: 18 },
  shiftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  shiftIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fce7f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftLabel: { fontSize: 14, fontWeight: '800', color: '#ec4899' },
  shiftLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(236,73,152,0.25)' },

  emptySlotsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 36,
    paddingHorizontal: 22,
    marginTop: 8,
  },
  emptySlotsTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  emptySlotsHint: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
    textAlign: 'center',
  },
  emptySlotsButton: {
    marginTop: 18,
    backgroundColor: '#ec4899',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptySlotsButtonText: { color: 'white', fontWeight: '800', fontSize: 14 },
  onlyBookedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fdf2f8',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  onlyBookedText: { flex: 1, color: '#9d174d', fontSize: 13, fontWeight: '600', lineHeight: 18 },

  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: {
    width: '30%',
    flexGrow: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  slotSelected: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  slotDisabled: { backgroundColor: '#f3f4f6' },
  slotText: { fontWeight: '700', color: '#111827' },
  slotTextSelected: { color: 'white' },
  slotTextDisabled: { color: '#c4c8ce', textDecorationLine: 'line-through' },

  reviewCard: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  reviewRow: {
    flexDirection: 'row',
    gap: 13,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  reviewLabel: { fontSize: 12, color: '#6b7280' },
  reviewValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  reviewValue: { fontSize: 15, color: '#111827', fontWeight: '700' },
  reviewValueSuffix: { color: '#ec4899', fontWeight: '800' },
  sessionBadge: {
    backgroundColor: '#fdf2f8',
    borderWidth: 1,
    borderColor: '#f9a8d4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sessionBadgeText: { color: '#be185d', fontSize: 12, fontWeight: '800' },
  error: {
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    textAlign: 'center',
  },
  centered: { minHeight: 500, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centeredText: { fontSize: 18, color: '#6b7280', marginTop: 12, marginBottom: 10 },
  link: { color: '#ec4899', fontWeight: '800' },
});
