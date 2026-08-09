"use client";

import { useCallback, useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import { ContextualCard, GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import { formatReservationStatus } from "@/features/reservations/domain/reservation-domain";
import { formatTableStatus } from "@/features/tables/domain/table-domain";
import type { TableSummary } from "@/features/tables/types";
import { useCheckInStore } from "@/services/workspace-service";

function tablePriorityWeight(status: TableSummary["status"]) {
  if (status === "Over Capacity") return 0;
  if (status === "Full") return 1;
  if (status === "Reserved") return 2;
  if (status === "Partially Occupied") return 3;
  if (status === "Available") return 4;
  return 5;
}

function compareTablePriority(a: TableSummary, b: TableSummary) {
  const statusDelta = tablePriorityWeight(a.status) - tablePriorityWeight(b.status);

  if (statusDelta !== 0) {
    return statusDelta;
  }

  const overCapacityDelta = b.metrics.overCapacity - a.metrics.overCapacity;

  if (overCapacityDelta !== 0) {
    return overCapacityDelta;
  }

  const occupancyDelta = b.metrics.occupancyPercent - a.metrics.occupancyPercent;

  if (occupancyDelta !== 0) {
    return occupancyDelta;
  }

  const assignedDelta = b.metrics.assignedGuests - a.metrics.assignedGuests;

  if (assignedDelta !== 0) {
    return assignedDelta;
  }

  return a.name.localeCompare(b.name);
}

export default function TablesFlow() {
  const store = useCheckInStore();

  return <TablesFlowWorkspace key={store.currentEvent.id} />;
}

function TablesFlowWorkspace() {
  const {
    tableSummaries,
    reservations,
    workspaceIntelligence,
    workspacePriority,
    assignReservationToTable,
    moveGuestToTable,
    releaseTable,
    closeTable,
  } = useCheckInStore();
  const prioritizedTables = useMemo(
    () => [...tableSummaries].sort(compareTablePriority),
    [tableSummaries],
  );
  const [activeTableId, setActiveTableId] = useState<string>(prioritizedTables[0]?.id ?? "");
  const [reservationId, setReservationId] = useState<string>(
    reservations.find((reservation) => reservation.tableId !== prioritizedTables[0]?.id)?.id ?? "",
  );
  const [guestId, setGuestId] = useState<string>(prioritizedTables[0]?.guests[0]?.id ?? "");
  const [targetTableId, setTargetTableId] = useState<string>(
    prioritizedTables.find((table) => table.id !== prioritizedTables[0]?.id)?.id ?? "",
  );

  const activeTable = useMemo(
    () => prioritizedTables.find((table) => table.id === activeTableId) ?? prioritizedTables[0] ?? null,
    [activeTableId, prioritizedTables],
  );

  const activeReservationOptions = useMemo(
    () =>
      reservations
        .filter((reservation) => reservation.tableId !== activeTable?.id)
        .map((reservation) => ({
          id: reservation.id,
          label: `${reservation.code} · ${reservation.name}`,
          status: reservation.status,
          tableName: reservation.tableName,
        })),
    [activeTable?.id, reservations],
  );

  const tableInsight = workspaceIntelligence.tables;
  const activeTables = tableInsight.activeTables;
  const fullTables = tableInsight.fullTables;
  const availableTables = tableInsight.freeTables;
  const overCapacityTables = tableInsight.overCapacityTables;
  const occupancyPercent = `${tableInsight.occupancyPercent}%`;
  const tableInsights = workspacePriority.byModule.Tables;
  const prioritySummary = workspacePriority.summary;
  const health = workspaceIntelligence.health;

  const handleAssignReservation = useCallback(() => {
    if (!reservationId) {
      return;
    }

    assignReservationToTable(reservationId, activeTable?.id ?? "");
  }, [activeTable?.id, assignReservationToTable, reservationId]);

  const handleMoveGuest = useCallback(() => {
    if (!guestId || !targetTableId) {
      return;
    }

    moveGuestToTable(guestId, targetTableId);
  }, [guestId, moveGuestToTable, targetTableId]);

  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          id: "tables-move",
          shortcut: "m",
          priority: 50,
          handler: handleMoveGuest,
        },
        {
          id: "tables-release",
          shortcut: "l",
          priority: 45,
          handler: () => {
            if (!activeTable) {
              return;
            }

            releaseTable(activeTable.id);
          },
        },
      ],
      [activeTable, handleMoveGuest, releaseTable],
    ),
  );

  const guidedActions = useMemo(() => {
    if (!activeTable) {
      return [];
    }

    const actions = [
      ...(activeTable.metrics.overCapacity > 0
        ? [
            {
              id: `${activeTable.id}-release`,
              label: "Liberar mesa",
              reason: `${activeTable.name} supera la capacidad disponible.`,
              impact: "Libera espacio para normalizar la operación de la mesa.",
              priority: "critical" as const,
              tone: "danger" as const,
              onSelect: () => releaseTable(activeTable.id),
            },
          ]
        : []),
      ...(activeReservationOptions.length
        ? [
            {
              id: `${activeTable.id}-assign`,
              label: "Asignar reserva sugerida",
              reason: `Hay reservas listas para vincular a ${activeTable.name}.`,
              impact: "Une la mesa con la reserva que necesita atención ahora.",
              priority: "blocking" as const,
              tone: "warning" as const,
              onSelect: handleAssignReservation,
            },
          ]
        : []),
      ...(activeTable.guests.length
        ? [
            {
              id: `${activeTable.id}-move-guest`,
              label: "Mover invitados",
              reason: `${activeTable.guests.length} invitados siguen asignados a esta mesa.`,
              impact: "Reubica personas sin perder el contexto operativo.",
              priority: "quick" as const,
              tone: "info" as const,
              onSelect: handleMoveGuest,
            },
          ]
        : []),
      ...tableInsights.slice(0, 2).map((item) =>
        buildGuidedActionItem(item, {
          href: item.route,
          impact: item.description,
        }),
      ),
    ];

    const seen = new Set<string>();

    return actions
      .filter((item) => {
        if (seen.has(item.id)) {
          return false;
        }

        seen.add(item.id);
        return true;
      })
      .slice(0, 3);
  }, [activeReservationOptions.length, activeTable, handleAssignReservation, handleMoveGuest, releaseTable, tableInsights]);

  if (!activeTable) {
    return (
      <div className="space-y-6">
        <Topbar
          eyebrow="Mesas"
          title="Operación de mesas"
          description="No hay mesas disponibles para operar en este momento."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Mesas"
        title="Operación de mesas"
        description="Administra capacidad, ocupación, reservas e invitados con el mismo estado compartido."
      />

      <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] xl:grid-cols-5">
        <MetricPanel label="Mesas activas" value={`${activeTables}`} tone="info" />
        <MetricPanel label="Mesas completas" value={`${fullTables}`} tone="warning" />
        <MetricPanel label="Con capacidad" value={`${availableTables}`} tone="success" />
        <MetricPanel label="Sobrecargadas" value={`${overCapacityTables}`} tone="danger" />
        <MetricPanel label="Ocupación general" value={occupancyPercent} tone="info" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <GuidedActionPanel
            title="Siguiente paso"
            description="La mesa activa propone la acción que más reduce fricción operativa."
            items={guidedActions}
          />

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Mesas operativas
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Selecciona una mesa para operar.
                </h2>
              </div>
              <StatusBadge variant="info">{prioritizedTables.length}</StatusBadge>
            </div>

            <div className="mt-5 space-y-3">
              {prioritizedTables.map((table) => {
                const isActive = table.id === activeTable.id;
                const tableActions = [
                  {
                    id: `${table.id}-open`,
                    label: "Abrir",
                    description: "Seleccionar esta mesa.",
                    tone: "info" as const,
                    onSelect: () => {
                      setActiveTableId(table.id);
                      setReservationId(reservations.find((reservation) => reservation.tableId !== table.id)?.id ?? "");
                      setGuestId(table.guests[0]?.id ?? "");
                      setTargetTableId(prioritizedTables.find((candidate) => candidate.id !== table.id)?.id ?? "");
                    },
                  },
                  {
                    id: `${table.id}-assign`,
                    label: "Asignar reserva",
                    description: "Vincular la reserva activa a la mesa.",
                    tone: "success" as const,
                    onSelect: handleAssignReservation,
                  },
                  {
                    id: `${table.id}-move`,
                    label: "Mover invitados",
                    description: "Reasignar un invitado a otra mesa.",
                    tone: "warning" as const,
                    onSelect: handleMoveGuest,
                  },
                  {
                    id: `${table.id}-release`,
                    label: "Liberar",
                    description: "Dejar la mesa disponible.",
                    tone: "info" as const,
                    onSelect: () => releaseTable(table.id),
                  },
                  {
                    id: `${table.id}-close`,
                    label: "Cerrar",
                    description: "Marcar la mesa como cerrada.",
                    tone: "danger" as const,
                    onSelect: () => closeTable(table.id),
                  },
                ];

                return (
                  <ContextualCard
                    key={table.id}
                    items={tableActions}
                    className={[
                      "rounded-[1.45rem] border",
                      isActive
                        ? "border-cyan-400/30 bg-cyan-400/10"
                        : "border-white/10 bg-slate-950/40 hover:bg-slate-950/55",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                    onClick={() => {
                      setActiveTableId(table.id);
                      setReservationId(reservations.find((reservation) => reservation.tableId !== table.id)?.id ?? "");
                      setGuestId(table.guests[0]?.id ?? "");
                      setTargetTableId(prioritizedTables.find((candidate) => candidate.id !== table.id)?.id ?? "");
                    }}
                    className="w-full rounded-[1.45rem] p-4 text-left transition"
                  >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{table.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                            {table.location}
                          </p>
                        </div>
                        <StatusBadge variant={table.statusTone}>{formatTableStatus(table.status)}</StatusBadge>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <MiniStat label="Invitados" value={`${table.metrics.assignedGuests}`} />
                        <MiniStat label="Ingresados" value={`${table.metrics.checkedInGuests}`} />
                        <MiniStat label="Pendientes" value={`${table.metrics.pendingGuests}`} />
                        <MiniStat label="Último estado" value={table.status} />
                      </div>
                    </button>
                  </ContextualCard>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3 rounded-[2rem] border border-white/10 bg-slate-950/40 p-5 sm:grid-cols-2">
            <LiveSummaryRow label="Capacidad" value={`${activeTable.capacity}`} />
            <LiveSummaryRow label="Asignados" value={`${activeTable.metrics.assignedGuests}`} />
            <LiveSummaryRow label="Disponibles" value={`${activeTable.metrics.capacityRemaining}`} />
            <LiveSummaryRow label="Sobrecapacidad" value={`${activeTable.metrics.overCapacity}`} />
          </section>
        </div>

        <section className="space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Detalle de mesa
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {activeTable.name}
              </h2>
              <p className="mt-2 text-sm text-slate-400">{activeTable.location}</p>
            </div>
            <StatusBadge variant={activeTable.statusTone}>{formatTableStatus(activeTable.status)}</StatusBadge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <LiveSummaryRow label="Reservas" value={`${activeTable.reservations.length}`} />
            <LiveSummaryRow label="Invitados" value={`${activeTable.metrics.assignedGuests}`} />
            <LiveSummaryRow label="Ingresados" value={`${activeTable.metrics.checkedInGuests}`} />
            <LiveSummaryRow label="Pendientes" value={`${activeTable.metrics.pendingGuests}`} />
            <LiveSummaryRow label="Ocupación" value={`${activeTable.metrics.occupancyPercent}%`} />
            <LiveSummaryRow label="Estado" value={formatTableStatus(activeTable.status)} />
          </div>

          <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Reservas asociadas
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeTable.reservations.length ? (
                activeTable.reservations.map((reservation) => (
                  <StatusBadge key={reservation.id} variant="info">
                    {reservation.code} · {reservation.name}
                  </StatusBadge>
                ))
              ) : (
                <StatusBadge variant="warning">Sin reservas</StatusBadge>
              )}
            </div>
          </section>

          <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Invitados asignados
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeTable.guests.length ? (
                activeTable.guests.map((guest) => (
                  <StatusBadge key={guest.id} variant={guest.admissionStatus === "Ingresó" ? "success" : guest.admissionStatus === "Anulada" ? "danger" : "warning"}>
                    {guest.name}
                  </StatusBadge>
                ))
              ) : (
                <StatusBadge variant="warning">Sin invitados</StatusBadge>
              )}
            </div>
          </section>

          <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Asignar reserva
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                  Vincula una reserva a esta mesa.
                </h3>
              </div>
              <StatusBadge variant="info">{activeReservationOptions.length}</StatusBadge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="sr-only">Seleccionar reserva</span>
                <select
                  value={reservationId}
                  onChange={(event) => setReservationId(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]"
                >
                  {activeReservationOptions.map((reservation) => (
                    <option key={reservation.id} value={reservation.id}>
                      {reservation.label} · {formatReservationStatus(reservation.status)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleAssignReservation}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
              >
                Asignar
              </button>
            </div>
          </section>

          <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Mover invitado
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                  Reasigna un invitado entre mesas.
                </h3>
              </div>
              <StatusBadge variant="info">{activeTable.guests.length}</StatusBadge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="sr-only">Seleccionar invitado</span>
                <select
                  value={guestId}
                  onChange={(event) => setGuestId(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]"
                >
                  {activeTable.guests.map((guest) => (
                    <option key={guest.id} value={guest.id}>
                      {guest.name} · {guest.tableName ?? activeTable.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="sr-only">Mesa destino</span>
                <select
                  value={targetTableId}
                  onChange={(event) => setTargetTableId(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]"
                >
                  {tableSummaries
                    .filter((table) => table.id !== activeTable.id)
                    .map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.name} · {formatTableStatus(table.status)}
                      </option>
                    ))}
                </select>
              </label>

              <button
                type="button"
                onClick={handleMoveGuest}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Mover invitado
              </button>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => releaseTable(activeTable.id)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Liberar mesa
            </button>
            <button
              type="button"
              onClick={() => closeTable(activeTable.id)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 text-sm font-medium text-rose-50 transition hover:bg-rose-400/15"
            >
              Cerrar mesa
            </button>
          </div>

          <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Resumen operativo
            </p>
            <div className="mt-4 space-y-3">
              <LiveSummaryRow label="Capacidad restante" value={`${activeTable.metrics.capacityRemaining}`} />
              <LiveSummaryRow label="Sobrecapacidad" value={`${activeTable.metrics.overCapacity}`} />
              <LiveSummaryRow label="Reservas asociadas" value={`${activeTable.reservations.length}`} />
              <LiveSummaryRow label="Estado" value={formatTableStatus(activeTable.status)} />
            </div>
          </section>

          <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Lectura inteligente</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">{prioritySummary.message}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{health.description}</p>
            <div className="mt-4 space-y-2">
              {tableInsights.length ? (
                tableInsights.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
                      </div>
                      <StatusBadge variant={item.tone}>{item.priority}</StatusBadge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-400">
                  Sin recomendaciones activas.
                </div>
              )}
            </div>
          </section>
        </section>
      </section>
    </div>
  );
}

function MetricPanel({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}
