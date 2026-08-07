export function formatCurrency(value: string) {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));

  if (!value || Number.isNaN(numeric)) {
    return "Bs 0";
  }

  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    maximumFractionDigits: 0,
  }).format(numeric);
}
