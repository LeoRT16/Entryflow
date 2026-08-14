import { NextResponse, type NextRequest } from "next/server";

import { buildPostAuthRedirect } from "@/app/auth/callback/helpers";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";
import { sanitizeRedirectTarget } from "@/app/login/redirect-target";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = sanitizeRedirectTarget(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const redirectResponse = NextResponse.redirect(buildPostAuthRedirect(url.origin, next, type));
  const client = await createSupabaseAuthServerClient();

  if (!client) {
    redirectResponse.headers.set("Location", new URL("/login", url.origin).toString());
    return redirectResponse;
  }

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth", url.origin));
    }

    return redirectResponse;
  }

  if (tokenHash && type) {
    const { error } = await client.auth.verifyOtp({
      type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
      token_hash: tokenHash,
    });

    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth", url.origin));
    }

    return redirectResponse;
  }

  return redirectResponse;
}
