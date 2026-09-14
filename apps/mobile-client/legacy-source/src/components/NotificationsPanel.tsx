import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  AppState,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  clearAllNotifications,
  deleteNotification,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type AppNotification,
} from '../lib/api';
import { formatTimeAgo } from '../lib/formatTimeAgo';
import { brand } from '../theme/brand';

type UiTone = 'success' | 'warning' | 'info' | 'error';

type UiNotification = {
  id: string;
  tone: UiTone;
  title: string;
  message: string;
  time: string;
  read: boolean;
  icon: string;
  actionUrl?: string;
};

function mapTone(apiType: string): UiTone {
  if (apiType.includes('SUCCEEDED') || apiType.includes('COMPLETED') || apiType.includes('CONFIRMED') || apiType.includes('WELCOME') || apiType.includes('ACTIVATED') || apiType.includes('RENEWED')) {
    return 'success';
  }
  if (apiType.includes('FAILED') || apiType.includes('CANCELED')) return 'error';
  if (apiType.includes('REMINDER') || apiType.includes('EXPIRING') || apiType.includes('LIMIT')) {
    return 'warning';
  }
  return 'info';
}

function iconFor(iconName: string, tone: UiTone): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  const byTone = {
    success: { color: '#059669', bg: '#d1fae5' },
    warning: { color: '#d97706', bg: '#fef3c7' },
    error: { color: '#dc2626', bg: '#fee2e2' },
    info: { color: '#4b5563', bg: '#f3f4f6' },
  }[tone];

  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    BELL: 'notifications',
    CALENDAR: 'calendar',
    CARD: 'card',
    SPARKLES: 'gift',
    ALERT: 'alert-circle',
    CHECK: 'checkmark-circle',
    INFO: 'information-circle',
    GIFT: 'gift',
    STAR: 'star',
    USER: 'person',
  };

  return {
    name: map[iconName] || 'notifications',
    ...byTone,
  };
}

