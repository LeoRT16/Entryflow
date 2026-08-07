export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function matchesText(value: string, query: string) {
  return normalizeText(value).includes(normalizeText(query));
}
