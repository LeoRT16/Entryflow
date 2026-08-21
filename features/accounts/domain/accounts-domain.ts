import type {
  AccountPermissionKey,
  AccountRolePreset,
  AccountRoleSlug,
  OrganizationAccount,
} from "@/features/accounts/types";

export const ACCOUNT_PERMISSION_GROUPS: Array<{
  id: string;
  label: string;
  permissions: Array<{ key: AccountPermissionKey; label: string; description: string }>;
}> = [
  {
    id: "organization",
    label: "Organización",
    permissions: [
      { key: "organization.view", label: "Ver organización", description: "Consultar la organización activa." },
      { key: "organization.manage", label: "Configurar organización", description: "Editar datos y configuración de la organización." },
    ],
  },
  {
    id: "venue",
    label: "Espacios",
    permissions: [
      { key: "venue.view", label: "Ver espacios", description: "Ver venues, sectores y recursos." },
      { key: "venue.manage", label: "Gestionar espacios", description: "Editar la estructura física y sus recursos." },
    ],
  },
  {
    id: "events",
    label: "Eventos",
    permissions: [
      { key: "event.view", label: "Ver eventos", description: "Abrir y consultar eventos." },
      { key: "event.create", label: "Crear eventos", description: "Crear nuevos eventos." },
      { key: "event.edit", label: "Editar eventos", description: "Modificar eventos existentes." },
      { key: "event.delete", label: "Eliminar eventos", description: "Eliminar eventos cuando sea seguro." },
    ],
  },
  {
    id: "reservations",
    label: "Reservas",
    permissions: [
      { key: "reservation.view", label: "Ver reservas", description: "Consultar reservas." },
      { key: "reservation.create", label: "Crear reservas", description: "Crear nuevas reservas." },
      { key: "reservation.edit", label: "Editar reservas", description: "Modificar reservas existentes." },
      { key: "reservation.cancel", label: "Cancelar reservas", description: "Cancelar reservas cuando corresponda." },
    ],
  },
  {
    id: "guests",
    label: "Invitados",
    permissions: [
      { key: "guest.view", label: "Ver invitados", description: "Consultar el padrón de invitados." },
      { key: "guest.create", label: "Agregar invitados", description: "Agregar invitados manualmente." },
      { key: "guest.edit", label: "Editar invitados", description: "Editar datos de invitados." },
      { key: "guest.remove", label: "Eliminar invitados", description: "Retirar invitados del registro." },
    ],
  },
  {
    id: "resources",
    label: "Recursos",
    permissions: [
      { key: "resource.view", label: "Ver recursos", description: "Ver mesas y recursos físicos." },
      { key: "resource.assign", label: "Asignar mesa", description: "Asignar o cambiar recursos en una reserva." },
      { key: "resource.manage", label: "Gestionar recursos", description: "Crear o editar la estructura de recursos." },
    ],
  },
  {
    id: "access",
    label: "Access",
    permissions: [
      { key: "access.view", label: "Ver acceso", description: "Consultar estado de acceso e invitaciones." },
      { key: "access.issue", label: "Emitir accesos", description: "Generar o reemitir invitaciones/accesos." },
      { key: "access.revoke", label: "Revocar accesos", description: "Anular accesos emitidos." },
      { key: "access.regenerate", label: "Regenerar accesos", description: "Regenerar códigos o QR." },
    ],
  },
  {
    id: "checkin",
    label: "Ingreso",
    permissions: [
      { key: "checkin.view", label: "Ver ingreso", description: "Consultar estado operativo de check-in." },
      { key: "checkin.perform", label: "Realizar check-in", description: "Validar QR, accessCode o ingreso manual." },
    ],
  },
  {
    id: "ops",
    label: "Operación",
    permissions: [
      { key: "operations.view", label: "Ver operaciones", description: "Abrir la consola operativa." },
      { key: "dashboard.view", label: "Ver dashboard", description: "Consultar el panel principal." },
      { key: "timeline.view", label: "Ver timeline", description: "Ver el historial cronológico." },
      { key: "statistics.view", label: "Ver estadísticas", description: "Consultar métricas e indicadores." },
    ],
  },
  {
    id: "settings",
    label: "Configuración",
    permissions: [
      { key: "settings.view", label: "Ver ajustes", description: "Acceder a Settings." },
      { key: "settings.manage", label: "Modificar ajustes", description: "Cambiar la configuración operativa." },
    ],
  },
  {
    id: "accounts",
    label: "Equipo",
    permissions: [
      { key: "accounts.view", label: "Ver equipo", description: "Consultar usuarios y cuentas." },
      { key: "accounts.manage", label: "Administrar cuentas", description: "Crear o editar cuentas de la organización." },
      { key: "permissions.manage", label: "Administrar permisos", description: "Ajustar permisos efectivos por cuenta." },
    ],
  },
];

