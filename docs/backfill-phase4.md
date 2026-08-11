# Fase 4 - Backfill + Validation

This phase is split into three modes:

- `dry-run`: reads the live Supabase data, resolves the legacy model against the new layout model, and writes a JSON audit report.
- `apply`: reuses the exact same resolution logic, writes the new layout rows, and produces a pre-apply snapshot before any write.
- `rollback`: reverts only the changes written by a specific `apply` batch.

## Safety rules

- `dry-run` never writes to Supabase.
- `apply` must be run only after reviewing the approved dry-run report.
- `rollback` only reverts the batch captured in the matching snapshot.
- Legacy columns remain untouched during `dry-run`.
- The current runtime and UX are not modified by the backfill tooling.

## Run the dry-run

```bash
source .env.local
node scripts/backfill-phase4.mjs dry-run
```

The command prints a human-readable summary and writes a JSON report under:

`reports/backfill-phase4/`

## Apply and rollback

Once a dry-run report has been approved, apply it with:

```bash
source .env.local
node scripts/backfill-phase4.mjs apply --report reports/backfill-phase4/<approved-dry-run-report>.json
```

The apply step writes a pre-apply snapshot before touching Supabase and then writes a result report under `reports/backfill-phase4/`.

If you need to revert that batch, use:

```bash
source .env.local
node scripts/backfill-phase4.mjs rollback --snapshot reports/backfill-phase4/<apply-snapshot>.json
```

## What the dry-run validates

- venue resolution per event
- venue preset creation/reuse
- event snapshot creation/reuse
- reservation-to-resource mapping
- duplicate active reservations per resource
- orphan resources and sectors
- duplicate names for review

## Rollback strategy for the future apply

The eventual `apply` step must:

- use deterministic IDs derived from legacy source IDs
- upsert by those deterministic IDs
- keep `reservations.table_id` unchanged
- only write bridge columns and layout snapshots
- preserve a reversible batch trail in metadata and in the apply snapshot

## Known legacy conflicts

The current dataset already contains multiple active reservations on the same resource for the same event. These are reported in dry-run and must not be auto-corrected.
