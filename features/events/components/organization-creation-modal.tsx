"use client";

import { useEffect, useState } from "react";

import { useFeedback } from "@/components/premium-feedback";
import type { Organization } from "@/features/domain/types";

type OrganizationCreationModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (organization: Organization) => void;
  templateOrganization: Organization;
};

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildOrganizationId(slug: string) {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 8);
  return `org-${slug || "alpha"}-${suffix}`;
}

export default function OrganizationCreationModal({
  open,
  onClose,
  onCreate,
  templateOrganization,
}: OrganizationCreationModalProps) {
  const { showToast } = useFeedback();
  const [name, setName] = useState("Nueva organización");
  const [slug, setSlug] = useState("nueva-organizacion");
  const [timezone, setTimezone] = useState(templateOrganization.timezone);

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
  }, [open, onClose, templateOrganization.timezone]);

  if (!open) {
    return null;
  }

  const submit = () => {
    const normalizedSlug = normalizeSlug(slug || name);
    const nextOrganization: Organization = {
      ...templateOrganization,
      id: buildOrganizationId(normalizedSlug),
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

    onCreate(nextOrganization);
    showToast({
      title: "Organización creada",
      description: `${nextOrganization.name} quedó lista para crear su primer evento.`,
      tone: "success",
    });
    onClose();
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
              Organization Setup
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Crear organización
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Define el espacio de trabajo antes de crear el evento. Todo seguirá operando en memoria.
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
          <Field label="Slug" value={slug} onChange={(value) => setSlug(normalizeSlug(value))} placeholder="nueva-organizacion" />
          <Field label="Timezone" value={timezone} onChange={setTimezone} placeholder="America/La_Paz" />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            Crear organización
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
