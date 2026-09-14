import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ClientStackParamList } from '../../navigation/ClientNavigator';
import { ScreenHeader } from '../../components/ScreenHeader';
import { getPackagePurchase } from '../../lib/api';
import type { Appointment, PackagePurchase } from '../../types/commercial';
import { getApiErrorMessage, isActivatedPackage } from '../../types/commercial';

type Props = NativeStackScreenProps<ClientStackParamList, 'PackageTimeline'>;

function formatWhen(startTime: string) {
  const date = startTime.slice(0, 10);
  const time = startTime.slice(11, 16);
  const label = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  return `${label} · ${time}`;
}

function statusMeta(appointment?: Appointment) {
  if (!appointment) return { label: 'Em aberto', color: '#9ca3af', icon: 'ellipse-outline' as const };
  if (appointment.status === 'COMPLETED') return { label: 'Concluída', color: '#059669', icon: 'checkmark-circle' as const };
  if (appointment.status === 'NO_SHOW') return { label: 'Não compareceu', color: '#b45309', icon: 'alert-circle' as const };
  if (appointment.status === 'CANCELED') return { label: 'Cancelada', color: '#9ca3af', icon: 'close-circle' as const };
  if (appointment.status === 'CONFIRMED') return { label: 'Confirmada', color: '#7c3aed', icon: 'calendar' as const };
  return { label: 'Agendada', color: '#ec4899', icon: 'time' as const };
}

export function PackageTimelineScreen({ route, navigation }: Props) {
  const [purchase, setPurchase] = useState<PackagePurchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPurchase(await getPackagePurchase(route.params.purchaseId));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Não foi possível carregar o pacote'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [route.params.purchaseId]);

  const items = purchase?.items || purchase?.itemsSnapshot || [];
  const nodes = useMemo(() => {
    if (!purchase) return [];
    const appointments = (purchase.appointments || []).filter((item) => item.status !== 'CANCELED');
    return Array.from({ length: purchase.sessionCount }, (_, index) => {
      const sessionIndex = index + 1;
      const appointment = appointments.find((item) => item.packageSessionIndex === sessionIndex);
      return { sessionIndex, appointment };
    });
  }, [purchase]);

  const remaining = purchase?.remainingSessions ?? 0;
  const done = purchase ? purchase.sessionCount - remaining : 0;
  const canScheduleMore = Boolean(purchase && isActivatedPackage(purchase) && remaining > 0);

  const scheduleRemaining = () => {
    if (!purchase) return;
    navigation.navigate('Booking', {
      serviceId: purchase.packageServiceId,
      packagePurchaseId: purchase.id,
    });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader style={{ borderBottomWidth: 0, paddingHorizontal: 16, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{purchase?.packageService?.name || 'Seu pacote'}</Text>
          <Text style={styles.headerStep}>{done}/{purchase?.sessionCount || 0} sessões</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('ClientTabs', { screen: 'Home' })}
          style={styles.iconButton}
          accessibilityLabel="Ir para o início"
        >
          <Ionicons name="home" size={24} color="#111827" />
        </TouchableOpacity>
      </ScreenHeader>

      {loading ? (
        <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 48 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : purchase ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.progressCard}>
            <Text style={styles.progressLabel}>Tratamentos do pacote</Text>
            <Text style={styles.progressCount}>{done} de {purchase.sessionCount}</Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${(done / purchase.sessionCount) * 100}%` }]} />
            </View>
            {remaining > 0 ? (
              <Text style={styles.remaining}>Restam {remaining} {remaining === 1 ? 'sessão' : 'sessões'} para agendar</Text>
            ) : (
              <Text style={styles.remaining}>Pacote completo — fica no histórico como {purchase.sessionCount}/{purchase.sessionCount}</Text>
            )}
          </View>

          {items.length > 0 && (
            <View style={styles.itemsCard}>
              {items
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((item) => (
                  <View key={`${item.serviceId}-${item.sortOrder}`} style={styles.itemRow}>
                    <Ionicons name="flower-outline" size={16} color="#ec4899" />
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDuration}>{item.durationMinutes} min</Text>
                  </View>
                ))}
              <Text style={styles.itemTotal}>
                {purchase.packageService?.duration || items.reduce((sum, item) => sum + item.durationMinutes, 0)} min por visita
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Linha do tempo</Text>
          {nodes.map((node, index) => {
            const meta = statusMeta(node.appointment);
            const canReschedule = node.appointment && ['PENDING', 'CONFIRMED'].includes(node.appointment.status);
            return (
              <View key={node.sessionIndex} style={styles.nodeRow}>
                <View style={styles.rail}>
                  <View style={[styles.dot, { backgroundColor: meta.color }]} />
                  {index < nodes.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={styles.nodeCard}>
                  <View style={styles.nodeHeader}>
                    <Text style={styles.nodeTitle}>Sessão {node.sessionIndex}</Text>
                    <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
                      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  {node.appointment ? (
                    <Text style={styles.nodeWhen}>{formatWhen(node.appointment.startTime)}</Text>
                  ) : (
                    <Text style={styles.nodeEmpty}>Escolha uma data disponível</Text>
                  )}
                  {canReschedule ? (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('Booking', {
                          serviceId: purchase.packageServiceId,
                          appointmentId: node.appointment!.id,
                        })
                      }
                    >
                      <Text style={styles.link}>Reagendar</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!node.appointment && canScheduleMore ? (
                    <TouchableOpacity onPress={scheduleRemaining}>
                      <Text style={styles.link}>Agendar esta sessão</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })}

          {canScheduleMore ? (
            <TouchableOpacity style={styles.cta} onPress={scheduleRemaining} activeOpacity={0.9}>
              <Text style={styles.ctaText}>
                {remaining === purchase.sessionCount ? 'Agendar sessões' : 'Agendar próximas'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerStep: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  content: { padding: 20, paddingBottom: 40 },
  error: { color: '#be185d', textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  progressCard: { backgroundColor: '#fff1f2', borderRadius: 20, padding: 18, marginBottom: 16 },
  progressLabel: { fontSize: 12, color: '#9f1239', fontWeight: '600' },
  progressCount: { fontSize: 28, fontWeight: '800', color: '#be185d', marginTop: 4 },
  bar: { height: 8, backgroundColor: '#fecdd3', borderRadius: 99, marginTop: 12, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#ec4899' },
  remaining: { marginTop: 10, color: '#9f1239', fontSize: 13 },
  itemsCard: { backgroundColor: '#f9fafb', borderRadius: 16, padding: 14, marginBottom: 20, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { flex: 1, color: '#111827', fontWeight: '600' },
  itemDuration: { color: '#6b7280', fontSize: 12 },
  itemTotal: { marginTop: 6, fontSize: 12, color: '#ec4899', fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  nodeRow: { flexDirection: 'row', minHeight: 92 },
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  line: { flex: 1, width: 2, backgroundColor: '#fce7f3', marginVertical: 4 },
  nodeCard: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 16, padding: 14, marginBottom: 12 },
  nodeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nodeTitle: { fontWeight: '700', color: '#111827' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  nodeWhen: { marginTop: 6, color: '#374151' },
  nodeEmpty: { marginTop: 6, color: '#9ca3af' },
  link: { marginTop: 8, color: '#ec4899', fontWeight: '700' },
  cta: { marginTop: 8, backgroundColor: '#ec4899', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