export const ACCOUNT_ROLE_PRESETS: AccountRolePreset[] = [
  {
    id: "preset-owner",
    slug: "owner",
    name: "Owner",
    description: "Control total de la organización. El último Owner activo queda protegido.",
    permissions: ACCOUNT_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key)),
    metadata: { isOwner: true },
  },
  {
    id: "preset-administrator",
    slug: "administrator",
    name: "Administrador",
    description: "Acceso administrativo amplio sin gestión de permisos de nivel propietario.",
    permissions: ACCOUNT_PERMISSION_GROUPS.flatMap((group) =>
      group.permissions
        .map((permission) => permission.key)
        .filter((permission) => permission !== "permissions.manage"),
    ),
  },
  {
    id: "preset-reception",
    slug: "reception",
    name: "Recepción",
    description: "Operación de recepción, reservas e ingreso.",
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
    description: "Operación centrada en admisión y check-in.",
    permissions: [
      "guest.view",
      "access.view",
      "checkin.view",
      "checkin.perform",
      "dashboard.view",
    ],
  },
];

export const BUILTIN_ACCOUNT_ROLE_SLUGS = new Set<AccountRoleSlug>(ACCOUNT_ROLE_PRESETS.map((role) => role.slug));

export function getPermissionLabel(permission: AccountPermissionKey) {
  for (const group of ACCOUNT_PERMISSION_GROUPS) {
    const match = group.permissions.find((item) => item.key === permission);
    if (match) {
      return match.label;
    }
  }

  return permission;
}

export function getPermissionGroup(permission: AccountPermissionKey) {
  return ACCOUNT_PERMISSION_GROUPS.find((group) => group.permissions.some((item) => item.key === permission));
}

export function getRolePresetBySlug(slug: string | undefined | null) {
  return ACCOUNT_ROLE_PRESETS.find((role) => role.slug === slug) ?? ACCOUNT_ROLE_PRESETS[1];
}

export function normalizeAccountPermissions(input: unknown, fallback: AccountPermissionKey[]) {
  if (!Array.isArray(input)) {
    return [...fallback];
  }

  const allowed = new Set(getAllAccountPermissionKeys());
  return input.filter((value): value is AccountPermissionKey => typeof value === "string" && allowed.has(value as AccountPermissionKey));
}

export function getAllAccountPermissionKeys() {
  return ACCOUNT_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key));
}

