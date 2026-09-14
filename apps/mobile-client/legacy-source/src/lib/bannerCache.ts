import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'react-native';
import { getBanners, type Banner } from './api';

const CACHE_KEY = '@charme/client_banners_v1';
/** Só revalida na rede se o cache estiver mais velho que isso. */
export const BANNER_CACHE_TTL_MS = 15 * 60 * 1000;

type BannerCachePayload = {
  fetchedAt: number;
  banners: Banner[];
};

export async function readCachedClientBanners(): Promise<BannerCachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BannerCachePayload;
    if (!parsed || !Array.isArray(parsed.banners) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedClientBanners(banners: Banner[]): Promise<void> {
  const payload: BannerCachePayload = {
    fetchedAt: Date.now(),
    banners,
  };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

export function isBannerCacheFresh(fetchedAt: number, ttlMs = BANNER_CACHE_TTL_MS): boolean {
  return Date.now() - fetchedAt < ttlMs;
}

/** Prefetch de URLs remotas; data: URLs já vêm embutidas no JSON. */
export async function prefetchBannerImages(banners: Banner[]): Promise<void> {
  await Promise.all(
    banners.map(async (banner) => {
      const uri = banner.imageUrl;
      if (!uri || uri.startsWith('data:')) return;
      try {
        await Image.prefetch(uri);
      } catch {
        // ignora — slide ainda pode tentar carregar depois
      }
    }),
  );
}

/**
 * Carrega banners CLIENT: cache → rede (se stale/forçado) → prefetch → persiste.
 * Nunca limpa a UI para [] no meio do caminho — o caller decide o que aplicar.
 */
export async function loadClientBanners(options?: {
  forceNetwork?: boolean;
}): Promise<{ banners: Banner[]; fromCache: boolean; fetchedAt: number }> {
  const cached = await readCachedClientBanners();
  const cacheFresh = cached ? isBannerCacheFresh(cached.fetchedAt) : false;

  if (cached && cacheFresh && !options?.forceNetwork) {
    await prefetchBannerImages(cached.banners);
    return { banners: cached.banners, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  try {
    const banners = await getBanners({ location: 'CLIENT', activeOnly: true });
    const list = Array.isArray(banners) ? banners : [];
    await prefetchBannerImages(list);
    await writeCachedClientBanners(list);
    return { banners: list, fromCache: false, fetchedAt: Date.now() };
  } catch (error) {
    if (cached) {
      await prefetchBannerImages(cached.banners);
      return { banners: cached.banners, fromCache: true, fetchedAt: cached.fetchedAt };
    }
    throw error;
  }
}

export function bannersSignature(banners: Banner[]): string {
  return banners.map((b) => `${b.id}:${b.updatedAt ?? ''}:${b.imageUrl.length}:${b.isActive}`).join('|');
}
