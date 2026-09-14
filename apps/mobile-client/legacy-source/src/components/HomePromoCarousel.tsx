import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  HOME_BANNER_ASPECT_RATIO,
  HOME_BANNER_BORDER_RADIUS,
} from '../constants/homeBanner';
import type { Banner } from '../lib/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HORIZONTAL_PADDING = 20;
const SLIDE_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;
/** Permanência mínima por slide no autoplay. */
const AUTOPLAY_MS = 6000;

type HomePromoCarouselProps = {
  banners: Banner[];
  /**
   * Configuração pendente (ex.: login de recuperação).
   * Quando presente: 1º slide e autoplay desligado (só swipe manual).
   */
  configSlide?: ReactNode;
  /** Slide do plano / sem plano — depois dos banners de promoção */
  planSlide?: ReactNode;
  autoplayMs?: number;
  onBannerPress?: (banner: Banner) => void;
};

type Slide =
  | { key: string; kind: 'config' }
  | { key: string; kind: 'banner'; banner: Banner }
  | { key: string; kind: 'plan' };

/**
 * Card principal em carrossel.
 * Ordem: config (se houver) → banners promo → plano.
 */
export function HomePromoCarousel({
  banners,
  configSlide,
  planSlide,
  autoplayMs = AUTOPLAY_MS,
  onBannerPress,
}: HomePromoCarouselProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pauseUntilRef = useRef(0);

  const slides = useMemo(() => {
    const list: Slide[] = [];
    if (configSlide) list.push({ key: 'config', kind: 'config' });
    for (const banner of banners) {
      list.push({ key: banner.id, kind: 'banner', banner });
    }
    if (planSlide) list.push({ key: 'plan', kind: 'plan' });
    return list;
  }, [banners, configSlide, planSlide]);

  const autoplayEnabled = !configSlide;

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    setIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides.length]);

  useEffect(() => {
    if (!autoplayEnabled || slides.length <= 1) return;
    const id = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      const next = (indexRef.current + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: next * SLIDE_WIDTH, animated: true });
      setIndex(next);
    }, autoplayMs);
    return () => clearInterval(id);
  }, [autoplayEnabled, slides.length, autoplayMs]);

  if (slides.length === 0) return null;

  const renderSlide = (slide: Slide) => (
    <View key={slide.key} style={styles.slide}>
      {slide.kind === 'config'
        ? configSlide
        : slide.kind === 'plan'
          ? planSlide
          : (
            <Pressable
              style={{ flex: 1 }}
              onPress={() => {
                if (slide.banner.machineKind || slide.banner.linkPath) {
                  onBannerPress?.(slide.banner);
                }
              }}
            >
              <Image
                source={{ uri: slide.banner.imageUrl }}
                style={styles.bannerImage}
                resizeMode="cover"
              />
            </Pressable>
          )}
    </View>
  );

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    setIndex(Math.max(0, Math.min(next, slides.length - 1)));
  };

  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        {slides.length === 1 ? (
          renderSlide(slides[0])
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={() => {
              if (autoplayEnabled) {
                pauseUntilRef.current = Date.now() + autoplayMs + 1500;
              }
            }}
            onMomentumScrollEnd={onScrollEnd}
            decelerationRate="fast"
            snapToInterval={SLIDE_WIDTH}
            snapToAlignment="start"
            disableIntervalMomentum
          >
            {slides.map((slide) => renderSlide(slide))}
          </ScrollView>
        )}

        {slides.length > 1 ? (
          <View style={styles.dots} pointerEvents="none">
            {slides.map((slide, i) => (
              <View
                key={slide.key}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  frame: {
    width: SLIDE_WIDTH,
    aspectRatio: HOME_BANNER_ASPECT_RATIO,
    borderRadius: HOME_BANNER_BORDER_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  slide: {
    width: SLIDE_WIDTH,
    height: '100%',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#ffffff',
  },
});
