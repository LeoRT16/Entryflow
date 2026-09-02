export function clampGuestCount(value: number, maximum = 10) {
  return Math.max(1, Math.min(maximum, value));
}
