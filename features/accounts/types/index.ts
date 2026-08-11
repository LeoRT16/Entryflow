import type { Json, ProfileRow, RoleRow, UserRow } from "@/lib/supabase/types";

export const ACCOUNT_PERMISSION_KEYS = [
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
] as const;

export type AccountPermissionKey = (typeof ACCOUNT_PERMISSION_KEYS)[number];

export type AccountRoleSlug = "owner" | "administrator" | "reception" | "door" | string;

export type AccountProfileAttributes = {
  area?: string;
  title?: string;
  status?: "active" | "inactive";
  permissions?: AccountPermissionKey[];
  bootstrap?: boolean;
  notes?: string;
  [key: string]: Json | undefined;
};

export type AccountRolePreset = {
  id: string;
  slug: AccountRoleSlug;
  name: string;
  description?: string;
  permissions: AccountPermissionKey[];
  metadata?: Record<string, unknown>;
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  userId: string;
  roleId: string;
  displayName: string;
  attributes: AccountProfileAttributes;
  status: "active" | "inactive";
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type OrganizationAccount = {
  id: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  displayName: string;
  roleId: string;
  roleSlug: AccountRoleSlug;
  roleName: string;
  rolePermissions: AccountPermissionKey[];
  permissions: AccountPermissionKey[];
  attributes: AccountProfileAttributes;
  status: "active" | "inactive";
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type AccountUserRow = UserRow;
export type AccountProfileRow = ProfileRow;
export type AccountRoleRow = RoleRow;
