# Reporting production rollout

EntryFlow beta keeps Vercel Hobby and does not use Vercel Cron. The production
scheduler decision is Supabase `pg_cron` + `pg_net` calling the protected Node
endpoints:

- `GET /api/reporting/worker` every minute
- `GET /api/reporting/reconciliation` every ten minutes

This configuration is intentionally deferred until the production rollout
window. It must be configured manually after confirming the hosted Supabase
project supports `pg_cron`, `pg_net`, and Vault.

Required future configuration (never commit values):

- Vault: `CRON_SECRET`, `ENTRYFLOW_APP_URL`
- Vercel server environment: `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
  `REPORTING_WORKSPACE_USER_ID`, `CRON_SECRET`
- Remote migrations: `20260910000002` through `20260910000009`

Do not create cron jobs, configure production secrets, deploy, or create the
production destination as part of local development or CI.
