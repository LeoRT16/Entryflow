export type QrDetectionGate = {
  shouldAccept(value: string): boolean;
  reset(): void;
};

export function createQrDetectionGate(): QrDetectionGate {
  let locked = false;

  return {
    shouldAccept(value: string) {
      const normalized = value.trim();

      if (!normalized || locked) {
        return false;
      }

      locked = true;
      return true;
    },
    reset() {
      locked = false;
    },
  };
}
