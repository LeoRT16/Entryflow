import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = resolve(ROOT, "reports", "bootstrap-accounts");

const ROLE_PRESETS = [
  {
    id: "preset-owner",
    slug: "owner",
    name: "Owner",
    description: "Acceso total y protecciones especiales para la propiedad de la organización.",
    permissions: [
      "organization.view",
      "organization.manage",
      "venue.view",
      "venue.manage",
      "event.view",
      "event.create",
      "event.edit",
      "event.delete",
      "reservation.view",
      "reservation.create",
      "reservation.edit",
      "reservation.cancel",
      "guest.view",
      "guest.create",
      "guest.edit",
      "guest.remove",
      "resource.view",
      "resource.assign",
      "resource.manage",
      "access.view",
      "access.issue",
      "access.revoke",
      "access.regenerate",
      "checkin.view",
      "checkin.perform",
      "operations.view",
      "dashboard.view",
      "timeline.view",
      "statistics.view",
      "settings.view",
      "settings.manage",
      "accounts.view",
      "accounts.manage",
      "permissions.manage",
    ],
    metadata: { isOwner: true },
  },
  {
    id: "preset-administrator",
    slug: "administrator",
    name: "Administrador",
    description: "Preset amplio para operación y configuración.",
    permissions: [
      "organization.view",
      "organization.manage",
      "venue.view",
      "venue.manage",
      "event.view",
      "event.create",
      "event.edit",
      "event.delete",
      "reservation.view",
      "reservation.create",
      "reservation.edit",
      "reservation.cancel",
      "guest.view",
      "guest.create",
      "guest.edit",
      "guest.remove",
      "resource.view",
      "resource.assign",
      "resource.manage",
      "access.view",
      "access.issue",
      "access.revoke",
      "access.regenerate",
      "checkin.view",
      "checkin.perform",
      "operations.view",
      "dashboard.view",
      "timeline.view",
      "statistics.view",
      "settings.view",
      "settings.manage",
      "accounts.view",
      "accounts.manage",
    ],
  },
  {
    id: "preset-reception",
    slug: "reception",
    name: "Recepción",
    description: "Preset orientado a atención, reservas e ingreso.",
    permissions: [
      "reservation.view",
      "reservation.create",
      "reservation.edit",
      "guest.view",
      "guest.create",
      "guest.edit",
      "resource.view",
      "resource.assign",
      "access.view",
      "access.issue",
      "access.regenerate",
      "checkin.view",
      "checkin.perform",
      "dashboard.view",
      "timeline.view",
    ],
  },
  {
    id: "preset-door",
    slug: "door",
    name: "Puerta",
    description: "Preset reducido para validar ingresos en puerta.",
    permissions: [
      "reservation.view",
      "guest.view",
      "resource.view",
      "access.view",
      "checkin.view",
      "checkin.perform",
      "dashboard.view",
    ],
  },
];

function uuidFromName(name) {
  const seed = String(name ?? "");
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const first = (hash >>> 0).toString(16).padStart(8, "0");
  const second = (Math.imul(hash ^ 0x9e3779b1, 0x85ebca6b) >>> 0).toString(16).padStart(8, "0");
  const third = (Math.imul(hash ^ 0xc2b2ae35, 0x27d4eb2f) >>> 0).toString(16).padStart(8, "0");
  const fourth = (Math.imul(hash ^ 0x165667b1, 0x94d049bb) >>> 0).toString(16).padStart(8, "0");
  const hex = `${first}${second}${third}${fourth}`;

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function buildHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

async function fetchJson(url, key, table, query = "*") {
  const response = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(query)}`, {
    headers: buildHeaders(key),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to read ${table}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function upsertRows(url, key, table, rows, onConflict) {
  if (!rows.length) {
    return [];
  }

  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: {
      ...buildHeaders(key),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to upsert ${table}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function writeReport(report, name = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`) {
  await mkdir(REPORT_DIR, { recursive: true });
  const filePath = resolve(REPORT_DIR, name);
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  const [organizations, users, roles, profiles] = await Promise.all([
    fetchJson(url, key, "organizations"),
    fetchJson(url, key, "users"),
    fetchJson(url, key, "roles"),
    fetchJson(url, key, "profiles"),
  ]);

  const report = {
    generatedAt: nowIso(),
    organizations: organizations.length,
    roles: roles.length,
    users: users.length,
    profiles: profiles.length,
    actions: [],
  };

  const existingRoleSlugs = new Set(roles.map((role) => role.slug));
  const roleRows = ROLE_PRESETS.filter((role) => !existingRoleSlugs.has(role.slug)).map((role) => ({
    id: uuidFromName(role.slug),
    slug: role.slug,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    metadata: role.metadata ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  }));

  if (roleRows.length) {
    await upsertRows(url, key, "roles", roleRows, "slug");
    report.actions.push({ table: "roles", createdOrReused: roleRows.length, mode: "seed" });
  }

  const ownerRole = { ...ROLE_PRESETS.find((role) => role.slug === "owner"), id: uuidFromName("owner") };
  for (const organization of organizations) {
    const activeProfile = profiles.find((profile) => profile.organization_id === organization.id && profile.deleted_at === null);
    const ownerProfile = profiles.find((profile) => profile.organization_id === organization.id && profile.metadata?.bootstrapOwner === true && profile.deleted_at === null);

    if (ownerProfile) {
      report.actions.push({ table: "profiles", organizationId: organization.id, action: "reused existing bootstrap owner", profileId: ownerProfile.id });
      continue;
    }

    const bootstrapSlug = normalizeSlug(organization.slug || organization.name || organization.id);
    const email = `owner+${bootstrapSlug || organization.id}@entryflow.local`;
    const existingUser = users.find((user) => user.email.toLowerCase() === email.toLowerCase() && user.deleted_at === null);
    const userId = existingUser?.id ?? crypto.randomUUID();

    if (!existingUser) {
      await upsertRows(url, key, "users", [{
        id: userId,
        email,
        display_name: `${organization.name} Owner`,
        avatar_url: null,
        metadata: { bootstrapOwner: true, organizationId: organization.id },
        created_at: nowIso(),
        updated_at: nowIso(),
        deleted_at: null,
      }], "id");
      report.actions.push({ table: "users", organizationId: organization.id, action: "created bootstrap owner user", userId, email });
    }

    const profileId = crypto.randomUUID();
    const profileRow = {
      id: profileId,
      user_id: userId,
      organization_id: organization.id,
      role_id: ownerRole.id,
      display_name: `${organization.name} Owner`,
      metadata: {
        bootstrap: true,
        bootstrapOwner: true,
        permissions: ownerRole.permissions,
        attributes: {
          area: "dirección",
          status: "active",
        },
      },
      created_at: nowIso(),
      updated_at: nowIso(),
      deleted_at: null,
    };

    await upsertRows(url, key, "profiles", [profileRow], "id");
    report.actions.push({ table: "profiles", organizationId: organization.id, action: "created bootstrap owner profile", profileId });

    if (activeProfile) {
      report.actions.push({ table: "profiles", organizationId: organization.id, action: "existing active profile preserved", profileId: activeProfile.id });
    }
  }

  const reportPath = await writeReport(report);
  console.log(JSON.stringify({ reportPath, report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
