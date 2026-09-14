export type ServiceCategory = 'COMBO' | 'FACIAL' | 'CORPORAL' | 'MASSAGEM';
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
export type AppointmentOrigin = 'SUBSCRIPTION' | 'SINGLE' | 'VOUCHER' | 'ADMIN_CREATED' | 'PACKAGE';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | null;
export type SubscriptionStatus = 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'PAUSED';

export interface PackageItemSnapshot {
  serviceId: string;
  name: string;
  durationMinutes: number;
  category: string;
  sortOrder: number;
}

export interface PackageItem {
  id?: string;
  includedServiceId: string;
  durationMinutes: number;
  sortOrder: number;
  includedService?: {
    id: string;
    name: string;
    category: ServiceCategory;
    duration: number;
  };
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  duration: number;
  price: number;
  isActive: boolean;
  machineKind?: 'LASER' | 'CRYO' | null;
  allowOnSubscription?: boolean;
  packageSessionCount?: number | null;
  installmentsAllowed?: boolean;
  packageItems?: PackageItem[];
}

export interface PackagePurchase {
  id: string;
  userId: string;
  packageServiceId: string;
  packageService?: Service;
  sessionCount: number;
  sessionsScheduled: number;
  remainingSessions: number;
  pricePaid: number;
  paymentStatus: Exclude<PaymentStatus, null>;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'REFUNDED';
  voucherId?: string | null;
  voucherAmountApplied?: number | null;
  itemsSnapshot?: PackageItemSnapshot[];
  items?: PackageItemSnapshot[];
  appointments?: Appointment[];
  paymentExpiresAt?: string | null;
  createdAt?: string;
  activated?: boolean;
}

export function isActivatedPackage(purchase: PackagePurchase) {
  if (purchase.activated === true) return true;
  if (purchase.activated === false) return false;
  if (purchase.paymentStatus !== 'PAID') return false;
  if (purchase.status === 'CANCELED' || purchase.status === 'REFUNDED') return false;
  return (purchase.appointments || []).some(
    (item) => item.packageSessionIndex === 1 && item.status === 'COMPLETED'
  );
}

export function isPackageService(service: Pick<Service, 'category'>) {
  return service.category === 'COMBO';
}

export function packageItemsOf(service: Service): Array<{ name: string; durationMinutes: number }> {
  if (service.packageItems?.length) {
    return [...service.packageItems]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        name: item.includedService?.name || 'Procedimento',
        durationMinutes: item.durationMinutes,
      }));
  }
  return [];
}

export interface Voucher {
  id: string;
  userId: string;
  type: 'FREE_TREATMENT' | 'FREE_MONTH' | 'DISCOUNT';
  description: string;
  serviceId?: string | null;
  anyService: boolean;
  discountPercent?: number | null;
  discountAmount?: number | null;
  remainingAmount?: number | null;
  isUsed: boolean;
  expiresAt?: string | null;
}

export interface Appointment {
  id: string;
  userId: string;
  serviceId: string;
  service: Service;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  paymentStatus: PaymentStatus;
  paymentAmount?: number | null;
  paymentExpiresAt?: string | null;
  paymentMethod?: string | null;
  voucherId?: string | null;
  voucher?: Voucher | null;
  cancelReason?: string | null;
  settlementChoice?: 'REFUND' | 'CREDIT' | null;
  refundStatus?: 'NOT_APPLICABLE' | 'PROCESSING' | 'DONE' | 'MANUAL_REQUIRED';
  cancelPolicy?: {
    kind: 'machine' | 'standard';
    minCancellationHours?: number;
    lateCancelHours?: number;
    lateCancelFeePercent?: number;
    text: string;
    onTimeText?: string;
    latePaidText?: string;
    latePlanText?: string;
  };
  packagePurchaseId?: string | null;
  packageSessionIndex?: number | null;
  packagePurchase?: {
    id: string;
    sessionCount: number;
    sessionsScheduled: number;
    status: string;
    itemsSnapshot?: PackageItemSnapshot[];
  } | null;
}

export interface Plan {
  id: string;
  name: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  description: string;
  price: number;
  maxTreatmentsPerMonth: number;
  maxTreatmentsPerWeek: number;
  maxFacialPerMonth?: number | null;
  services: Service[];
  isActive: boolean;
}

/** Maior economia teórica ao usar a cota com os serviços inclusos mais caros. */
export function maxPlanSavingsPercent(plans: Plan[]): number {
  return plans.reduce((best, plan) => {
    const singleTotal = [...plan.services]
      .sort((a, b) => b.price - a.price)
      .slice(0, plan.maxTreatmentsPerMonth)
      .reduce((total, service) => total + service.price, 0);
    if (singleTotal <= 0 || plan.price >= singleTotal) return best;
    return Math.max(best, Math.floor(((singleTotal - plan.price) / singleTotal) * 100));
  }, 0);
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  plan: Plan;
  status: SubscriptionStatus;
  startDate: string;
  endDate?: string | null;
  nextDueDate?: string | null;
  cancelInProgress?: boolean;
  pastDueSince?: string | null;
  graceDaysLeft?: number | null;
  pendingPlanId?: string | null;
  pendingPlan?: Plan | null;
  pendingChangeAt?: string | null;
  minimumCommitmentEnd?: string | null;
  canceledAt?: string | null;
  currentMonthUsage: { totalTreatments: number };
  limits: { maxPerMonth: number; maxPerDay: number };
  remaining: { thisMonth: number; byMonth?: Record<string, number> };
  stripeSubscriptionId?: string | null;
  scheduled?: boolean;
  isUpgrade?: boolean;
  effectiveAt?: string;
  oldPlan?: string;
  newPlan?: string;
  message?: string;
}

