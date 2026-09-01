This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Supabase migrations

Vercel deploys the application only. Production database migrations are handled
by `.github/workflows/supabase-migrations.yml` when migration files change on
`main`, or through a deliberate `workflow_dispatch` run. The workflow performs
static preflight, then waits for the protected GitHub `production` environment
before it runs the authenticated migration list, dry-run, one real `db push`,
and post-apply verification. It exits on failure and never runs automatic
retries or `migration repair`.

One-time GitHub setup:

1. Create the `production` environment in repository Settings > Environments.
2. Add required production reviewers to that environment. Approval happens when
   the production job starts, before its authenticated preflight and apply steps.
3. Add `SUPABASE_ACCESS_TOKEN` as a production environment secret.
4. Add `SUPABASE_DB_PASSWORD` as a production environment secret.
5. Add `SUPABASE_PROJECT_REF` as a production environment variable.
6. Keep Actions permission to read repository contents; no write permission is
   required.

The access token and database password must never be committed or printed. A
migration failure stops the workflow: inspect remote migration history and
schema, do not edit an applied migration or blindly retry, and use a reviewed
forward-fix migration when needed. Rollback is not assumed; destructive or
nontransactional migrations require additional explicit review.
