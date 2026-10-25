// PostgreSQL JSONB reorders object keys. Compare values rather than serialized key order
// so a retry after a lost completion response does not try to rewrite a completed draft.
export function hasDraftChanges(reviewed: unknown, saved: unknown): boolean {
  const serialize = (value: unknown) =>
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item,
    )
  return serialize(reviewed) !== serialize(saved)
}
