"use client";

import { useEffect, useState } from "react";

import TimezoneSelect from "@/components/timezone-select";
import { useFeedback } from "@/components/premium-feedback";
import type { Organization } from "@/features/domain/types";
import { buildSlugFromName } from "@/lib/slug";
import { getDefaultTimezone } from "@/lib/timezone";

type OrganizationCreationModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (organization: Organization) => Promise<Organization>;
  templateOrganization: Organization;
};

function buildOrganizationId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function OrganizationCreationModal({
  open,
  onClose,
  onCreate,
  templateOrganization,
}: OrganizationCreationModalProps) {
  const { showToast } = useFeedback();
  const [name, setName] = useState("Nueva organización");
  const [timezone, setTimezone] = useState(() => getDefaultTimezone(templateOrganization.timezone));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    setIsSaving(true);
    const normalizedSlug = buildSlugFromName(name);
    const nextOrganization: Organization = {
      ...templateOrganization,
      id: buildOrganizationId(),
      name: name.trim() || "Nueva organización",
      slug: normalizedSlug || "nueva-organizacion",
      timezone,
      status: "active",
      branding: {
        ...templateOrganization.branding,
      },
      settings: {
        ...templateOrganization.settings,
        timezone,
      },
    };

    try {
      await onCreate(nextOrganization);
      showToast({
        title: "Organización creada",
        description: `${nextOrganization.name} quedó lista para crear su primer evento.`,
        tone: "success",
      });
      onClose();
    } catch (error) {
      showToast({
        title: "No pudimos crear la organización",
        description: error instanceof Error ? error.message : "Revisá la conexión con Supabase.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#08111f] p-5 shadow-[0_40px_140px_rgba(0,0,0,0.55)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Organización</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Crear organización
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Define el espacio de trabajo antes de crear el evento. La configuración quedará lista para operar de inmediato.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            aria-label="Cerrar organización"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <Field label="Nombre" value={name} onChange={setName} placeholder="Grupo, sala o empresa" />
          <TimezoneSelect
            label="Zona horaria"
            value={timezone}
            onChange={setTimezone}
            preferredTimezone={templateOrganization.timezone}
            helperText="Se detecta automáticamente en tu equipo y puedes ajustarla si hace falta."
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            {isSaving ? "Creando..." : "Crear organización"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
    </label>
  );
}
