/**
 * Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
 * Keep the comparison server-only and fail closed when the secret is absent.
 */
export function authorizeReportingCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${expected}`;
}