export function hasSameAccountPermissionSet(left: AccountPermissionKey[], right: AccountPermissionKey[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  for (const permission of leftSet) {
    if (!rightSet.has(permission)) {
      return false;
    }
  }

  return true;
}

function expandDerivedPermissions(permissions: AccountPermissionKey[]) {
  const expanded = new Set(permissions);

  if (expanded.has("venue.view") || expanded.has("venue.manage")) {
    expanded.add("resource.view");
  }

  return [...expanded];
}

export function canonicalizeAccountPermissionsForPersistence({
  permissions,
  rolePermissions,
}: {
  permissions: unknown;
  rolePermissions: AccountPermissionKey[];
}) {
  const normalizedPermissions = normalizeAccountPermissions(permissions, rolePermissions);
  const selectedPermissions = new Set(normalizedPermissions);

  if (selectedPermissions.has("venue.view") || selectedPermissions.has("venue.manage")) {
    selectedPermissions.delete("resource.view");
  }

  return [...selectedPermissions];
}

export function getAccountEditablePermissions({
  rolePermissions,
  metadata,
}: Pick<OrganizationAccount, "rolePermissions" | "metadata">) {
  const permissionsSource = typeof metadata?.permissionsSource === "string" ? metadata.permissionsSource : null;

  if (permissionsSource === "custom") {
    return canonicalizeAccountPermissionsForPersistence({
      permissions: metadata?.permissions,
      rolePermissions,
    });
  }

  return [...rolePermissions];
}

export function isBuiltinAccountRoleSlug(slug: string | undefined | null): slug is AccountRoleSlug {
  return typeof slug === "string" && BUILTIN_ACCOUNT_ROLE_SLUGS.has(slug as AccountRoleSlug);
}

export function resolveAccountPermissions({
  permissions,
  rolePermissions,
  roleMetadata,
  accountMetadata,
}: {
  permissions: unknown;
  rolePermissions: AccountPermissionKey[];
  roleMetadata?: Record<string, unknown> | null;
  accountMetadata?: Record<string, unknown> | null;
}) {
  const normalizedPermissions = normalizeAccountPermissions(permissions, rolePermissions);
  const explicitSource = typeof accountMetadata?.permissionsSource === "string" ? accountMetadata.permissionsSource : null;
  const legacyPermissions = normalizeAccountPermissions(roleMetadata?.legacyPermissions, rolePermissions);

  if (explicitSource === "custom") {
    return expandDerivedPermissions(normalizedPermissions);
  }

  if (!normalizedPermissions.length) {
    return expandDerivedPermissions([...rolePermissions]);
  }

  if (explicitSource === "preset") {
    return expandDerivedPermissions([...rolePermissions]);
  }

  if (legacyPermissions.length && hasSameAccountPermissionSet(normalizedPermissions, legacyPermissions) && !hasSameAccountPermissionSet(normalizedPermissions, rolePermissions)) {
    return expandDerivedPermissions([...rolePermissions]);
  }

  if (hasSameAccountPermissionSet(normalizedPermissions, rolePermissions)) {
    return expandDerivedPermissions([...rolePermissions]);
  }

  return expandDerivedPermissions(normalizedPermissions);
}

export function getEffectivePermissions(account: Pick<OrganizationAccount, "permissions" | "rolePermissions">) {
  const permissions = account.permissions.length ? account.permissions : account.rolePermissions;
  return expandDerivedPermissions(Array.from(new Set(permissions)));
}

export function hasPermission(account: Pick<OrganizationAccount, "permissions" | "rolePermissions">, permission: AccountPermissionKey) {
  return getEffectivePermissions(account).includes(permission);
}

export function isOwnerAccount(account: Pick<OrganizationAccount, "roleSlug" | "metadata" | "rolePermissions">) {
  return account.roleSlug === "owner" || Boolean(account.metadata?.bootstrap) || account.rolePermissions.length === getAllAccountPermissionKeys().length;
}

export function getCriticalSelfMutationBlockReason({
  currentAccount,
  targetAccountId,
  targetUserId,
  nextStatus,
  nextRoleSlug,
  nextPermissions,
  action = "status",
}: {
  currentAccount: Pick<OrganizationAccount, "id" | "userId" | "isOwner"> & {
    permissions: ReadonlyArray<AccountPermissionKey>;
  };
  targetAccountId: string;
  targetUserId?: string;
  nextStatus: "active" | "inactive";
  nextRoleSlug: AccountRoleSlug;
  nextPermissions: ReadonlyArray<AccountPermissionKey>;
  action?: "status" | "delete";
}) {
  const isSelfMutation = currentAccount.id === targetAccountId || (targetUserId ? currentAccount.userId === targetUserId : false);

  if (!isSelfMutation) {
    return null;
  }

  if (action === "delete") {
    return "No podés eliminar tu propia cuenta.";
  }

  if (nextStatus === "inactive") {
    return "No podés desactivarte a vos mismo.";
  }

  if (currentAccount.isOwner && nextRoleSlug !== "owner") {
    return "No podés quitarte el rol Owner de tu propia cuenta.";
  }

  if (currentAccount.permissions.includes("accounts.manage") && !nextPermissions.includes("accounts.manage")) {
    return "No podés quitarte accounts.manage de tu propia cuenta.";
  }

  if (currentAccount.permissions.includes("permissions.manage") && !nextPermissions.includes("permissions.manage")) {
    return "No podés quitarte permissions.manage de tu propia cuenta.";
  }

  return null;
}

export function getAccountStatusLabel(status: "active" | "inactive") {
  return status === "active" ? "Activo" : "Inactivo";
}

export function getAccountPresetLabel(slug: string) {
  return getRolePresetBySlug(slug).name;
}

export function getAccountPresetDescription(slug: string) {
  return getRolePresetBySlug(slug).description ?? "";
}

export function createBootstrapAttributes(area = "dirección") {
  return {
    area,
    status: "active" as const,
    bootstrap: true,
  };
}
