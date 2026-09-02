import type { Event } from "@/features/domain/types";

export type CommercialBenefit = {
  id: string;
  label: string;
  quantity: number;
};

export type EventCommercialConfig = {
  version: 1;
  currency: string;
  reservation: {
    basePrice: number;
    includedAccesses: number;
    benefits: CommercialBenefit[];
  };
  presale: {
    enabled: boolean;
    pricePerAccess: number;
  };
};

export type ReservationCommercialSnapshot = {
  version: 1;
  saleType?: "reservation" | "presale";
  currency: string;
  reservationPrice: number;
  unitPrice?: number;
  quantity?: number;
  totalPrice?: number;
  includedAccesses: number;
  benefits: CommercialBenefit[];
};

export const defaultEventCommercialConfig: EventCommercialConfig = {
  version: 1,
  currency: "BOB",
  reservation: { basePrice: 0, includedAccesses: 5, benefits: [] },
  presale: { enabled: false, pricePerAccess: 0 },
};

function asNonNegativeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeBenefitId(label: string, index: number) {
  const slug = label.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "benefit"}-${index + 1}`;
}

export function normalizeCommercialBenefits(value: unknown): CommercialBenefit[] {
  if (!Array.isArray(value)) return [];

  const used = new Set<string>();
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!label) return [];
    const baseId = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : normalizeBenefitId(label, index);
    let id = baseId;
    let suffix = 2;
    while (used.has(id)) id = `${baseId}-${suffix++}`;
    used.add(id);
    return [{ id, label, quantity: Math.max(0, Math.floor(asNonNegativeNumber(raw.quantity, 1))) }];
  });
}

export function getEventCommercialConfig(event: Pick<Event, "metadata">): EventCommercialConfig {
  const raw = event.metadata?.commercial;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return structuredClone(defaultEventCommercialConfig);
  const commercial = raw as Record<string, unknown>;
  const reservation = commercial.reservation && typeof commercial.reservation === "object" ? commercial.reservation as Record<string, unknown> : {};
  const presale = commercial.presale && typeof commercial.presale === "object" ? commercial.presale as Record<string, unknown> : {};
  return {
    version: 1,
    currency: typeof commercial.currency === "string" && commercial.currency.trim() ? commercial.currency.trim() : "BOB",
    reservation: {
      basePrice: asNonNegativeNumber(reservation.basePrice),
      includedAccesses: Math.floor(asNonNegativeNumber(reservation.includedAccesses, 5)),
      benefits: normalizeCommercialBenefits(reservation.benefits),
    },
    presale: {
      enabled: presale.enabled === true,
      pricePerAccess: asNonNegativeNumber(presale.pricePerAccess),
    },
  };
}

export function mergeEventCommercialConfig(metadata: Event["metadata"], config: EventCommercialConfig): Record<string, unknown> & { commercial: EventCommercialConfig } {
  return {
    ...(metadata ?? {}),
    commercial: {
      ...config,
      reservation: { ...config.reservation, benefits: normalizeCommercialBenefits(config.reservation.benefits) },
    },
  };
}

export function createReservationCommercialSnapshot(config: EventCommercialConfig): ReservationCommercialSnapshot {
  return {
    version: 1,
    currency: config.currency,
    reservationPrice: config.reservation.basePrice,
    includedAccesses: config.reservation.includedAccesses,
    benefits: normalizeCommercialBenefits(config.reservation.benefits),
  };
}

export function createPresaleCommercialSnapshot(config: EventCommercialConfig, quantity: number): ReservationCommercialSnapshot {
  const normalizedQuantity = Math.max(0, Math.floor(quantity));
  const unitPrice = config.presale.pricePerAccess;

  return {
    version: 1,
    saleType: "presale",
    currency: config.currency,
    reservationPrice: unitPrice,
    unitPrice,
    quantity: normalizedQuantity,
    totalPrice: unitPrice * normalizedQuantity,
    includedAccesses: normalizedQuantity,
    benefits: [],
  };
}
