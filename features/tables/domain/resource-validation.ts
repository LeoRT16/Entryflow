export function normalizeResourceName(name: string) {
  return name.trim();
}

export function canPersistResourceName(name: string) {
  return normalizeResourceName(name).length > 0;
}
