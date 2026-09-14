import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '../../../theme/brand';
import {
  formClipboardSource,
  formHeartFilledSource,
} from '../../../assets/brandAssets';

const HIGHLIGHTS = [
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Mais segurança',
    text: 'Suas respostas ajudam a garantir tratamentos mais seguros para você.',
  },
  {
    icon: 'time-outline' as const,
    title: 'Rápido e prático',
    text: 'Leva apenas alguns minutos e você pode pausar quando quiser.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Privacidade garantida',
    text: 'Suas informações são confidenciais e ficam protegidas com a gente.',
  },
];

export function WelcomeIntro() {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        {HIGHLIGHTS.map((item, index) => (
          <View key={item.title}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.row}>
              <View style={styles.iconCircle}>
                <Ionicons name={item.icon} size={20} color={brand.rose} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowBody}>{item.text}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.illustrationWrap}>
        <Image
          source={formClipboardSource}
          style={styles.clipboard}
          resizeMode="contain"
        />
      </View>

      <View style={styles.mottoRow}>
        <Image
          source={formHeartFilledSource}
          style={styles.mottoHeart}
          resizeMode="contain"
        />
        <Text style={styles.motto}>
          Vamos cuidar da sua{' '}
          <Text style={styles.mottoAccent}>melhor versão</Text>!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 22 },
  card: {
    backgroundColor: brand.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    shadowColor: '#2b1721',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(43, 23, 33, 0.08)',
    marginLeft: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fde8f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 3, paddingTop: 2 },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: brand.ink,
  },
  rowBody: {
    fontSize: 13,
    lineHeight: 18,
    color: brand.muted,
  },
  illustrationWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  clipboard: {
    width: 148,
    height: 168,
  },
  mottoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  mottoHeart: {
    width: 22,
    height: 20,
  },
  motto: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: brand.ink,
    fontWeight: '500',
    textAlign: 'center',
  },
  mottoAccent: {
    color: brand.rose,
    fontWeight: '700',
  },
});
