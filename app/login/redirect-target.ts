export function sanitizeRedirectTarget(next: string | null) {
  if (!next || typeof next !== "string") {
    return "/";
  }

  const trimmed = next.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  return trimmed;
}

