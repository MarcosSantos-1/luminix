import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand } from '../../theme/brand';
import { logoSource } from '../../assets/brandAssets';
import { PageIndicator } from './PageIndicator';

interface ScheduleStepProps {
  total: number;
  current: number;
  onSelect: (i: number) => void;
  onAccess: () => void;
  width: number;
}

export function ScheduleStep({
  total,
  current,
  onSelect,
  onAccess,
  width,
}: ScheduleStepProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.slide, { width }]}>
      <LinearGradient
        colors={[brand.blush, brand.background, brand.background]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orb} />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 12) + 16,
          },
        ]}
      >
        <View style={styles.badge}>
          <Ionicons name="notifications-outline" size={14} color={brand.ink} />
          <Text style={styles.badgeText}>A praticidade</Text>
        </View>

        <View style={styles.notifs}>
          <View style={styles.notifMain}>
            <View style={styles.notifIconMain}>
              <Image source={logoSource} style={styles.notifLogo} resizeMode="contain" />
            </View>
            <View style={styles.notifBody}>
              <View style={styles.notifHeader}>
                <Text style={styles.notifTitle}>Charme & Bela</Text>
                <Text style={styles.notifTime}>agora</Text>
              </View>
              <Text style={styles.notifCopy}>
                Seu atendimento é hoje às <Text style={styles.notifHighlight}>14h</Text>. Lembramos
                você!
              </Text>
            </View>
          </View>

          <View style={[styles.notifSecondary, { marginLeft: 16 }]}>
            <View style={[styles.notifIconSec, { backgroundColor: 'rgba(201, 162, 75, 0.15)' }]}>
              <Ionicons name="calendar-outline" size={18} color="#8a5a2d" />
            </View>
            <Text style={styles.notifSecText}>Remarcação confirmada para quinta, 16h</Text>
          </View>

          <View style={[styles.notifSecondary, { marginLeft: 32 }]}>
            <View style={[styles.notifIconSec, { backgroundColor: 'rgba(236, 73, 152, 0.15)' }]}>
              <Ionicons name="notifications" size={18} color={brand.rose} />
            </View>
            <Text style={styles.notifSecText}>Seu plano VIP renova em 3 dias</Text>
          </View>
        </View>

        <Text style={styles.title}>Sem preocupações na agenda.</Text>
        <View style={styles.copyRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={brand.rose} />
          <Text style={styles.copy}>
            Receba lembretes automáticos e gerencie remarcações sem precisar mandar mensagem no
            WhatsApp.
          </Text>
        </View>

        <View style={styles.footer}>
          <PageIndicator total={total} current={current} onSelect={onSelect} />
          <TouchableOpacity style={styles.primaryBtn} onPress={onAccess} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>Acessar</Text>
            <Ionicons name="arrow-forward" size={20} color={brand.white} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    top: 32,
    left: -64,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: brand.rose,
    opacity: 0.12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: brand.blush,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: brand.ink,
  },
  notifs: {
    marginTop: 8,
    gap: 12,
  },
  notifMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
    padding: 16,
    shadowColor: brand.rose,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  notifIconMain: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: brand.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifLogo: {
    width: 26,
    height: 26,
    tintColor: brand.white,
  },
  notifBody: {
    flex: 1,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: brand.ink,
  },
  notifTime: {
    fontSize: 11,
    color: brand.muted,
  },
  notifCopy: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: brand.muted,
  },
  notifHighlight: {
    fontWeight: '600',
    color: brand.ink,
  },
  notifSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 16,
    padding: 14,
  },
  notifIconSec: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifSecText: {
    flex: 1,
    fontSize: 13,
    color: brand.ink,
  },
  title: {
    marginTop: 28,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    color: brand.ink,
  },
  copyRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  copy: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: brand.muted,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: 16,
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: brand.rose,
    borderRadius: 999,
    paddingVertical: 16,
    shadowColor: brand.rose,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryBtnText: {
    color: brand.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
