import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseWorkspaceRepositories } from "@/repositories/supabase-workspace-repositories";
import type { Database } from "@/lib/supabase/types";

export type SupabaseAuthAdminClient = SupabaseClient<Database>;

export type AuthIdentity = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  invited_at: string | null;
  last_sign_in_at: string | null;
};

export type TemporaryPasswordAuthResult = {
  data: {
    user: {
      id: string;
    } | null;
    mode: "created" | "updated";
  };
  error: Error | null;
};

export async function findAuthIdentityByEmail(client: SupabaseAuthAdminClient, email: string): Promise<AuthIdentity | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 100;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const matched = data.users.find((user) => (user.email ?? "").trim().toLowerCase() === normalizedEmail) ?? null;

    if (matched) {
      return {
        id: matched.id,
        email: matched.email ?? null,
        email_confirmed_at: matched.email_confirmed_at ?? null,
        confirmed_at: matched.confirmed_at ?? null,
        invited_at: matched.invited_at ?? null,
        last_sign_in_at: matched.last_sign_in_at ?? null,
      } satisfies AuthIdentity;
    }

    if (!data.nextPage || !data.users.length || data.users.length < perPage) {
      break;
    }
  }

  return null;
}

export async function linkPublicUserToAuthIdentity(client: SupabaseAuthAdminClient, userId: string, authUserId: string) {
  const repositories = createSupabaseWorkspaceRepositories(client);
  const existingUser = await repositories.users.getById(userId);

  if (!existingUser) {
    return null;
  }

  if (existingUser.authUserId && existingUser.authUserId !== authUserId) {
    throw new Error("Este miembro ya está vinculado a otra identidad de acceso.");
  }

  const conflictingUser = (await repositories.users.list()).find((row) => row.id !== userId && row.authUserId === authUserId && !row.deletedAt);
  if (conflictingUser) {
    throw new Error("Esa identidad de acceso ya está vinculada a otro miembro.");
  }

  const updated = await repositories.users.update(userId, {
    ...existingUser,
    authUserId,
  });

  return updated ?? null;
}

export async function linkPublicUserByEmailToAuthIdentity(client: SupabaseAuthAdminClient, email: string, authUserId: string) {
  const repositories = createSupabaseWorkspaceRepositories(client);
  const existingUser = await repositories.users.getByEmail(email);

  if (!existingUser) {
    return null;
  }

  return linkPublicUserToAuthIdentity(client, existingUser.id, authUserId);
}

export async function setPublicUserMustChangePassword(client: SupabaseAuthAdminClient, userId: string, mustChangePassword: boolean) {
  const repositories = createSupabaseWorkspaceRepositories(client);
  const existingUser = await repositories.users.getById(userId);

  if (!existingUser) {
    return null;
  }

  const updated = await repositories.users.update(userId, {
    ...existingUser,
    mustChangePassword,
  });

  return updated ?? null;
}

export async function createOrUpdateTemporaryPasswordAuthIdentity(
  client: SupabaseAuthAdminClient,
  params: {
    email: string;
    password: string;
  },
): Promise<TemporaryPasswordAuthResult> {
  const email = params.email.trim().toLowerCase();
  const existingAuthIdentity = await findAuthIdentityByEmail(client, email);

  if (existingAuthIdentity) {
    const { data, error } = await client.auth.admin.updateUserById(existingAuthIdentity.id, {
      password: params.password,
      email_confirm: true,
    });

    return {
      data: {
        user: data.user ? { id: data.user.id } : { id: existingAuthIdentity.id },
        mode: "updated",
      },
      error,
    };
  }

  const { data, error } = await client.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
  });

  return {
    data: {
      user: data.user ? { id: data.user.id } : null,
      mode: "created",
    },
    error,
  };
}
