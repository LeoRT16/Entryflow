const LEGACY_REPORTING_ENV = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "REPORTING_WORKSPACE_USER_ID"] as const;

export function hasReportingRuntimeConfig(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function hasLegacyReportingRuntimeConfig(env: Record<string, string | undefined> = process.env): boolean {
  return LEGACY_REPORTING_ENV.every((name) => Boolean(env[name]?.trim()));
}
