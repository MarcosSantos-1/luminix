import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCommercial } from '../../contexts/CommercialContext';
import { cancelAppointment } from '../../lib/api';
import {
  effectiveAppointmentStatus,
  getApiErrorMessage,
  isExpiredUnpaidHold,
  isOnlinePaymentHold,
  type Appointment,
} from '../../types/commercial';
import { useAuth } from '../../contexts/AuthContext';
import type { ClientStackParamList, ClientTabParamList } from '../../navigation/ClientNavigator';

LocaleConfig.locales.pt = {
  monthNames: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ],
  monthNamesShort: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje',
};
LocaleConfig.defaultLocale = 'pt';

const HOLD_MS_TICK = 250;
const PINK = '#ec4899';

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKeyFromDate(value: string) {
  return value.slice(0, 7);
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '00:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function isActiveUpcoming(appointment: Appointment, now: Date) {
  const status = effectiveAppointmentStatus(appointment);
  return !['COMPLETED', 'CANCELED', 'NO_SHOW'].includes(status) && wallDate(appointment.startTime) >= now;
}

export function AgendaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ClientTabParamList, 'Agenda'>>();
  const { appointments, loading, refreshing, error, refresh } = useCommercial();
  const [selectedDate, setSelectedDate] = useState('');
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => monthKeyFromDate(todayString()));
  const scrollRef = useRef<ScrollView>(null);
  const pendingAppointmentId = route.params?.appointmentId;
  const today = todayString();

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const clearAppointmentParam = useCallback(() => {
    if (route.params?.appointmentId) {
      navigation.setParams({ appointmentId: undefined });
    }
  }, [navigation, route.params?.appointmentId]);

  useFocusEffect(
    useCallback(() => {
      setActiveTab('upcoming');
      scrollToTop();
      const unsubscribe = navigation.addListener('tabPress', scrollToTop);
      return unsubscribe;
    }, [navigation, scrollToTop])
  );

  useEffect(() => {
    if (!pendingAppointmentId || loading) return;
    const match = appointments.find((item) => item.id === pendingAppointmentId);
    if (match) {
      setSelected(match);
      setActiveTab('upcoming');
      setSelectedDate('');
    }
    clearAppointmentParam();
  }, [appointments, clearAppointmentParam, loading, pendingAppointmentId]);

  const now = new Date();
  const upcoming = appointments.filter((item) => isActiveUpcoming(item, now));
  const history = appointments.filter((item) => !isActiveUpcoming(item, now)).slice().reverse();
  const visible = selectedDate
    ? appointments.filter((item) => datePart(item.startTime) === selectedDate)
    : activeTab === 'upcoming' ? upcoming : history;

  const datesWithAppointments = useMemo(() => {
    const set = new Set<string>();
    for (const item of appointments) set.add(datePart(item.startTime));
    return set;
  }, [appointments]);

  const isPastWithoutHistory = useCallback(
    (date: string) => date < today && !datesWithAppointments.has(date),
    [datesWithAppointments, today],
  );

  const markedDates = useMemo(() => {
    const result: Record<string, any> = {};
    const [yearStr, monthStr] = visibleMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
      if (isPastWithoutHistory(dateStr)) {
        result[dateStr] = {
          disabled: true,
          disableTouchEvent: true,
          customStyles: {
            container: { backgroundColor: 'transparent' },
            text: { color: '#d1d5db' },
          },
        };
      }
    }

    for (const item of appointments) {
      const date = datePart(item.startTime);
      const prev = result[date] || {};
      result[date] = {
        ...prev,
        disabled: false,
        disableTouchEvent: false,
        marked: true,
        dotColor: statusColor(item.status),
        customStyles: {
          container: { ...(prev.customStyles?.container || {}), backgroundColor: 'transparent' },
          text: { ...(prev.customStyles?.text || {}), color: '#111827', fontWeight: '600' },
        },
      };
    }

    if (!result[today] || !result[today].disabled) {
      const prev = result[today] || {};
      result[today] = {
        ...prev,
        customStyles: {
          container: {
            borderWidth: 1.5,
            borderColor: PINK,
            borderRadius: 16,
            backgroundColor: 'transparent',
          },
          text: {
            color: PINK,
            fontWeight: '700',
          },
        },
      };
    }

    if (selectedDate) {
      const prev = result[selectedDate] || {};
      result[selectedDate] = {
        ...prev,
        disabled: false,
        disableTouchEvent: false,
        customStyles: {
          container: {
            backgroundColor: PINK,
            borderRadius: 16,
            borderWidth: 0,
          },
          text: {
            color: 'white',
            fontWeight: '700',
          },
        },
      };
    }

    return result;
  }, [appointments, isPastWithoutHistory, selectedDate, today, visibleMonth]);

  const handleDayPress = useCallback(
    (day: { dateString: string }) => {
      if (isPastWithoutHistory(day.dateString)) return;
      setSelectedDate((current) => (current === day.dateString ? '' : day.dateString));
    },
    [isPastWithoutHistory],
  );

  const handleCancel = (appointment: Appointment) => {
    const minH =
      appointment.cancelPolicy?.kind === 'machine'
        ? appointment.cancelPolicy.lateCancelHours || 24
        : appointment.cancelPolicy?.minCancellationHours || 4;
    const start = new Date(
      Number(appointment.startTime.slice(0, 4)),
      Number(appointment.startTime.slice(5, 7)) - 1,
      Number(appointment.startTime.slice(8, 10)),
      Number(appointment.startTime.slice(11, 13)),
      Number(appointment.startTime.slice(14, 16)),
    );
    const onTime = (start.getTime() - Date.now()) / 36e5 >= minH;
    const paidAvulso = appointment.origin === 'SINGLE' && appointment.paymentStatus === 'PAID';
    const policyText = appointment.cancelPolicy?.text || `A antecedência mínima é de ${minH}h.`;

    const run = async (settlement?: 'REFUND' | 'CREDIT') => {
      try {
        const result = await cancelAppointment(appointment.id, 'Cancelado pelo aplicativo', settlement);
        setSelected(null);
        await refresh();
        Alert.alert('Agendamento cancelado', result.message || 'Seu horário foi cancelado.');
      } catch (requestError) {
        Alert.alert('Não foi possível cancelar', getApiErrorMessage(requestError));
      }
    };

    if (onTime && paidAvulso) {
      const choiceText =
        appointment.cancelPolicy?.onTimeText ||
        `${policyText}\n\nVocê está com ${minH}h ou mais de antecedência. Escolha reembolso em dinheiro ou crédito para outros procedimentos.`;
      Alert.alert('Cancelar agendamento', choiceText, [
        { text: 'Manter horário', style: 'cancel' },
        { text: 'Quero crédito', onPress: () => { void run('CREDIT'); } },
        { text: 'Reembolso', onPress: () => { void run('REFUND'); } },
      ]);
      return;
    }

    const isMachine = appointment.cancelPolicy?.kind === 'machine' || Boolean(appointment.service?.machineKind);
    const lateHint = !onTime
      ? appointment.origin === 'SUBSCRIPTION'
        ? (appointment.cancelPolicy?.kind === 'standard'
            ? appointment.cancelPolicy.latePlanText
            : `Faltam menos de ${minH}h: você perde esta sessão do plano.`)
        : isMachine && paidAvulso
          ? (appointment.cancelPolicy?.kind === 'machine'
              ? appointment.cancelPolicy.latePaidText
              : `Faltam menos de ${minH}h neste tratamento especial. O valor volta em dinheiro com multa, sem opção de crédito.`)
          : paidAvulso
            ? (appointment.cancelPolicy?.kind === 'standard'
                ? appointment.cancelPolicy.latePaidText
                : `Faltam menos de ${minH}h: não há reembolso em dinheiro. O valor vira crédito.`)
            : policyText
      : policyText;

    Alert.alert('Cancelar agendamento', `${lateHint}\n\nDeseja continuar?`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar horário', style: 'destructive', onPress: () => { void run(); } },
    ]);
  };

  const emptyAction = () => {
    if (!selectedDate && activeTab === 'history') {
      navigation.navigate('Profile', { openScreen: 'history' });
      return;
    }
    navigation.navigate('Services');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}><Text style={styles.headerTitle}>Minha Agenda</Text><Text style={styles.headerSubtitle}>Gerencie seus agendamentos</Text></View>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#ec4899" />}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.newButton} onPress={() => navigation.navigate('Services')}><Ionicons name="add-circle-outline" size={23} color="white" /><Text style={styles.newButtonText}>Novo Agendamento</Text></TouchableOpacity>
          <View style={styles.calendarCard}>
            <Calendar
              markingType="custom"
              onDayPress={handleDayPress}
              onMonthChange={(month) => setVisibleMonth(monthKeyFromDate(month.dateString))}
              markedDates={markedDates}
              theme={{
                arrowColor: PINK,
                todayTextColor: PINK,
                selectedDayBackgroundColor: PINK,
                selectedDayTextColor: 'white',
                dotColor: PINK,
                textDisabledColor: '#d1d5db',
                monthTextColor: '#111827',
                textMonthFontWeight: '700',
              }}
            />
          </View>
          {selectedDate ? <View style={styles.selectionHeader}><Text style={styles.sectionTitle}>{longDate(selectedDate)}</Text><TouchableOpacity onPress={() => setSelectedDate('')}><Text style={styles.clear}>Limpar</Text></TouchableOpacity></View> : (
            <View style={styles.tabs}>
              <Tab title={`Próximos (${upcoming.length})`} active={activeTab === 'upcoming'} onPress={() => setActiveTab('upcoming')} />
              <Tab title="Histórico" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
            </View>
          )}

          {loading ? <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 45 }} /> : error && appointments.length === 0 ? <Empty icon="cloud-offline-outline" title={error} action={refresh} /> : visible.length === 0 ? <Empty icon="calendar-outline" title={selectedDate ? 'Nenhum agendamento neste dia' : activeTab === 'upcoming' ? 'Nenhum horário agendado' : 'Seu histórico aparecerá aqui'} action={emptyAction} /> : (
            <View style={styles.list}>
              {visible.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onPress={() => setSelected(appointment)}
                  onHoldExpired={() => void refresh()}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <AppointmentDetail
        appointment={selected}
        onClose={() => setSelected(null)}
        onCancel={handleCancel}
        onRefresh={refresh}
        onReschedule={(appointment) => {
          setSelected(null);
          navigation.navigate('Booking', { serviceId: appointment.serviceId, appointmentId: appointment.id });
        }}
      />
    </SafeAreaView>
  );
}

