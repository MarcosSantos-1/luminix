import { ReactNode } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '../../../theme/brand';
import { KeyboardForm, dismissKeyboard } from '../../../components/KeyboardForm';

interface AnamnesisShellProps {
  badge: string;
  emoji?: string;
  /** Ionicons name used in the badge (welcome screen). */
  badgeIcon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Decorative image rendered beside the title (e.g. outline heart). */
  titleAccessory?: ImageSourcePropType;
  stepIndex: number;
  stepTotal: number;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  hideBack?: boolean;
  scrollable?: boolean;
  /** Soft white + pink blobs — only used on the welcome step for now. */
  variant?: 'default' | 'welcome';
}

export function AnamnesisShell({
  badge,
  emoji,
  badgeIcon,
  title,
  subtitle,
  titleAccessory,
  stepIndex,
  stepTotal,
  children,
  onBack,
  onNext,
  nextLabel = 'Continuar',
  nextDisabled = false,
  nextLoading = false,
  hideBack = false,
  variant = 'default',
}: AnamnesisShellProps) {
  const insets = useSafeAreaInsets();
  const progress = Math.max(0.08, (stepIndex + 1) / stepTotal);
  const isWelcome = variant === 'welcome';

  const handleNext = () => {
    dismissKeyboard();
    onNext();
  };

  const handleBack = () => {
    dismissKeyboard();
    onBack?.();
  };

  const footer = (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
      <View style={styles.actions}>
        {!hideBack && onBack ? (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.backText}>Voltar</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={handleNext}
          disabled={nextDisabled || nextLoading}
          style={[
            styles.nextBtn,
            (nextDisabled || nextLoading) && styles.nextDisabled,
          ]}
          activeOpacity={0.9}
        >
          {nextLoading ? (
            <ActivityIndicator color={brand.white} />
          ) : (
            <>
              <Text style={styles.nextText}>{nextLabel}</Text>
              <Ionicons name="arrow-forward" size={20} color={brand.white} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, isWelcome && styles.rootWelcome]}>
      {isWelcome ? (
        <>
          <View style={[styles.blob, styles.blobTop]} />
          <View style={[styles.blob, styles.blobBottom]} />
        </>
      ) : (
        <>
          <LinearGradient
            colors={[brand.blush, brand.background, brand.champagne]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.orb, styles.orbRose]} />
          <View style={[styles.orb, styles.orbGold]} />
        </>
      )}

      <View style={[styles.inner, { paddingTop: insets.top + 16 }]}>
        <View style={[styles.progressTrack, isWelcome && styles.progressTrackWelcome]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>
          {stepIndex + 1} de {stepTotal}
        </Text>

        <KeyboardForm
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          footer={footer}
        >
          <View style={styles.content}>
            <View style={[styles.badge, isWelcome && styles.badgeWelcome]}>
              {badgeIcon ? (
                <Ionicons name={badgeIcon} size={14} color={brand.rose} />
              ) : emoji ? (
                <Text style={styles.badgeEmoji}>{emoji}</Text>
              ) : null}
              <Text style={styles.badgeText}>{badge}</Text>
            </View>

            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.title,
                  isWelcome && styles.titleWelcome,
                  titleAccessory ? styles.titleFlex : null,
                ]}
              >
                {title}
              </Text>
              {titleAccessory ? (
                <Image
                  source={titleAccessory}
                  style={styles.titleAccessory}
                  resizeMode="contain"
                />
              ) : null}
            </View>

            {subtitle ? (
              <Text style={[styles.subtitle, isWelcome && styles.subtitleWelcome]}>
                {subtitle}
              </Text>
            ) : null}
            <View style={styles.fields}>{children}</View>
          </View>
        </KeyboardForm>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  rootWelcome: { backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 28 },
  orb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  orbRose: {
    top: -60,
    right: -80,
    backgroundColor: 'rgba(236, 73, 152, 0.14)',
  },
  orbGold: {
    bottom: 120,
    left: -100,
    backgroundColor: 'rgba(230, 201, 138, 0.22)',
  },
  blob: {
    position: 'absolute',
    backgroundColor: 'rgba(253, 220, 233, 0.55)',
  },
  blobTop: {
    width: 280,
    height: 220,
    borderRadius: 140,
    top: -70,
    right: -90,
    transform: [{ rotate: '18deg' }],
  },
  blobBottom: {
    width: 340,
    height: 260,
    borderRadius: 160,
    bottom: 40,
    left: -120,
    backgroundColor: 'rgba(252, 228, 237, 0.7)',
    transform: [{ rotate: '-12deg' }],
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(236, 73, 152, 0.15)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressTrackWelcome: {
    backgroundColor: '#f8d7e6',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: brand.rose,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: brand.muted,
    marginBottom: 20,
  },
  content: { flexGrow: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: brand.blush,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  badgeWelcome: {
    backgroundColor: '#fde8f1',
  },
  badgeEmoji: { fontSize: 13 },
  badgeText: { fontSize: 12, fontWeight: '500', color: brand.ink },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: brand.ink,
    lineHeight: 34,
  },
  titleWelcome: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  titleFlex: { flex: 1 },
  titleAccessory: {
    width: 56,
    height: 48,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: brand.muted,
    marginBottom: 22,
  },
  subtitleWelcome: {
    marginBottom: 20,
  },
  fields: { gap: 14 },
  footer: { paddingTop: 12, paddingHorizontal: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  backText: { fontSize: 14, fontWeight: '500', color: brand.muted },
  nextBtn: {
    flex: 1,
    backgroundColor: brand.rose,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: brand.rose,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  nextDisabled: { opacity: 0.45 },
  nextText: { fontSize: 16, fontWeight: '600', color: brand.white },
});
