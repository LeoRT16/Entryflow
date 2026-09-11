const REQUIRED_REPORTING_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "REPORTING_WORKSPACE_USER_ID",
] as const;

export function hasReportingRuntimeConfig(env: Record<string, string | undefined> = process.env): boolean {
  return REQUIRED_REPORTING_ENV.every((name) => Boolean(env[name]?.trim()));
}