export interface AvailableSlots {
  date: string;
  serviceId?: string;
  slots: string[];
  bookedSlots: string[];
  available?: boolean;
  reason?: string;
}

export interface PaymentMethod {
  id: string;
  brand?: string;
  last4?: string;
  nickname?: string | null;
  kind?: 'credit' | 'debit' | string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  updatedAt?: string;
}

export function cardBrandLabel(brandName?: string | null) {
  const value = (brandName || '').toLowerCase();
  if (value.includes('master')) return 'Mastercard';
  if (value.includes('visa')) return 'Visa';
  if (value.includes('amex') || value.includes('american')) return 'Amex';
  if (value.includes('elo')) return 'Elo';
  if (value.includes('hiper')) return 'Hipercard';
  if (value.includes('diners')) return 'Diners';
  return brandName ? brandName : 'Cartão';
}

export function savedCardLabel(card: Pick<PaymentMethod, 'nickname' | 'brand' | 'last4'>) {
  const nick = card.nickname?.trim();
  if (nick) return nick;
  const last4 = card.last4 ? `•••• ${card.last4}` : '';
  return `${cardBrandLabel(card.brand)}${last4 ? ` ${last4}` : ''}`.trim();
}

export function unnamedSavedCard(methods: PaymentMethod[]) {
  return methods
    .filter((method) => method.last4 && !method.nickname?.trim())
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
}

export interface PaymentHistoryItem {
  id: string;
  type: 'subscription' | 'single';
  amount: number;
  totalAmount: number;
  currency: string;
  status: string;
  description: string;
  paidAt?: string | null;
  createdAt: string;
  invoicePdf?: string | null;
  hostedInvoiceUrl?: string | null;
  receiptUrl?: string | null;
}

export interface CheckoutPayload {
  paymentId: string;
  sessionId: string;
  url: string | null;
  invoiceUrl: string | null;
  pixCopyPaste: string | null;
  pixQrBase64: string | null;
  expiresAt?: string | null;
  amount: number;
  description: string;
}

export const CATEGORY_META: Record<ServiceCategory, { label: string; color: string; icon: string }> = {
  COMBO: { label: 'Pacotes', color: '#64748b', icon: 'gift-outline' },
  FACIAL: { label: 'Faciais', color: '#8b5cf6', icon: 'face-woman-outline' },
  CORPORAL: { label: 'Corporais', color: '#3b82f6', icon: 'human' },
  MASSAGEM: { label: 'Massagens', color: '#10b981', icon: 'hand-heart-outline' },
};

export function isAmountCreditVoucher(voucher: Pick<Voucher, 'type' | 'discountAmount' | 'discountPercent'>): boolean {
  return (
    voucher.type === 'DISCOUNT' &&
    voucher.discountAmount != null &&
    !(Number(voucher.discountPercent) > 0)
  );
}

/** Saldo em R$ ainda utilizável (crédito reutilizável). */
export function voucherCreditBalance(
  voucher: Pick<Voucher, 'type' | 'discountAmount' | 'discountPercent' | 'remainingAmount' | 'isUsed'>,
): number {
  if (!isAmountCreditVoucher(voucher)) return 0;
  if (voucher.remainingAmount != null) return Number(voucher.remainingAmount);
  return voucher.isUsed ? 0 : Number(voucher.discountAmount || 0);
}

export function isVoucherAvailable(
  voucher: Pick<Voucher, 'type' | 'discountAmount' | 'discountPercent' | 'remainingAmount' | 'isUsed' | 'expiresAt' | 'description'>,
): boolean {
  if (voucher.type === 'FREE_TREATMENT' && voucher.description?.startsWith('Crédito para reagendar')) {
    return false;
  }
  if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) return false;
  if (isAmountCreditVoucher(voucher)) return voucherCreditBalance(voucher) > 0.009;
  return !voucher.isUsed;
}

export function getApiErrorMessage(error: unknown, fallback = 'Não foi possível concluir a operação') {
  const value = error as any;
  const data = value?.response?.data;
  return data?.details || data?.error || data?.message || value?.message || fallback;
}

/** Hold de checkout online ainda dentro dos 5 minutos. */
export function isOnlinePaymentHold(appointment: Pick<Appointment, 'origin' | 'status' | 'paymentStatus' | 'paymentExpiresAt'>) {
  if (appointment.origin === 'ADMIN_CREATED') return false;
  if (appointment.status !== 'PENDING' || appointment.paymentStatus !== 'PENDING' || !appointment.paymentExpiresAt) {
    return false;
  }
  return new Date(appointment.paymentExpiresAt).getTime() > Date.now();
}

/** Hold expirado ainda não cancelado no servidor (lag até o release). */
export function isExpiredUnpaidHold(appointment: Pick<Appointment, 'origin' | 'status' | 'paymentStatus' | 'paymentExpiresAt'>) {
  if (appointment.origin === 'ADMIN_CREATED') return false;
  if (appointment.status !== 'PENDING' || appointment.paymentStatus !== 'PENDING' || !appointment.paymentExpiresAt) {
    return false;
  }
  return new Date(appointment.paymentExpiresAt).getTime() <= Date.now();
}

/** Status efetivo para UI — hold expirado conta como Cancelado imediatamente. */
export function effectiveAppointmentStatus(
  appointment: Pick<Appointment, 'origin' | 'status' | 'paymentStatus' | 'paymentExpiresAt'>,
): AppointmentStatus {
  if (isExpiredUnpaidHold(appointment)) return 'CANCELED';
  return appointment.status;
}
