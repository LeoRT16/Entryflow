export function buildPostAuthRedirect(origin: string, next: string, type: string | null) {
  if (type === "invite" || type === "recovery") {
    const setupUrl = new URL("/auth/setup-password", origin);
    setupUrl.searchParams.set("next", next);
    return setupUrl;
  }

  return new URL(next, origin);
}
