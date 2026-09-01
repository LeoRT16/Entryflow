"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { AccreditationAccessGrant } from "@/features/accreditation/access";
import type { AccreditationEnrollment } from "@/features/accreditation/types";
import type {
  AccreditationAccessEntitlement,
  AccreditationAccessSector,
  AccreditationSectorAccessDecision,
} from "@/features/accreditation/sector-access";
import { evaluateAccreditationSectorAccess } from "@/features/accreditation/sector-access";

type SectorAccessBoardProps = {
  eventId: string;
  eventName: string;
  canManageSectors: boolean;
  canAssignEntitlements: boolean;
  sectors: AccreditationAccessSector[];
  enrollments: AccreditationEnrollment[];
  accessGrants: AccreditationAccessGrant[];
  entitlements: AccreditationAccessEntitlement[];
};

function SummaryCard({
  label,
  value,
  tone = "info",
}: {
  label: string;
  value: number | string;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses = {
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-50",
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-50",
    danger: "border-rose-400/20 bg-rose-400/10 text-rose-50",
    info: "border-cyan-400/20 bg-cyan-400/10 text-cyan-50",
  }[tone];

  return (
    <div className={`rounded-[1.5rem] border p-4 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrió un error inesperado.";
}

function requestJson(input: RequestInfo | URL, init: RequestInit) {
  return fetch(input, init).then(async (response) => {
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;

    if (!response.ok) {
      throw new Error(payload?.error?.message || "No se pudo completar la operación.");
    }

    return payload;
  });
}

function buildSectorBody(formData: FormData) {
  const stringValue = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  const numberValue = (key: string) => {
    const value = stringValue(key);
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    name: stringValue("name"),
    code: stringValue("code"),
    description: stringValue("description"),
    status: stringValue("status") || "active",
    capacity: numberValue("capacity"),
    sortOrder: numberValue("sortOrder") ?? 0,
  };
}

function buildEntitlementBody(formData: FormData) {
  const value = formData.get("sectorId");
  return {
    sectorId: typeof value === "string" ? value.trim() : "",
  };
}

function sectorTone(status: AccreditationAccessSector["status"]) {
  return status === "active" ? "success" : "warning";
}

export default function AccreditationSectorAccessBoard({
  eventId,
  eventName,
  canManageSectors,
  canAssignEntitlements,
  sectors,
  enrollments,
  accessGrants,
  entitlements,
}: SectorAccessBoardProps) {
  const router = useRouter();
  const { showToast } = useFeedback();
  const [busySectorId, setBusySectorId] = useState<string | null>(null);
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);
  const [creatingSector, setCreatingSector] = useState(false);

  const grantByEnrollmentId = useMemo(() => new Map(accessGrants.map((grant) => [grant.enrollmentId, grant] as const)), [accessGrants]);
  const entitlementsByGrantId = useMemo(() => {
    const next = new Map<string, AccreditationAccessEntitlement[]>();

    for (const entitlement of entitlements) {
      const current = next.get(entitlement.accessGrantId) ?? [];
      current.push(entitlement);
      next.set(entitlement.accessGrantId, current);
    }

    return next;
  }, [entitlements]);
  const sectorById = useMemo(() => new Map(sectors.map((sector) => [sector.id, sector] as const)), [sectors]);

  async function handleCreateSector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageSectors || creatingSector) {
      return;
    }

    const body = buildSectorBody(new FormData(event.currentTarget));

    if (!body.name || !body.code) {
      showToast({
        title: "Faltan datos",
        description: "El sector necesita nombre y código.",
        tone: "warning",
      });
      return;
    }

    setCreatingSector(true);
    try {
      await requestJson(`/api/accreditation/events/${eventId}/sectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      showToast({
        title: "Sector creado",
        description: "El sector de acceso quedó registrado.",
        tone: "success",
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo crear el sector",
        description: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setCreatingSector(false);
    }
  }

  async function handleUpdateSector(event: FormEvent<HTMLFormElement>, sectorId: string) {
    event.preventDefault();

    if (!canManageSectors || busySectorId) {
      return;
    }

    const body = buildSectorBody(new FormData(event.currentTarget));

    if (!body.name || !body.code) {
      showToast({
        title: "Faltan datos",
        description: "El sector necesita nombre y código.",
        tone: "warning",
      });
      return;
    }

    setBusySectorId(sectorId);
    try {
      await requestJson(`/api/accreditation/events/${eventId}/sectors/${sectorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      showToast({
        title: "Sector actualizado",
        description: "Los cambios quedaron guardados.",
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo actualizar",
        description: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setBusySectorId(null);
    }
  }

  async function handleDeactivateSector(sectorId: string) {
    if (!canManageSectors || busySectorId) {
      return;
    }

    setBusySectorId(sectorId);
    try {
      await requestJson(`/api/accreditation/events/${eventId}/sectors/${sectorId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      showToast({
        title: "Sector desactivado",
        description: "El sector quedó inactivo sin perder su historial.",
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo desactivar",
        description: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setBusySectorId(null);
    }
  }

  async function handleAssignEntitlement(event: FormEvent<HTMLFormElement>, enrollmentId: string) {
    event.preventDefault();

    if (!canAssignEntitlements || busyEnrollmentId) {
      return;
    }

    const body = buildEntitlementBody(new FormData(event.currentTarget));

    if (!body.sectorId) {
      showToast({
        title: "Elegí un sector",
        description: "Seleccioná un sector antes de asignar acceso.",
        tone: "warning",
      });
      return;
    }

    setBusyEnrollmentId(enrollmentId);
    try {
      await requestJson(`/api/accreditation/events/${eventId}/participants/${enrollmentId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      showToast({
        title: "Acceso asignado",
        description: "La credencial ahora tiene acceso a ese sector.",
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo asignar",
        description: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setBusyEnrollmentId(null);
    }
  }

  async function handleRevokeEntitlement(entitlementId: string, enrollmentId: string) {
    if (!canAssignEntitlements || busyEnrollmentId) {
      return;
    }

    setBusyEnrollmentId(enrollmentId);
    try {
      await requestJson(`/api/accreditation/events/${eventId}/participants/${enrollmentId}/access`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entitlementId }),
      });

      showToast({
        title: "Acceso revocado",
        description: "La asignación quedó en historial como revocada.",
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo revocar",
        description: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setBusyEnrollmentId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Sectores" value={sectors.length} tone="info" />
        <SummaryCard label="Activos" value={sectors.filter((sector) => sector.status === "active").length} tone="success" />
        <SummaryCard label="Entitlements activos" value={entitlements.filter((item) => item.status === "active").length} tone="success" />
        <SummaryCard label="Entitlements revocados" value={entitlements.filter((item) => item.status === "revoked").length} tone="warning" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[1.8rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Sectores</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Configuración de acceso</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                {eventName} usa sectores event-scoped para dividir el acceso de una credencial estable.
              </p>
            </div>
            <StatusBadge variant="info">Phase 3A</StatusBadge>
          </div>

          {canManageSectors ? (
            <form onSubmit={handleCreateSector} className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Nuevo sector</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Crear sector de acceso</h3>
                </div>
                <button
                  type="submit"
                  disabled={creatingSector}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingSector ? "Creando..." : "Crear sector"}
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Nombre</span>
                  <input name="name" placeholder="VIP" className="surface-interactive w-full px-3 py-2" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Código</span>
                  <input name="code" placeholder="VIP" className="surface-interactive w-full px-3 py-2" />
                </label>
                <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Descripción</span>
                  <input name="description" placeholder="Zona preferente" className="surface-interactive w-full px-3 py-2" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Capacidad</span>
                  <input name="capacity" type="number" min="0" placeholder="100" className="surface-interactive w-full px-3 py-2" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Orden</span>
                  <input name="sortOrder" type="number" defaultValue={0} className="surface-interactive w-full px-3 py-2" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Estado</span>
                  <select name="status" defaultValue="active" className="surface-interactive w-full px-3 py-2">
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </label>
              </div>
            </form>
          ) : null}

          <div className="mt-5 space-y-3">
            {sectors.length ? (
              sectors.map((sector) => (
                <form
                  key={sector.id}
                  onSubmit={(event) => handleUpdateSector(event, sector.id)}
                  className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold tracking-tight text-white">{sector.name}</h3>
                        <StatusBadge variant={sectorTone(sector.status)}>{sector.code}</StatusBadge>
                        <StatusBadge variant={sector.status === "active" ? "success" : "warning"}>
                          {sector.status === "active" ? "Activo" : "Inactivo"}
                        </StatusBadge>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{sector.description || "Sin descripción"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canManageSectors ? (
                        <>
                          <button
                            type="submit"
                            disabled={busySectorId === sector.id}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busySectorId === sector.id ? "Guardando..." : "Guardar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeactivateSector(sector.id)}
                            disabled={busySectorId === sector.id}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Desactivar
                          </button>
                        </>
                      ) : (
                        <StatusBadge variant="info">Solo lectura</StatusBadge>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Nombre</span>
                      <input name="name" defaultValue={sector.name} className="surface-interactive w-full px-3 py-2" />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Código</span>
                      <input name="code" defaultValue={sector.code} className="surface-interactive w-full px-3 py-2" />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Descripción</span>
                      <input name="description" defaultValue={sector.description || ""} className="surface-interactive w-full px-3 py-2" />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Capacidad</span>
                      <input
                        name="capacity"
                        type="number"
                        min="0"
                        defaultValue={sector.capacity ?? ""}
                        className="surface-interactive w-full px-3 py-2"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Orden</span>
                      <input name="sortOrder" type="number" defaultValue={sector.sortOrder} className="surface-interactive w-full px-3 py-2" />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Estado</span>
                      <select name="status" defaultValue={sector.status} className="surface-interactive w-full px-3 py-2">
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </label>
                  </div>
                </form>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
                Todavía no creaste sectores para este evento.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-white/10 bg-[#0d1117] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Participantes</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Credenciales y entitlements</h2>
            </div>
            <StatusBadge variant={canAssignEntitlements ? "success" : "warning"}>
              {canAssignEntitlements ? "Con permiso" : "Solo lectura"}
            </StatusBadge>
          </div>

          <div className="mt-5 space-y-3">
            {enrollments.length ? (
              enrollments.map((enrollment) => {
                const grant = grantByEnrollmentId.get(enrollment.id);
                const rows = grant ? entitlementsByGrantId.get(grant.id) ?? [] : [];
                const activeRows = rows.filter((entitlement) => entitlement.status === "active");
                const revokedRows = rows.filter((entitlement) => entitlement.status === "revoked");

                return (
                  <article key={enrollment.id} className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold tracking-tight text-white">{enrollment.name}</h3>
                        <p className="mt-2 text-sm text-slate-400">
                          Estado: {enrollment.status === "active" ? "Activo" : "Cancelado"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {grant ? `Credencial ${grant.accessCode}` : "Sin credencial activa"}
                        </p>
                      </div>
                      <StatusBadge variant={grant ? "success" : "warning"}>{grant ? "Con acceso" : "Sin acceso"}</StatusBadge>
                    </div>

                    {grant ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {activeRows.map((entitlement) => {
                            const sector = sectorById.get(entitlement.sectorId);

                            return (
                              <div
                                key={entitlement.id}
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-50"
                              >
                                <span>{sector?.name ?? entitlement.sectorId}</span>
                                {canAssignEntitlements ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeEntitlement(entitlement.id, enrollment.id)}
                                    disabled={busyEnrollmentId === enrollment.id}
                                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Revocar
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                          {revokedRows.map((entitlement) => {
                            const sector = sectorById.get(entitlement.sectorId);

                            return (
                              <div
                                key={entitlement.id}
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300"
                              >
                                <span>{sector?.name ?? entitlement.sectorId}</span>
                                <span className="text-slate-500">Revocado</span>
                              </div>
                            );
                          })}
                        </div>

                        {canAssignEntitlements ? (
                          <form onSubmit={(event) => handleAssignEntitlement(event, enrollment.id)} className="grid gap-3 sm:grid-cols-[1fr_auto]">
                            <select name="sectorId" defaultValue="" className="surface-interactive w-full px-3 py-2">
                              <option value="" disabled>
                                Seleccioná un sector
                              </option>
                              {sectors
                                .filter((sector) => sector.status === "active")
                                .map((sector) => (
                                  <option key={sector.id} value={sector.id}>
                                    {sector.name} · {sector.code}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="submit"
                              disabled={busyEnrollmentId === enrollment.id}
                              className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyEnrollmentId === enrollment.id ? "Asignando..." : "Asignar sector"}
                            </button>
                          </form>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-2">
                          {sectors.map((sector) => {
                            const decision: AccreditationSectorAccessDecision = evaluateAccreditationSectorAccess({
                              scope: { organizationId: grant.organizationId, eventId: grant.eventId },
                              grant,
                              enrollment,
                              sector,
                              entitlements: rows,
                            });

                            return (
                              <div
                                key={`${enrollment.id}-${sector.id}`}
                                className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-white">{sector.name}</span>
                                  <StatusBadge variant={decision.allowed ? "success" : sector.status === "inactive" ? "warning" : "info"}>
                                    {decision.allowed ? "Permitido" : decision.reason ?? "Pendiente"}
                                  </StatusBadge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[1.25rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-slate-400">
                        Todavía no se generó una credencial para esta inscripción.
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
                No hay participantes disponibles para asignar entitlements.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
