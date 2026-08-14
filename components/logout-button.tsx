"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const LOCAL_STORAGE_KEYS = [
  "entryflow.currentOrganizationId",
  "entryflow.currentEventId",
  "entryflow.currentProfileId",
];

export default function LogoutButton({
  label = "Cerrar sesión",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      if (typeof window !== "undefined") {
        for (const key of LOCAL_STORAGE_KEYS) {
          window.localStorage.removeItem(key);
        }
      }

      const client = getSupabaseBrowserClient();
      if (client) {
        await client.auth.signOut();
      }
    } finally {
      router.replace("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={isLoggingOut}
      className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoggingOut ? "Saliendo..." : label}
    </button>
  );
}

