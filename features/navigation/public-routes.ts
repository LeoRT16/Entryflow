const PUBLIC_ROUTE_PREFIXES = ["/login", "/auth/", "/privacy", "/data-deletion"] as const;

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PREFIXES.some((route) => (route.endsWith("/") ? pathname.startsWith(route) : pathname === route));
}
