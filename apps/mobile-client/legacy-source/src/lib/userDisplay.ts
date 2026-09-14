/** Helpers for phone-auth accounts and display names. */

const PHONE_LOCAL_SUFFIX = '@phone.charmebela.local';

export function isPhoneLocalEmail(email?: string | null): boolean {
  return Boolean(email && email.endsWith(PHONE_LOCAL_SUFFIX));
}

/**
 * Apple/Firebase OAuth às vezes envia o nome em x-www-form-urlencoded
 * ("Marcos+Vinicius+Silva") em vez de espaços.
 */
export function normalizePersonName(value?: string | null): string {
  if (!value) return '';
  let name = value.trim();
  if (!name) return '';

  if (/%[0-9A-Fa-f]{2}/.test(name)) {
    try {
      name = decodeURIComponent(name);
    } catch {
      // mantém o valor atual
    }
  }

  // Apple/Firebase: espaço vira '+' — inclusive misturado ("Marcos+Vinicius Silva+dos")
  name = name.replace(/\+/g, ' ');
  return name.replace(/\s+/g, ' ').trim();
}

/** True when a string looks like a phone number (E.164 or digits-only), not a person name. */
export function looksLikePhoneName(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (/^\+?\d[\d\s().-]{7,}$/.test(trimmed)) return true;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 10 && digits.length === trimmed.replace(/[+\s().-]/g, '').length;
}

/** DDD + número real. Rejeita placeholder tipo (11) 99999-9999. */
export function isPlausibleBrPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  const local =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;
  if (local.length !== 10 && local.length !== 11) return false;
  if (local[0] === '0') return false;
  const subscriber = local.slice(2);
  if (!subscriber || /^(\d)\1+$/.test(subscriber)) return false;
  if (local.length === 11 && subscriber[0] !== '9') return false;
  return true;
}

export function isValidContactEmail(email?: string | null): boolean {
  const value = (email || '').trim();
  if (!value || value.toLowerCase().endsWith('@phone.charmebela.local')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function formatPhoneDisplay(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // BR mobile with country code
  if (digits.length === 13 && digits.startsWith('55')) {
    const local = digits.slice(2);
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    const local = digits.slice(2);
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** Prefer real name; never show raw phone as "name". */
export function displayUserName(user?: { name?: string | null } | null, fallback = 'Usuária'): string {
  const name = normalizePersonName(user?.name);
  if (!name || looksLikePhoneName(name)) return fallback;
  return name;
}

export function displayUserFirstName(
  user?: { name?: string | null } | null,
  fallback = 'Usuária',
): string {
  return displayUserName(user, fallback).split(/\s+/)[0];
}

/** Subtitle under profile name: real email, or formatted phone for phone-auth. */
export function displayUserContact(user?: {
  email?: string | null;
  phone?: string | null;
} | null): string {
  if (!user) return '';
  if (user.email && !isPhoneLocalEmail(user.email)) return user.email;
  if (user.phone) return formatPhoneDisplay(user.phone);
  if (user.email && isPhoneLocalEmail(user.email)) {
    const digits = user.email.split('@')[0];
    return formatPhoneDisplay(digits) || 'Conta por celular';
  }
  return '';
}

/** Prefill phone field: prefer phone, else extract from fake local email. */
export function phonePrefillFromUser(user?: {
  email?: string | null;
  phone?: string | null;
} | null): string {
  if (user?.phone) {
    const digits = user.phone.replace(/\D/g, '');
    // strip country code 55 for BR mask in forms (11 digits)
    const local = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
    return formatLocalPhoneMask(local);
  }
  if (user?.email && isPhoneLocalEmail(user.email)) {
    const digits = user.email.split('@')[0].replace(/\D/g, '');
    const local = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
    return formatLocalPhoneMask(local);
  }
  return '';
}

function formatLocalPhoneMask(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d{0,2})/, '($1');
  if (d.length <= 7) return d.replace(/(\d{2})(\d{0,5})/, '($1) $2');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}
