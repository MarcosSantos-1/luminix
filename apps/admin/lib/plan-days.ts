export function remainingPlanDays(end: number, now: number) {
  return Math.max(0, Math.ceil((end - now) / 86_400_000))
}
