export function clampGuestCount(value: number) {
  return Math.max(1, Math.min(10, value));
}
