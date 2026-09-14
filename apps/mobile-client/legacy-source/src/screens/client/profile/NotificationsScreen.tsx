import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useAuth } from '../../../contexts/AuthContext';
import { clearAllNotifications, updateUser } from '../../../lib/api';
import { brand } from '../../../theme/brand';

const PREFS_KEY = 'notification_prefs_v1';

type NotificationPrefs = {
  pushAll: boolean;
  appointmentReminders: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  pushAll: true,
  appointmentReminders: true,
};

const SWITCH_TRACK = { false: '#e5e7eb', true: brand.rose };
const SWITCH_THUMB = '#ffffff';

export function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const { user, setUserProfile } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Prefs do backend têm prioridade quando o usuário está logado
        if (user) {
          const fromServer: NotificationPrefs = {
            pushAll: user.pushAllEnabled ?? true,
            appointmentReminders: user.appointmentRemindersEnabled ?? true,
          };
          if (!cancelled) {
            setPrefs(fromServer);
            await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(fromServer));
          }
          return;
        }
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
          setPrefs({ ...DEFAULT_PREFS, ...parsed });
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.pushAllEnabled, user?.appointmentRemindersEnabled]);

  const persist = useCallback(
    async (next: NotificationPrefs) => {
      setPrefs(next);
      try {
        await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      if (!user?.id) return;
      try {
        const updated = await updateUser(user.id, {
          pushAllEnabled: next.pushAll,
          appointmentRemindersEnabled: next.appointmentReminders,
        });
        await setUserProfile(updated);
      } catch {
        // UI já refletiu; sync pode falhar offline
      }
    },
    [user?.id, setUserProfile],
  );

  const setPref = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    if (key === 'pushAll' && !value) {
      next.appointmentReminders = false;
    }
    if (key === 'appointmentReminders' && value) {
      next.pushAll = true;
    }
    void persist(next);
  };

  const handleClearInbox = () => {
    if (!user?.id) {
      Alert.alert('Atenção', 'Faça login para limpar as notificações.');
      return;
    }
    Alert.alert(
      'Limpar notificações',
      'Remover todas as notificações da sua caixa de entrada?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllNotifications(user.id);
              Alert.alert('Pronto', 'Notificações removidas.');
            } catch {
              Alert.alert('Erro', 'Não foi possível limpar agora.');
            }
          },
        },
      ]
    );
  };

  if (!loaded) {
    return (
      <View style={styles.container}>
        <ScreenHeader>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={brand.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notificações</Text>
          <View style={styles.placeholder} />
        </ScreenHeader>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={brand.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificações</Text>
        <View style={styles.placeholder} />
      </ScreenHeader>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificações no aparelho</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Todas as notificações</Text>
              <Text style={styles.settingSubtitle}>
                Ativar avisos push e no app
              </Text>
            </View>
            <Switch
              value={prefs.pushAll}
              onValueChange={(v) => setPref('pushAll', v)}
              trackColor={SWITCH_TRACK}
              thumbColor={SWITCH_THUMB}
              ios_backgroundColor="#e5e7eb"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, !prefs.pushAll && styles.dimmed]}>
                Lembretes de agendamento
              </Text>
              <Text style={styles.settingSubtitle}>Avisos sobre próximos horários</Text>
            </View>
            <Switch
              value={prefs.appointmentReminders && prefs.pushAll}
              onValueChange={(v) => setPref('appointmentReminders', v)}
              disabled={!prefs.pushAll}
              trackColor={SWITCH_TRACK}
              thumbColor={SWITCH_THUMB}
              ios_backgroundColor="#e5e7eb"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.clearButton} onPress={handleClearInbox}>
          <Text style={styles.clearButtonText}>Limpar todas as notificações</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: brand.ink,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: brand.ink,
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingInfo: {
    flex: 1,
    paddingRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: brand.ink,
    marginBottom: 2,
  },
  dimmed: {
    color: '#9ca3af',
  },
  settingSubtitle: {
    fontSize: 13,
    color: brand.muted,
  },
  clearButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 16,
    margin: 20,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
});
