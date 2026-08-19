"use client";

import { useEffect, useState } from "react";

import { useFeedback } from "@/components/premium-feedback";
import type { GuestRecord } from "@/features/customers/types";
import {
  validateGuestProfileUpdateInput,
  type GuestProfileUpdateInput,
} from "@/features/customers/domain/customer-directory";

type GuestEditModalProps = {
  open: boolean;
  guest: GuestRecord | null;
  onClose: () => void;
  onSave: (input: GuestProfileUpdateInput & { guestId: string }) => Promise<GuestRecord | undefined>;
};

export default function GuestEditModal({ open, guest, onClose, onSave }: GuestEditModalProps) {
  const { showToast } = useFeedback();
  const [guestName, setGuestName] = useState(() => guest?.guestName ?? "");
  const [carnet, setCarnet] = useState(() => guest?.carnet ?? "");
  const [whatsapp, setWhatsapp] = useState(() => guest?.whatsapp ?? "");
  const [fieldErrors, setFieldErrors] = useState<{ guestName?: string; whatsapp?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  const title = guest?.guestName ?? "Editar invitado";

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  if (!open || !guest) {
    return null;
  }

  const handleSave = async () => {
    const validation = validateGuestProfileUpdateInput({
      guestName,
      carnet,
      whatsapp,
    });

    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
    setIsSaving(true);

    try {
      const savedGuest = await onSave({
        guestId: guest.id,
        ...validation.value,
      });

      if (savedGuest) {
        onClose();
      }
    } catch (error) {
      showToast({
        title: "No pudimos guardar el invitado",
        description: error instanceof Error ? error.message : "Revisá la conexión con Supabase.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Cerrar edición de invitado"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-6 sm:px-6">
        <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b111a] shadow-[0_30px_120px_rgba(0,0,0,0.6)] sm:max-h-[calc(100dvh-3rem)]">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Editar invitado</p>
              <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight text-white">{title}</h2>
              <p className="mt-2 break-words text-sm text-slate-400">
                Editá solo el perfil operativo. El acceso, el QR y la reserva se preservan.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Cerrar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="kicker">Contexto canonical</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <CompactMeta label="Evento" value={guest.eventName} />
                <CompactMeta label="Reserva" value={`${guest.reservationCode} · ${guest.reservationName}`} />
                <CompactMeta label="Código visible" value={guest.accessCode ?? guest.invitationCode} />
                <CompactMeta label="Estado de ingreso" value={guest.admissionStatus} />
              </div>
            </section>

            <section className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="kicker">Perfil operativo</p>
              <div className="mt-4 grid gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Nombre</span>
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder="Nombre del invitado"
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  />
                  {fieldErrors.guestName ? (
                    <p className="mt-2 text-xs text-rose-200">{fieldErrors.guestName}</p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Se preserva el mismo invitado y el mismo acceso.</p>
                  )}
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Carnet</span>
                  <input
                    value={carnet}
                    onChange={(event) => setCarnet(event.target.value)}
                    placeholder="Carnet"
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  />
                  <p className="mt-2 text-xs text-slate-500">Se permite vacío si el invitado no tiene documento.</p>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">WhatsApp</span>
                  <input
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(event.target.value)}
                    placeholder="+591 70000000"
                    inputMode="tel"
                    autoComplete="tel"
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  />
                  {fieldErrors.whatsapp ? (
                    <p className="mt-2 text-xs text-rose-200">{fieldErrors.whatsapp}</p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Si lo dejás vacío, el invitado quedará sin WhatsApp.</p>
                  )}
                </label>
              </div>
            </section>

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              El QR, el código de acceso, el historial de entregas y el estado de ingreso no cambian con esta edición.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="break-words text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="break-words text-sm font-medium text-white">{value}</p>
    </div>
  );
}
