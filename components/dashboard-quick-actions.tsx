"use client";

import Link from "next/link";

import { useFeedback } from "@/components/premium-feedback";

export default function DashboardQuickActions() {
  const { showToast } = useFeedback();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Link
        href="/reservations"
        onClick={() =>
          showToast({
            title: "Reserva creada (modo demo)",
            description: "Se abrió el flujo visual de creación.",
            tone: "success",
          })
        }
        className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
      >
        Crear reserva
      </Link>
      <Link
        href="/check-in"
        onClick={() =>
          showToast({
            title: "Escáner abierto (simulación)",
            description: "El acceso operativo está listo para revisar invitados.",
            tone: "info",
          })
        }
        className="inline-flex h-12 items-center justify-center rounded-xl border border-blue-400/25 bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400"
      >
        Abrir escáner
      </Link>
      <Link
        href="/customers"
        onClick={() =>
          showToast({
            title: "Búsqueda preparada",
            description: "Se abrió el directorio de invitados.",
            tone: "info",
          })
        }
        className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
      >
        Buscar invitado
      </Link>
    </div>
  );
}
