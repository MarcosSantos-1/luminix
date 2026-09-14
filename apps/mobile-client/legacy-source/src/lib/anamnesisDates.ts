/** Canonical storage: YYYY-MM-DD (calendar date, no timezone). */

function toSaoPauloYmd(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return date
    .toLocaleString('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .split(',')[0];
}

export function birthDateToYmd(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split('/');
    return `${y}-${m}-${d}`;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return toSaoPauloYmd(new Date(raw));
  }

  return toSaoPauloYmd(new Date(raw));
}

export function formatBirthDateBr(value: unknown): string | null {
  const ymd = birthDateToYmd(value);
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function maskBirthDateInput(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return formatBirthDateBr(trimmed) || '';
  }
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
