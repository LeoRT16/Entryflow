export type AccessNamespace = "boliche" | "accreditation" | "unknown";

export function classifyAccessNamespace(rawValue: string): AccessNamespace {
  const normalized = rawValue.trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (normalized.startsWith("qr_")) {
    return "boliche";
  }

  if (normalized.startsWith("acc1_")) {
    return "accreditation";
  }

  return "unknown";
}
