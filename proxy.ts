import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getFirstAccessibleNavigationHref, getNavigationPermissionForPath } from "@/features/navigation/navigation";
import { isPublicRoute } from "@/features/navigation/public-routes";
import type { Database } from "@/lib/supabase/types";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseConfig } from "@/lib/supabase/helpers";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { getRolePresetBySlug, resolveAccountPermissions } from "@/features/accounts/domain/accounts-domain";

function createSupabaseMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie.name, cookie.value);
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!hasSupabaseConfig()) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createSupabaseMiddlewareClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const routeIsPublic = isPublicRoute(pathname);

  const workspace = user ? await loadWorkspaceBootstrap({ id: user.id, email: user.email }) : null;

  const currentProfile = workspace?.profiles.find((profile) => profile.id === workspace.currentProfileId && !profile.deletedAt) ?? null;
  const currentRole = currentProfile ? workspace?.roles.find((role) => role.id === currentProfile.roleId) ?? getRolePresetBySlug("administrator") : null;
  const effectivePermissions = currentProfile && currentRole
    ? resolveAccountPermissions({
        permissions: currentProfile.metadata?.permissions,
        rolePermissions: currentRole.permissions,
        roleMetadata: currentRole.metadata,
        accountMetadata: currentProfile.metadata,
      })
    : [];
  const currentEvent = workspace?.events.find((event) => event.id === workspace.currentEventId) ?? null;

  const routePermission = getNavigationPermissionForPath(pathname);
  const canAccessRoute = routePermission ? effectivePermissions.includes(routePermission) : true;

  if (user && !routeIsPublic && workspace?.authState.status === "must-change-password") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/setup-password";
    redirectUrl.search = `?next=${encodeURIComponent(`${pathname}${search}` || "/")}`;
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (user && pathname === "/login") {
    const fallbackHref = workspace
      ? getFirstAccessibleNavigationHref((permission) => effectivePermissions.includes(permission), currentEvent ?? undefined)
      : null;

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = fallbackHref ?? "/";
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (user && !routeIsPublic && !canAccessRoute) {
    const fallbackHref = getFirstAccessibleNavigationHref((permission) => effectivePermissions.includes(permission), currentEvent ?? undefined);

    if (fallbackHref && fallbackHref !== pathname) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = fallbackHref;
      redirectUrl.search = "";
      const redirectResponse = NextResponse.redirect(redirectUrl);
      copyCookies(response, redirectResponse);
      return redirectResponse;
    }
  }

  if (!user && !routeIsPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = search ? `?next=${encodeURIComponent(`${pathname}${search}`)}` : "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