function AppointmentCard({
  appointment,
  onPress,
  onHoldExpired,
}: {
  appointment: Appointment;
  onPress: () => void;
  onHoldExpired: () => void;
}) {
  const date = datePart(appointment.startTime);
  const hold = isOnlinePaymentHold(appointment);
  const expired = isExpiredUnpaidHold(appointment);
  const status = effectiveAppointmentStatus(appointment);
  const payAtClinic =
    appointment.origin === 'ADMIN_CREATED' &&
    appointment.paymentStatus === 'PENDING' &&
    status !== 'CANCELED' &&
    status !== 'COMPLETED';
  return (
    <TouchableOpacity style={[styles.card, hold && styles.cardHold, payAtClinic && styles.cardClinic]} onPress={onPress}>
      <View style={styles.dateBox}><Text style={styles.day}>{date.slice(8, 10)}</Text><Text style={styles.month}>{shortMonth(date)}</Text></View>
      <View style={styles.cardInfo}>
        <Text style={styles.service} numberOfLines={1}>{appointment.service.name}</Text>
        <View style={styles.meta}>
          <Ionicons name="time-outline" size={15} color="#6b7280" />
          <Text style={styles.metaText}>{timePart(appointment.startTime)}</Text>
          <View style={[styles.dot, { backgroundColor: hold ? '#f97316' : statusColor(status) }]} />
          <Text style={[styles.status, { color: hold ? '#c2410c' : statusColor(status) }]}>
            {hold ? 'Pagar' : statusLabel(status)}
          </Text>
          {payAtClinic ? (
            <View style={styles.clinicBadge}>
              <Text style={styles.clinicBadgeText}>Pagar na clínica</Text>
            </View>
          ) : null}
        </View>
        {hold ? <HoldCountdown expiresAt={appointment.paymentExpiresAt!} onExpired={onHoldExpired} /> : null}
        {expired ? <Text style={styles.holdExpiredHint}>Pagamento não concluído</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
    </TouchableOpacity>
  );
}

function HoldCountdown({ expiresAt, onExpired }: { expiresAt: string; onExpired?: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  const expiredNotified = useRef(false);
  useEffect(() => {
    expiredNotified.current = false;
    const id = setInterval(() => {
      const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setLeft(ms);
      if (ms <= 0 && !expiredNotified.current) {
        expiredNotified.current = true;
        onExpired?.();
      }
    }, HOLD_MS_TICK);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);
  return (
    <Text style={[styles.holdTimer, left < 60_000 && styles.holdTimerUrgent]}>
      Expira em {formatCountdown(left)}
    </Text>
  );
}

function AppointmentDetail({ appointment, onClose, onCancel, onReschedule, onRefresh }: {
  appointment: Appointment | null;
  onClose: () => void;
  onCancel: (item: Appointment) => void;
  onReschedule: (item: Appointment) => void;
  onRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [paying, setPaying] = useState(false);
  const hold = appointment ? isOnlinePaymentHold(appointment) : false;
  const expired = appointment ? isExpiredUnpaidHold(appointment) : false;
  const status = appointment ? effectiveAppointmentStatus(appointment) : null;
  const [left, setLeft] = useState(0);
  const expiredNotified = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const onCloseRef = useRef(onClose);
  onRefreshRef.current = onRefresh;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!appointment?.paymentExpiresAt || !hold) return;
    expiredNotified.current = false;
    const tick = () => {
      const ms = Math.max(0, new Date(appointment.paymentExpiresAt!).getTime() - Date.now());
      setLeft(ms);
      if (ms <= 0 && !expiredNotified.current) {
        expiredNotified.current = true;
        void onRefreshRef.current().then(() => onCloseRef.current());
      }
    };
    tick();
    const id = setInterval(tick, HOLD_MS_TICK);
    return () => clearInterval(id);
  }, [appointment?.id, appointment?.paymentExpiresAt, hold]);

  if (!appointment || !status) return null;
  const actionable =
    ['PENDING', 'CONFIRMED'].includes(status) &&
    !expired &&
    wallDate(appointment.startTime) > new Date();

  const handlePay = async () => {
    if (!user || paying || left <= 0) return;
    setPaying(true);
    try {
      onClose();
      navigation.navigate('Checkout', {
        serviceId: appointment.serviceId,
        appointmentId: appointment.id,
        packagePurchaseId: appointment.packagePurchaseId || undefined,
        amount: appointment.paymentAmount ?? appointment.service.price,
        description: appointment.service.name,
        expiresAt: appointment.paymentExpiresAt || undefined,
      } satisfies ClientStackParamList['Checkout']);
    } finally {
      setPaying(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}><TouchableOpacity style={styles.backdrop} onPress={onClose} /><View style={styles.sheet}>
        <View style={styles.handle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Detalhes do horário</Text><TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={30} color="#9ca3af" /></TouchableOpacity></View>
        <View style={styles.statusBadgeRow}>
          <View style={[styles.statusBadge, { backgroundColor: hold ? '#ffedd5' : `${statusColor(status)}18` }]}>
            <View style={[styles.dot, { backgroundColor: hold ? '#f97316' : statusColor(status) }]} />
            <Text style={[styles.status, { color: hold ? '#c2410c' : statusColor(status) }]}>
              {hold ? 'Pagamento pendente' : statusLabel(status)}
            </Text>
          </View>
          {appointment.origin === 'ADMIN_CREATED' &&
          appointment.paymentStatus === 'PENDING' &&
          status !== 'CANCELED' &&
          status !== 'COMPLETED' ? (
            <View style={styles.clinicBadge}>
              <Text style={styles.clinicBadgeText}>Pagar na clínica</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.detailService,
            !(appointment.packageSessionIndex && appointment.packagePurchase?.sessionCount) && { marginBottom: 20 },
          ]}
        >
          {appointment.service.name}
        </Text>
        {appointment.packageSessionIndex && appointment.packagePurchase?.sessionCount ? (
          <View style={styles.sessionBadge}>
            <Text style={styles.sessionBadgeText}>
              Sessão {appointment.packageSessionIndex} de {appointment.packagePurchase.sessionCount}
            </Text>
          </View>
        ) : null}
        <Detail icon="calendar-outline" text={longDate(datePart(appointment.startTime))} />
        <Detail icon="time-outline" text={`${timePart(appointment.startTime)} • ${appointment.service.duration} minutos`} />
        <Detail
          icon="wallet-outline"
          text={originLabel(appointment.origin, appointment.paymentStatus, status, appointment.cancelReason)}
        />
        {hold ? (
          <View style={styles.holdBox}>
            <Text style={styles.holdBoxTitle}>Reserve expira em {formatCountdown(left)}</Text>
            <Text style={styles.holdBoxText}>Conclua o pagamento ou o horário será liberado automaticamente.</Text>
            <TouchableOpacity style={styles.payButton} onPress={handlePay} disabled={paying || left <= 0}>
              <Text style={styles.payButtonText}>{paying ? 'Abrindo…' : 'Pagar agora'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {expired ? (
          <View style={styles.expiredBox}>
            <Text style={styles.expiredBoxText}>
              O tempo para pagamento acabou. Este horário foi cancelado e liberado.
            </Text>
          </View>
        ) : null}
        {actionable && !hold ? (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.reschedule} onPress={() => onReschedule(appointment)}>
              <Text style={styles.rescheduleText}>Reagendar</Text>
            </TouchableOpacity>
            {!(appointment.packagePurchaseId && appointment.paymentStatus === 'PAID') ? (
              <TouchableOpacity style={styles.cancel} onPress={() => onCancel(appointment)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View></View>
    </Modal>
  );
}

function Detail({ icon, text }: { icon: any; text: string }) { return <View style={styles.detailRow}><Ionicons name={icon} size={20} color="#ec4899" /><Text style={styles.detailText}>{text}</Text></View>; }
function Tab({ title, active, onPress }: { title: string; active: boolean; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{title}</Text></TouchableOpacity>; }
function Empty({ icon, title, action }: { icon: any; title: string; action: () => void }) { return <View style={styles.empty}><Ionicons name={icon} size={52} color="#d1d5db" /><Text style={styles.emptyText}>{title}</Text><TouchableOpacity onPress={action}><Text style={styles.clear}>Tentar/agendar agora</Text></TouchableOpacity></View>; }
function datePart(value: string) { return value.slice(0, 10); }
function timePart(value: string) { return value.slice(11, 16); }
function wallDate(value: string) { return new Date(`${datePart(value)}T${timePart(value)}:00`); }
function longDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); }
function shortMonth(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); }
function statusColor(status: string) { return status === 'CONFIRMED' || status === 'COMPLETED' ? '#10b981' : status === 'PENDING' ? PINK : '#ef4444'; }
function statusLabel(status: string) { return ({ PENDING: 'Agendado', CONFIRMED: 'Confirmado', COMPLETED: 'Concluído', CANCELED: 'Cancelado', NO_SHOW: 'Não compareceu' } as any)[status] || status; }
function originLabel(
  origin: string,
  payment: string | null,
  status?: string,
  cancelReason?: string | null,
) {
  if (status === 'CANCELED') {
    if (cancelReason && /pagamento/i.test(cancelReason)) return 'Cancelado por falta de pagamento';
    return cancelReason ? cancelReason : 'Agendamento cancelado';
  }
  if (origin === 'SUBSCRIPTION') return 'Descontado do plano';
  if (origin === 'VOUCHER') return 'Voucher aplicado';
  if (origin === 'PACKAGE') return payment === 'PAID' ? 'Sessão do pacote' : 'Pagamento do pacote pendente';
  if (origin === 'SINGLE') return payment === 'PAID' ? 'Pagamento confirmado' : 'Pagamento pendente';
  if (origin === 'ADMIN_CREATED' && payment === 'PENDING') return 'Pagar na clínica';
  return 'Criado pela clínica';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: 'white', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#111827' },
  headerSubtitle: { fontSize: 15, color: '#6b7280', marginTop: 4 },
  content: { padding: 20, paddingBottom: 38 },
  newButton: { backgroundColor: '#ec4899', borderRadius: 14, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 },
  newButtonText: { color: 'white', fontSize: 16, fontWeight: '800' },
  calendarCard: { backgroundColor: 'white', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  tabs: { flexDirection: 'row', backgroundColor: '#e5e7eb', padding: 4, borderRadius: 13, marginVertical: 20 },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: 'white' },
  tabText: { color: '#6b7280', fontWeight: '700' },
  tabTextActive: { color: '#ec4899' },
  selectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textTransform: 'capitalize' },
  clear: { color: '#ec4899', fontWeight: '800' },
  list: { gap: 12 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  cardHold: { backgroundColor: '#fff7ed', borderColor: '#fb923c' },
  cardClinic: { backgroundColor: '#fefce8', borderColor: '#facc15' },
  clinicBadge: { marginLeft: 6, backgroundColor: '#fef08a', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  clinicBadgeText: { color: '#854d0e', fontSize: 10, fontWeight: '800' },
  statusBadgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  dateBox: { width: 54, height: 58, borderRadius: 12, backgroundColor: '#fdf2f8', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  day: { fontSize: 21, color: '#ec4899', fontWeight: '800' },
  month: { color: '#9d174d', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  cardInfo: { flex: 1 },
  service: { color: '#111827', fontSize: 16, fontWeight: '800' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  metaText: { color: '#6b7280', fontSize: 13 },
  holdTimer: { marginTop: 6, color: '#c2410c', fontSize: 12, fontWeight: '800' },
  holdTimerUrgent: { color: '#b91c1c' },
  holdExpiredHint: { marginTop: 6, color: '#ef4444', fontSize: 12, fontWeight: '700' },
  holdBox: { backgroundColor: '#ffedd5', borderRadius: 14, padding: 14, marginTop: 8, marginBottom: 8 },
  holdBoxTitle: { color: '#9a3412', fontWeight: '800', fontSize: 15 },
  holdBoxText: { color: '#9a3412', fontSize: 13, marginTop: 6, marginBottom: 12 },
  payButton: { backgroundColor: '#ea580c', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  payButtonText: { color: 'white', fontWeight: '800' },
  expiredBox: { backgroundColor: '#fee2e2', borderRadius: 14, padding: 14, marginTop: 8, marginBottom: 8 },
  expiredBoxText: { color: '#b91c1c', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 4 },
  status: { fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginVertical: 12 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.45)' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#d1d5db', alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statusBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12 },
  detailService: { fontSize: 23, fontWeight: '800', color: '#111827', marginTop: 20, marginBottom: 8 },
  sessionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fdf2f8',
    borderWidth: 1,
    borderColor: '#f9a8d4',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  sessionBadgeText: { color: '#be185d', fontSize: 13, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  detailText: { color: '#4b5563', fontSize: 15 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  reschedule: { flex: 1, backgroundColor: '#ec4899', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  rescheduleText: { color: 'white', fontWeight: '800' },
  cancel: { flex: 1, borderWidth: 1, borderColor: '#ef4444', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#ef4444', fontWeight: '800' },
});
