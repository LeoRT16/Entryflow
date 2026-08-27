"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { AccreditationParticipantOperationalRow } from "@/features/accreditation/participants";
import AccreditationParticipantFormFields from "./accreditation-participant-form-fields";

function Meta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-white">{value}</p>
    </div>
  );
}

async function sendParticipantMutation(
  input: RequestInfo | URL,
  init: RequestInit,
) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || "No se pudo completar la operación.");
  }

  return payload;
}

function buildParticipantBody(formData: FormData) {
  const stringValue = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  return {
    name: stringValue("name"),
    email: stringValue("email"),
    phone: stringValue("phone"),
    categoryId: stringValue("categoryId"),
    company: stringValue("company"),
    jobTitle: stringValue("jobTitle"),
    badgeName: stringValue("badgeName"),
    participantRole: stringValue("participantRole"),
  };
}

export default function AccreditationParticipantRow({
  eventId,
  categories,
  row,
}: {
  eventId: string;
  categories: Array<{ id: string; name: string }>;
  row: AccreditationParticipantOperationalRow;
}) {
  const router = useRouter();
  const { confirm, showToast } = useFeedback();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!row.canEdit || isSaving) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const body = buildParticipantBody(formData);

    setIsSaving(true);
    try {
      await sendParticipantMutation(`/api/accreditation/events/${eventId}/participants/${row.enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      showToast({
        title: "Participante actualizado",
        description: "Los cambios se guardaron correctamente.",
        tone: "success",
      });
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      showToast({
        title: "No se pudo actualizar",
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (!row.canCancel || isSaving) {
      return;
    }

    confirm({
      title: "Cancelar inscripción",
      description: "La inscripción quedará cancelada, pero su historial y credenciales previas seguirán visibles.",
      confirmLabel: "Cancelar inscripción",
      cancelLabel: "Volver",
      tone: "warning",
      onConfirm: () => {
        void (async () => {
          setIsSaving(true);
          try {
            await sendParticipantMutation(`/api/accreditation/events/${eventId}/participants/${row.enrollmentId}`, {
              method: "DELETE",
            });

            showToast({
              title: "Inscripción cancelada",
              description: "La inscripción se preservó como historial.",
              tone: "success",
            });
            router.refresh();
          } catch (error) {
            showToast({
              title: "No se pudo cancelar",
              description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
              tone: "error",
            });
          } finally {
            setIsSaving(false);
          }
        })();
      },
    });
  };

  return (
    <article className="rounded-[1.6rem] border border-white/10 bg-[#0d1117] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-lg font-semibold tracking-tight text-white">{row.displayName}</h3>
            <StatusBadge variant={row.status === "active" ? "success" : "warning"}>{row.statusLabel}</StatusBadge>
            <StatusBadge variant={row.credentialState === "revoked" ? "danger" : row.credentialState === "active" ? "success" : "warning"}>
              {row.credentialStateLabel}
            </StatusBadge>
            <StatusBadge variant={row.invitationTone}>{row.invitationStateLabel}</StatusBadge>
            <StatusBadge variant={row.checkInState === "checked_in" ? "success" : "info"}>{row.checkInStateLabel}</StatusBadge>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Meta label="Participante" value={row.participantName} />
            <Meta label="Teléfono" value={row.phone || "Sin teléfono"} />
            <Meta label="Categoría" value={row.categoryName || "Sin categoría"} />
            <Meta label="Credencial" value={row.accessCodePresent ? "Emitida" : "Sin emitir"} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Meta label="Empresa" value={row.profile.company || "Sin empresa"} />
            <Meta label="Cargo" value={row.profile.jobTitle || "Sin cargo"} />
            <Meta label="Badge" value={row.profile.badgeName || "Sin badge"} />
            <Meta label="Rol" value={row.profile.participantRole || "Sin rol"} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Invitación: {row.invitationStateLabel}</span>
            {row.invitationTimestamp ? <span>· {new Date(row.invitationTimestamp).toLocaleString("es-BO")}</span> : null}
            {row.checkInTimestamp ? <span>· Ingreso {new Date(row.checkInTimestamp).toLocaleString("es-BO")}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.canEdit ? (
            <button
              type="button"
              onClick={() => setIsEditing((current) => !current)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              {isEditing ? "Cerrar edición" : "Editar"}
            </button>
          ) : null}
          {row.canCancel ? (
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 text-sm font-medium text-rose-50 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={handleEdit} className="mt-4 space-y-4 border-t border-white/10 pt-4">
          <AccreditationParticipantFormFields
            categories={categories}
            defaults={{
              name: row.participantName,
              email: row.email,
              phone: row.phone,
              categoryId: row.categoryId,
              company: row.profile.company,
              jobTitle: row.profile.jobTitle,
              badgeName: row.profile.badgeName,
              participantRole: row.profile.participantRole,
            }}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-50 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}
