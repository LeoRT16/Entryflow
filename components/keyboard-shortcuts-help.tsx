"use client";

import StatusBadge from "@/components/status-badge";

type ShortcutGroup = {
  title: string;
  description: string;
  items: Array<{
    shortcut: string;
    label: string;
    note?: string;
  }>;
};

const groups: ShortcutGroup[] = [
  {
    title: "Globales",
    description: "Atajos disponibles desde cualquier pantalla.",
    items: [
      { shortcut: "Cmd+K", label: "Abrir buscador de comandos", note: "Ctrl+K en Windows." },
      { shortcut: "Esc", label: "Cerrar panel abierto", note: "Palette, ayuda o panel contextual." },
      { shortcut: "/", label: "Foco en la búsqueda principal", note: "Cuando existe un campo visible." },
      { shortcut: "?", label: "Abrir esta ayuda", note: "Sin salir del contexto actual." },
    ],
  },
  {
    title: "Navegación",
    description: "Cambio rápido entre módulos principales.",
    items: [
      { shortcut: "g d", label: "Resumen" },
      { shortcut: "g r", label: "Reservas" },
      { shortcut: "g c", label: "Invitados" },
      { shortcut: "g k", label: "Ingreso" },
      { shortcut: "g o", label: "Operaciones" },
      { shortcut: "g t", label: "Recursos" },
      { shortcut: "g l", label: "Actividad" },
      { shortcut: "g s", label: "Estadísticas" },
      { shortcut: "g e", label: "Eventos" },
      { shortcut: "g ,", label: "Ajustes" },
    ],
  },
  {
    title: "Operación",
    description: "Acciones frecuentes dentro de las pantallas operativas.",
    items: [
      { shortcut: "↑↓", label: "Mover selección" },
      { shortcut: "←→", label: "Cambiar panel cuando corresponda" },
      { shortcut: "Home", label: "Primer elemento" },
      { shortcut: "End", label: "Último elemento" },
      { shortcut: "PageUp / PageDown", label: "Desplazamiento rápido" },
      { shortcut: "Enter", label: "Acción principal" },
      { shortcut: "Space", label: "Seleccionar" },
      { shortcut: "Cmd+Enter", label: "Acción prioritaria" },
    ],
  },
  {
    title: "Rápidas por pantalla",
    description: "Atajos específicos para acelerar el flujo operativo.",
    items: [
      { shortcut: "1-4", label: "Acciones guiadas visibles", note: "Cuando una pantalla muestra acciones guiadas." },
      { shortcut: "J / K", label: "Actividad", note: "Siguiente y anterior evento." },
      { shortcut: "N / A / C", label: "Reservas", note: "Nueva, asignar recurso, confirmar." },
      { shortcut: "Enter / N", label: "Ingreso", note: "Continuar o pasar al siguiente invitado." },
      { shortcut: "M / L", label: "Recursos", note: "Mover recurso o liberar." },
      { shortcut: "1-4", label: "Resumen", note: "Críticos, atención, recientes, saludables." },
    ],
  },
];

export default function KeyboardShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      onClick={onClose}
    >
      <section
        className="max-h-[min(90vh,54rem)] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#08111f] shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
          <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                Atajos globales
              </p>
            <h2 id="keyboard-shortcuts-title" className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Operación completa desde teclado
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              EntryFlow responde como un sistema operativo. Estos atajos funcionan sin cambiar de pantalla.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Cerrar
          </button>
        </div>

        <div className="grid max-h-[calc(90vh-8rem)] gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
          {groups.map((group) => (
            <section key={group.title} className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    {group.title}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">{group.description}</p>
                </div>
                <StatusBadge variant="info">{group.items.length}</StatusBadge>
              </div>

              <div className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <div key={`${group.title}-${item.shortcut}-${item.label}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{item.label}</p>
                        {item.note ? <p className="mt-1 text-xs leading-5 text-slate-400">{item.note}</p> : null}
                      </div>
                      <span className="inline-flex shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                        {item.shortcut}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