function parseActionVoucherId(actionUrl: string): string | undefined {
  try {
    const url = new URL(actionUrl, 'https://charmebela.local');
    return url.searchParams.get('voucherId') || undefined;
  } catch {
    const match = actionUrl.match(/[?&]voucherId=([^&]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  }
}

/** Mapeia actionUrl do web para destino no app. */
export function resolveNotificationNav(
  actionUrl?: string
): { tab?: string; profileScreen?: string; stack?: string; applyVoucherId?: string } | null {
  if (!actionUrl) return null;
  const path = actionUrl.toLowerCase();
  if (path.includes('agenda')) return { tab: 'Agenda' };
  if (path.includes('historico')) return { tab: 'Profile', profileScreen: 'history' };
  if (path.includes('plano') || path.includes('pagamentos') || path.includes('/planos')) {
    return { stack: 'Plan' };
  }
  if (path.includes('servico') || path.includes('serviços') || path.includes('servicos')) {
    return { tab: 'Services', applyVoucherId: parseActionVoucherId(actionUrl) };
  }
  return null;
}

const POLL_INTERVAL_MS = 30_000;
/** Teto do backoff: 30s → 4min enquanto a rede estiver fora. */
const MAX_BACKOFF_STEPS = 3;

interface NotificationsPanelProps {
  visible: boolean;
  onClose: () => void;
  userId?: string | null;
  onUnreadCountChange?: (count: number) => void;
  onNavigate?: (target: NonNullable<ReturnType<typeof resolveNotificationNav>>) => void;
}

export function NotificationsPanel({
  visible,
  onClose,
  userId,
  onUnreadCountChange,
  onNavigate,
}: NotificationsPanelProps) {
  const [items, setItems] = useState<UiNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const failuresRef = useRef(0);

  const unreadCount = items.filter((n) => !n.read).length;

  const load = useCallback(async (silent = false) => {
    if (!userId) {
      setItems([]);
      onUnreadCountChange?.(0);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const data = await getNotifications({ userId, limit: 50 });
      failuresRef.current = 0;
      const sorted = [...data].sort(
        (a: AppNotification, b: AppNotification) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const formatted: UiNotification[] = sorted.map((n: AppNotification) => ({
        id: n.id,
        tone: mapTone(n.type),
        title: n.title,
        message: n.message,
        time: formatTimeAgo(n.createdAt),
        read: n.read,
        icon: n.icon,
        actionUrl: n.actionUrl,
      }));
      setItems(formatted);
      onUnreadCountChange?.(formatted.filter((n) => !n.read).length);
    } catch (error) {
      failuresRef.current += 1;
      // Poll contínuo: sem isso uma queda de rede enche o console com a
      // mesma linha até o app ser reiniciado.
      if (failuresRef.current === 1 || failuresRef.current % 10 === 0) {
        console.error(
          `Erro ao carregar notificações (falha ${failuresRef.current}):`,
          error instanceof Error ? error.message : error,
        );
      }
      if (!silent) setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, onUnreadCountChange]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const steps = Math.min(failuresRef.current, MAX_BACKOFF_STEPS);
      timer = setTimeout(tick, POLL_INTERVAL_MS * 2 ** steps);
    };

    const tick = async () => {
      if (cancelled) return;
      // Em background o poll não serve para nada (e o push cobre o aviso).
      if (AppState.currentState === 'active') await load(true);
      if (!cancelled) schedule();
    };

    void tick();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || cancelled) return;
      failuresRef.current = 0;
      void load(true);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      appStateSub.remove();
    };
  }, [userId, load]);

  useEffect(() => {
    if (visible && userId) void load();
  }, [visible, userId, load]);

  const markAsRead = async (id: string) => {
    try {
      await markNotificationAsRead(id);
      setItems((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        onUnreadCountChange?.(next.filter((n) => !n.read).length);
        return next;
      });
    } catch (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  };

  const handlePress = async (notification: UiNotification) => {
    if (!notification.read) await markAsRead(notification.id);
    const target = resolveNotificationNav(notification.actionUrl);
    if (target && onNavigate) {
      onClose();
      onNavigate(target);
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    try {
      await markAllNotificationsAsRead(userId);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      onUnreadCountChange?.(0);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível marcar todas como lidas.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Remover', 'Remover esta notificação?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNotification(id);
            setItems((prev) => {
              const next = prev.filter((n) => n.id !== id);
              onUnreadCountChange?.(next.filter((n) => !n.read).length);
              return next;
            });
          } catch {
            Alert.alert('Erro', 'Não foi possível remover.');
          }
        },
      },
    ]);
  };

  const handleClearAll = () => {
    if (!userId || items.length === 0) return;
    Alert.alert('Limpar tudo', 'Remover todas as notificações?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearAllNotifications(userId);
            setItems([]);
            onUnreadCountChange?.(0);
          } catch {
            Alert.alert('Erro', 'Não foi possível limpar.');
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Notificações</Text>
              <Text style={styles.unreadText}>
                {unreadCount === 0
                  ? 'Tudo em dia'
                  : `${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={brand.ink} />
            </TouchableOpacity>
          </View>

          {loading && items.length === 0 ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={brand.rose} size="large" />
            </View>
          ) : (
            <ScrollView
              style={styles.notificationsList}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    void load(true);
                  }}
                  tintColor={brand.rose}
                />
              }
            >
              {items.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="notifications-outline" size={64} color="#d1d5db" />
                  <Text style={styles.emptyStateText}>Nenhuma notificação</Text>
                  <Text style={styles.emptyHint}>
                    Avisos de agendamentos, pagamentos e plano aparecem aqui.
                  </Text>
                </View>
              ) : (
                items.map((notification) => {
                  const icon = iconFor(notification.icon, notification.tone);
                  return (
                    <TouchableOpacity
                      key={notification.id}
                      style={styles.notificationItem}
                      onPress={() => void handlePress(notification)}
                      onLongPress={() => handleDelete(notification.id)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.notificationIcon, { backgroundColor: icon.bg }]}>
                        <Ionicons name={icon.name} size={22} color={icon.color} />
                      </View>
                      <View style={styles.notificationContent}>
                        <View style={styles.titleRow}>
                          <Text style={styles.notificationTitle} numberOfLines={2}>
                            {notification.title}
                          </Text>
                          {!notification.read && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.notificationMessage} numberOfLines={3}>
                          {notification.message}
                        </Text>
                        <Text style={styles.notificationTime}>{notification.time}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}

          {items.length > 0 && (
            <View style={styles.footer}>
              {unreadCount > 0 && (
                <TouchableOpacity style={styles.footerButton} onPress={() => void markAllAsRead()}>
                  <Text style={styles.footerButtonText}>Marcar todas como lidas</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.footerButtonMuted} onPress={handleClearAll}>
                <Text style={styles.footerButtonMutedText}>Limpar todas</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: brand.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: brand.ink,
    marginBottom: 4,
  },
  unreadText: {
    fontSize: 13,
    color: brand.muted,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: brand.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationsList: {
    flexGrow: 0,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  notificationTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: brand.ink,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brand.rose,
  },
  notificationMessage: {
    fontSize: 14,
    color: brand.muted,
    lineHeight: 20,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: brand.muted,
    marginTop: 16,
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 4,
  },
  footerButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: brand.rose,
  },
  footerButtonMuted: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  footerButtonMutedText: {
    fontSize: 13,
    fontWeight: '600',
    color: brand.muted,
  },
});
