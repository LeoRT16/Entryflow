import { sanitizeRedirectTarget } from "@/app/login/redirect-target";
import type { WorkspaceAuthState } from "@/services/workspace-loader";

export function buildPostLoginRedirect(next: string, authState: WorkspaceAuthState) {
  const safeNext = sanitizeRedirectTarget(next);

  if (authState.status === "must-change-password") {
    return `/auth/setup-password?next=${encodeURIComponent(safeNext)}`;
  }

  return safeNext;
}
