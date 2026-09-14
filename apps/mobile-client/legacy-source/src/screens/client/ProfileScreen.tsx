import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useCommercial } from '../../contexts/CommercialContext';
import type { ClientTabParamList } from '../../navigation/ClientNavigator';
import { PersonalDataScreen } from './profile/PersonalDataScreen';
import { MyPlanScreen } from './profile/MyPlanScreen';
import { AnamnesisScreen } from './profile/AnamnesisScreen';
import { HistoryScreen } from './profile/HistoryScreen';
import { NotificationsScreen } from './profile/NotificationsScreen';
import { HelpCenterScreen } from './profile/HelpCenterScreen';
// LanguageScreen: escondido até i18n real (app só pt-BR por enquanto)
import { PrivacyScreen } from './profile/PrivacyScreen';
import { ContactModal } from '../../components/ContactModal';
import { ClinicInfoPanel } from '../../components/ClinicInfoPanel';
import { displayUserContact, displayUserName } from '../../lib/userDisplay';

function monthsBetween(start: Date, end: Date) {
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(0, months + (end.getDate() >= start.getDate() ? 0 : -1));
}

function nextBillingDate(startDate: string) {
  const start = new Date(startDate);
  const dayOfMonth = start.getDate();
  const next = new Date();
  next.setHours(12, 0, 0, 0);
  next.setDate(dayOfMonth);
  if (new Date().getDate() >= dayOfMonth) {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

type SubScreen = 'main' | 'personal-data' | 'plan' | 'anamnesis' | 'history' | 'notifications' | 'help' | 'privacy';

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { appointments, subscription, clinicInfo } = useCommercial();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<ClientTabParamList, 'Profile'>>();
  const navigation = useNavigation<any>();
  const [currentScreen, setCurrentScreen] = useState<SubScreen>('main');
  const [showContactModal, setShowContactModal] = useState(false);
  const [showClinicInfo, setShowClinicInfo] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const openScreenRef = useRef(route.params?.openScreen);
  openScreenRef.current = route.params?.openScreen;

  const profileStats = useMemo(() => {
    const completed = appointments.filter((item) => item.status === 'COMPLETED').length;
    const activeSub =
      subscription &&
      (subscription.status === 'ACTIVE' ||
        subscription.status === 'PAUSED' ||
        (subscription.status === 'CANCELED' &&
          subscription.endDate &&
          new Date(subscription.endDate) > new Date()));

    const monthsActive = subscription?.startDate
      ? monthsBetween(new Date(subscription.startDate), new Date())
      : 0;

    let billingValue = '—';
    let billingLabel = 'Sem plano';
    if (subscription?.status === 'CANCELED' && subscription.endDate) {
      billingValue = new Date(subscription.endDate).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });
      billingLabel = 'Acesso até';
    } else if (activeSub && subscription?.startDate) {
      billingValue = nextBillingDate(subscription.startDate).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });
      billingLabel = 'Próxima cobrança';
    } else if (subscription?.status === 'PAUSED') {
      billingValue = 'Pausado';
      billingLabel = 'Assinatura';
    }

    return { completed, monthsActive, billingValue, billingLabel };
  }, [appointments, subscription]);

  const resetToMain = useCallback(() => {
    setCurrentScreen('main');
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      const screen = openScreenRef.current;
      if (screen === 'history' || screen === 'anamnesis' || screen === 'plan') {
        setCurrentScreen(screen);
        openScreenRef.current = undefined;
        navigation.setParams({ openScreen: undefined });
      } else {
        resetToMain();
      }

      const unsubscribe = navigation.addListener('tabPress', resetToMain);
      return unsubscribe;
    }, [navigation, resetToMain])
  );

  const handleLogout = () => {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: signOut }
      ]
    );
  };

  // Renderizar sub-telas
  if (currentScreen === 'personal-data') {
    return <PersonalDataScreen onBack={() => setCurrentScreen('main')} />;
  }
  if (currentScreen === 'plan') {
    return <MyPlanScreen onBack={() => setCurrentScreen('main')} />;
  }
  if (currentScreen === 'anamnesis') {
    return <AnamnesisScreen onBack={() => setCurrentScreen('main')} />;
  }
  if (currentScreen === 'history') {
    return <HistoryScreen onBack={() => setCurrentScreen('main')} />;
  }
  if (currentScreen === 'notifications') {
    return <NotificationsScreen onBack={() => setCurrentScreen('main')} />;
  }
  if (currentScreen === 'help') {
    return (
      <HelpCenterScreen
        clinic={clinicInfo}
        onBack={() => setCurrentScreen('main')}
        onOpenPlan={() => setCurrentScreen('plan')}
        onOpenAnamnesis={() => setCurrentScreen('anamnesis')}
        onOpenServices={() => {
          setCurrentScreen('main');
          navigation.navigate('Services');
        }}
        onOpenContact={() => {
          setCurrentScreen('main');
          setShowContactModal(true);
        }}
      />
    );
  }
  if (currentScreen === 'privacy') {
    return <PrivacyScreen onBack={() => setCurrentScreen('main')} clinic={clinicInfo} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header rosa scrolla junto; fundo do ScrollView rosa evita “faixa branca” no bounce */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarText}>
                {displayUserName(user).charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.userName}>{displayUserName(user)}</Text>
            <Text style={styles.userEmail}>{displayUserContact(user)}</Text>
            {/* SaaS: este botão vira seletor/info da clínica ativa (multi-clínica). */}
            <TouchableOpacity
              style={styles.clinicButton}
              onPress={() => setShowClinicInfo(true)}
              activeOpacity={0.85}
            >
              <View style={styles.clinicLogoCircle}>
                <Image source={clinicInfo.logo} style={styles.clinicLogo} resizeMode="contain" />
              </View>
              <Text style={styles.clinicButtonText}>{clinicInfo.name}</Text>
              <Ionicons name="information-circle-outline" size={18} color="#fce7f3" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.body}>
          {/* Stats por cima do “corte” rosa */}
          <View style={styles.statsContainer}>
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profileStats.completed}</Text>
                <Text style={styles.statLabel}>Procedimentos</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profileStats.monthsActive}</Text>
                <Text style={styles.statLabel}>Meses ativo</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue} numberOfLines={1}>
                  {profileStats.billingValue}
                </Text>
                <Text style={styles.statLabel}>{profileStats.billingLabel}</Text>
              </View>
            </View>
          </View>

          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Minha Conta</Text>

            <View style={styles.menuSection}>
              <MenuItem
                icon="person-outline"
                title="Dados Pessoais"
                subtitle="Nome, email, telefone"
                onPress={() => setCurrentScreen('personal-data')}
              />
              <Divider />
              <MenuItem
                icon="card-outline"
                title="Plano e Pagamentos"
                subtitle="Gerenciar assinatura"
                onPress={() => setCurrentScreen('plan')}
              />
              <Divider />
              <MenuItem
                icon="document-text-outline"
                title="Ficha de Anamnese"
                subtitle="Histórico médico"
                onPress={() => setCurrentScreen('anamnesis')}
              />
              <Divider />
              <MenuItem
                icon="time-outline"
                title="Histórico"
                subtitle="Procedimentos realizados"
                onPress={() => setCurrentScreen('history')}
              />
            </View>

            <Text style={styles.sectionTitle}>Preferências</Text>

            <View style={styles.menuSection}>
              <MenuItem
                icon="notifications-outline"
                title="Notificações"
                subtitle="Lembretes e avisos"
                onPress={() => setCurrentScreen('notifications')}
              />
              <Divider />
              <MenuItem
                icon="moon-outline"
                title="Modo Escuro"
                subtitle="Em breve"
                disabled
              />
            </View>

            <Text style={styles.sectionTitle}>Suporte</Text>

            <View style={styles.menuSection}>
              <MenuItem
                icon="help-circle-outline"
                title="Central de Ajuda"
                subtitle="FAQ e tutoriais"
                onPress={() => setCurrentScreen('help')}
              />
              <Divider />
              <MenuItem
                icon="chatbubbles-outline"
                title="Fale Conosco"
                subtitle="WhatsApp e email"
                onPress={() => setShowContactModal(true)}
              />
              <Divider />
              <MenuItem
                icon="shield-checkmark-outline"
                title="Privacidade"
                subtitle="Termos e política"
                onPress={() => setCurrentScreen('privacy')}
              />
              <Divider />
              <MenuItem
                icon="information-circle-outline"
                title="Sobre o App"
                subtitle="Versão 1.0.0"
              />
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <View style={styles.logoutIcon}>
                <Ionicons name="log-out-outline" size={24} color="#ef4444" />
              </View>
              <View style={styles.logoutContent}>
                <Text style={styles.logoutText}>Sair da Conta</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <ContactModal
        visible={showContactModal}
        onClose={() => setShowContactModal(false)}
        clinic={clinicInfo}
      />
      <ClinicInfoPanel
        visible={showClinicInfo}
        onClose={() => setShowClinicInfo(false)}
        clinic={clinicInfo}
      />
    </View>
  );
}

function MenuItem({ 
  icon, 
  title, 
  subtitle, 
  disabled = false,
  onPress
}: { 
  icon: string; 
  title: string; 
  subtitle: string; 
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity 
      style={[styles.menuItem, disabled && styles.menuItemDisabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={styles.menuIcon}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={24} color="#6b7280" />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#ec4899',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
  },
  avatarLarge: {
    width: 96,
    height: 96,
    backgroundColor: '#fce7f3',
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#ec4899',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
    textAlign: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 8,
  },
  userEmail: {
    fontSize: 14,
    color: '#fce7f3',
    textAlign: 'center',
  },
  clinicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#db2777',
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: 24,
    marginTop: 16,
    gap: 10,
  },
  clinicLogoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clinicLogo: {
    width: 22,
    height: 22,
  },
  clinicButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  body: {
    flexGrow: 1,
    backgroundColor: '#f9fafb',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 0,
    marginTop: -8,
  },
  statsContainer: {
    paddingHorizontal: 24,
    marginTop: -28,
    marginBottom: 24,
    zIndex: 20,
  },
  statsCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ec4899',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
  },
  content: {
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 80,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
  },
  logoutIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#fef2f2',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  logoutContent: {
    flex: 1,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ef4444',
  },
});
