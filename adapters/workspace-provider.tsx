"use client";

import type { ReactNode } from "react";

import { WorkspaceServiceProvider } from "@/services/workspace-service";
import type { WorkspaceBootstrap } from "@/services/workspace-loader";

export function WorkspaceProvider({
  children,
  initialWorkspace,
}: {
  children: ReactNode;
  initialWorkspace?: WorkspaceBootstrap | null;
}) {
  return <WorkspaceServiceProvider initialWorkspace={initialWorkspace}>{children}</WorkspaceServiceProvider>;
}
