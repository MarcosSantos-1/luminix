import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import {
  getAppointments,
  getConfig,
  getPlans,
  getServices,
  getSubscription,
  getVouchers,
  getPackagePurchases,
  type Banner,
  type SystemConfig,
} from '../lib/api';
import type { Appointment, Plan, Service, Subscription, Voucher, PackagePurchase } from '../types/commercial';
import { getApiErrorMessage, isAmountCreditVoucher, isVoucherAvailable } from '../types/commercial';
import {
  bannersSignature,
  isBannerCacheFresh,
  loadClientBanners,
  readCachedClientBanners,
} from '../lib/bannerCache';
import { clinicInfoFromConfig, type ClinicInfo } from '../constants/clinicInfo';

interface CommercialContextValue {
  services: Service[];
  appointments: Appointment[];
  plans: Plan[];
  subscription: Subscription | null;
  vouchers: Voucher[];
  packagePurchases: PackagePurchase[];
  /** Banners da home (CLIENT) — prontos após o loading do gate. */
  clientBanners: Banner[];
  systemConfig: SystemConfig | null;
  clinicInfo: ClinicInfo;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CommercialContext = createContext<CommercialContextValue | null>(null);

/** Esconde voucher de uso único já vinculado a agendamento ou compra de pacote pendente. Crédito em R$ com saldo continua visível. */
function filterAvailableVouchers(
  vouchers: Voucher[],
  appointments: Appointment[],
  purchases: PackagePurchase[] = [],
): Voucher[] {
  const heldIds = new Set(
    [
      ...appointments
        .filter(
          (apt) =>
            Boolean(apt.voucherId) &&
            (apt.status === 'PENDING' || apt.status === 'CONFIRMED'),
        )
        .map((apt) => apt.voucherId as string),
      ...purchases
        .filter(
          (purchase) =>
            Boolean(purchase.voucherId) &&
            purchase.status !== 'CANCELED' &&
            purchase.status !== 'REFUNDED' &&
            (purchase.paymentStatus === 'PENDING' || purchase.paymentStatus === 'PAID'),
        )
        .map((purchase) => purchase.voucherId as string),
    ],
  );
  return vouchers.filter((voucher) => {
    if (!isVoucherAvailable(voucher)) return false;
    if (isAmountCreditVoucher(voucher)) return true;
    return !heldIds.has(voucher.id);
  });
}

export function CommercialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [packagePurchases, setPackagePurchases] = useState<PackagePurchase[]>([]);
  const [clientBanners, setClientBanners] = useState<Banner[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bannersFetchedAtRef = useRef(0);
  const bannersSigRef = useRef('');

  const applyBannersIfChanged = useCallback((banners: Banner[], fetchedAt: number) => {
    const sig = bannersSignature(banners);
    bannersFetchedAtRef.current = fetchedAt;
    if (sig === bannersSigRef.current) return;
    bannersSigRef.current = sig;
    setClientBanners(banners);
  }, []);

  const refreshBanners = useCallback(
    async (forceNetwork = false) => {
      const result = await loadClientBanners({ forceNetwork });
      applyBannersIfChanged(result.banners, result.fetchedAt);
    },
    [applyBannersIfChanged],
  );

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    setError(null);
    try {
      const [nextServices, nextAppointments, nextPlans, nextSubscription, nextVouchers, nextPurchases, nextConfig] = await Promise.all([
        getServices(),
        getAppointments({ userId: user.id, excludeHidden: true }),
        getPlans(),
        getSubscription(user.id),
        getVouchers(user.id),
        getPackagePurchases(user.id),
        getConfig().catch(() => null),
      ]);
      setServices(nextServices);
      setAppointments(nextAppointments);
      setPlans(nextPlans);
      setSubscription(nextSubscription);
      setVouchers(filterAvailableVouchers(nextVouchers, nextAppointments, nextPurchases));
      setPackagePurchases(nextPurchases);
      setSystemConfig(nextConfig);

      // Pull-to-refresh: força rede nos banners (sem limpar UI antes)
      await refreshBanners(true);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Não foi possível carregar seus dados'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, refreshBanners]);

  /** Primeira carga: cache de banners + rede comercial em paralelo, só libera loading no fim. */
  const bootstrap = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);

    // Hidrata banners do disco imediatamente (sem flash vazio se já houver cache)
    const cached = await readCachedClientBanners();
    if (cached?.banners?.length) {
      applyBannersIfChanged(cached.banners, cached.fetchedAt);
    }

    try {
      const forceBanners = !cached || !isBannerCacheFresh(cached.fetchedAt);
      const commercialPromise = Promise.all([
        getServices(),
        getAppointments({ userId: user.id, excludeHidden: true }),
        getPlans(),
        getSubscription(user.id),
        getVouchers(user.id),
        getPackagePurchases(user.id),
        getConfig().catch(() => null),
      ]);
      const bannersPromise = refreshBanners(forceBanners).catch((err) => {
        console.warn('[Commercial] banners no bootstrap', err);
      });

      const [[nextServices, nextAppointments, nextPlans, nextSubscription, nextVouchers, nextPurchases, nextConfig]] = await Promise.all([
        commercialPromise,
        bannersPromise,
      ]);

      setServices(nextServices);
      setAppointments(nextAppointments);
      setPlans(nextPlans);
      setSubscription(nextSubscription);
      setVouchers(filterAvailableVouchers(nextVouchers, nextAppointments, nextPurchases));
      setPackagePurchases(nextPurchases);
      setSystemConfig(nextConfig);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Não foi possível carregar seus dados'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, applyBannersIfChanged, refreshBanners]);

  useEffect(() => {
    if (user?.id) {
      void bootstrap();
      return;
    }
    setServices([]);
    setAppointments([]);
    setPlans([]);
    setSubscription(null);
    setVouchers([]);
    setPackagePurchases([]);
    setClientBanners([]);
    setSystemConfig(null);
    bannersSigRef.current = '';
    bannersFetchedAtRef.current = 0;
    setError(null);
    setLoading(false);
  }, [bootstrap, user?.id]);

  // Volta ao app: revalida dados; banners só se o cache estiver velho (sem limpar UI)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !user?.id) return;
      void (async () => {
        try {
          const [nextServices, nextAppointments, nextPlans, nextSubscription, nextVouchers, nextPurchases, nextConfig] = await Promise.all([
            getServices(),
            getAppointments({ userId: user.id, excludeHidden: true }),
            getPlans(),
            getSubscription(user.id),
            getVouchers(user.id),
            getPackagePurchases(user.id),
            getConfig().catch(() => null),
          ]);
          setServices(nextServices);
          setAppointments(nextAppointments);
          setPlans(nextPlans);
          setSubscription(nextSubscription);
          setVouchers(filterAvailableVouchers(nextVouchers, nextAppointments, nextPurchases));
          setPackagePurchases(nextPurchases);
          setSystemConfig(nextConfig);

          if (!isBannerCacheFresh(bannersFetchedAtRef.current)) {
            await refreshBanners(true);
          }
        } catch {
          // silencioso em background
        }
      })();
    });
    return () => sub.remove();
  }, [user?.id, refreshBanners]);

  const clinicInfo = useMemo(() => clinicInfoFromConfig(systemConfig), [systemConfig]);

  const value = useMemo(
    () => ({
      services,
      appointments,
      plans,
      subscription,
      vouchers,
      packagePurchases,
      clientBanners,
      systemConfig,
      clinicInfo,
      loading,
      refreshing,
      error,
      refresh,
    }),
    [services, appointments, plans, subscription, vouchers, packagePurchases, clientBanners, systemConfig, clinicInfo, loading, refreshing, error, refresh],
  );

  return <CommercialContext.Provider value={value}>{children}</CommercialContext.Provider>;
}

export function useCommercial() {
  const context = useContext(CommercialContext);
  if (!context) throw new Error('useCommercial deve ser usado dentro de CommercialProvider');
  return context;
}
