"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import StatusBadge from "@/components/status-badge";
import Topbar from "@/components/topbar";
import { formatReservationStatus, getReservationStatusTone } from "@/features/reservations/domain/reservation-domain";
import { useCheckInStore } from "@/services/workspace-service";
import { matchesText, normalizeText } from "@/features/customers/utils";
import { statusTone } from "@/features/customers/domain/customer-directory";
import type { GuestRecord } from "@/features/customers/types";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20;

export default function GuestDirectory() {
  const { activeEvent, customers } = useCheckInStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const activeEventStats =
    customers.eventStats[activeEvent.id] ??
    customers.eventStats[activeEvent.name] ?? {
      expectedGuests: 0,
      checkedIn: 0,
      pending: 0,
      attention: 0,
    };

  const normalizedQuery = normalizeText(searchQuery.trim());
  const hasMeaningfulQuery = normalizedQuery.length >= MIN_QUERY_LENGTH;

  const matchedGuests = useMemo(() => {
    if (!hasMeaningfulQuery) {
      return [];
    }

    return customers.guestRecords
      .filter((guest) => guest.eventId === activeEvent.id)
      .filter((guest) =>
        matchesText(
          [
            guest.guestName,
            guest.carnet,
            guest.whatsapp || "",
            guest.invitationCode,
            guest.accessCode ?? "",
            guest.qrToken ?? "",
            guest.reservationCode,
            guest.reservationName,
            guest.tableName ?? "Sin mesa",
          ].join(" "),
          normalizedQuery,
        ),
      )
      .sort((a, b) => {
        const aScore = a.guestName.localeCompare(b.guestName);
        return aScore;
      });
  }, [activeEvent.id, customers.guestRecords, hasMeaningfulQuery, normalizedQuery]);

  const visibleGuests = matchedGuests.slice(0, MAX_RESULTS);
  const hasMoreResults = matchedGuests.length > MAX_RESULTS;
  const selectedGuest =
    customers.guestRecords.find((guest) => guest.id === selectedGuestId) ?? null;

  const closeDrawer = useCallback(() => {
    setSelectedGuestId(null);
    requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selectedGuestId) {
      return;
    }

    if (!visibleGuests.some((guest) => guest.id === selectedGuestId)) {
      const frame = requestAnimationFrame(() => setSelectedGuestId(null));
      return () => cancelAnimationFrame(frame);
    }
  }, [selectedGuestId, visibleGuests]);

  useEffect(() => {
    if (!selectedGuestId) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeDrawer, selectedGuestId]);

  const openGuest = (guest: GuestRecord, trigger?: HTMLElement | null) => {
    lastTriggerRef.current = trigger ?? null;
    setSelectedGuestId(guest.id);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && visibleGuests[0]) {
      event.preventDefault();
      openGuest(visibleGuests[0]);
    }

    if (event.key === "Escape" && searchQuery) {
      event.preventDefault();
      setSearchQuery("");
    }
  };

  const eventSummary = formatEventSummary(activeEvent.date, activeEvent.startsAt);

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Invitados"
        title="Invitados"
        description="Busca y consulta invitados del evento activo."
      />

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <p className="kicker">Evento activo</p>
        <div className="mt-3 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-xl font-semibold tracking-tight text-white">
              {activeEvent.name}
            </h2>
            <p className="mt-2 break-words text-sm text-slate-400">{eventSummary}</p>
            <p className="mt-2 text-sm text-slate-400">
              {activeEventStats.checkedIn} ingresados · {activeEventStats.pending} pendientes
            </p>
          </div>
          <StatusBadge variant="info">{activeEvent.status}</StatusBadge>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/40 p-5">
        <p className="kicker">Búsqueda global</p>
        <div className="mt-3 flex flex-col gap-3">
          <div className="min-w-0">
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              data-shortcut-search="true"
              placeholder="Buscar por nombre, carnet, reserva o código..."
              className="h-13 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-cyan-500/10"
            />
          </div>

          <p className="text-sm leading-6 text-slate-400">
            La lista completa no se muestra por defecto. Escribe al menos {MIN_QUERY_LENGTH} caracteres para ver coincidencias.
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker">Resultados</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {hasMeaningfulQuery ? `${Math.min(visibleGuests.length, MAX_RESULTS)} coincidencias` : "Busca un invitado para ver coincidencias."}
            </h2>
            {hasMeaningfulQuery ? (
              <p className="mt-2 text-sm text-slate-400">
                {hasMoreResults ? `Mostrando ${MAX_RESULTS} de ${matchedGuests.length} coincidencias.` : `Mostrando ${matchedGuests.length} coincidencias.`}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {!hasMeaningfulQuery ? (
            <EmptyResultsState title="Busca un invitado para ver coincidencias." description="Usa nombre, carnet, reserva o código para comenzar." />
          ) : visibleGuests.length ? (
            visibleGuests.map((guest) => (
              <GuestResultCard
                key={guest.id}
                guest={guest}
                onOpenGuest={openGuest}
                isSelected={selectedGuestId === guest.id}
              />
            ))
          ) : (
            <EmptyResultsState
              title="Sin coincidencias"
              description={`No encontramos invitados para “${searchQuery.trim()}”.`}
            />
          )}
        </div>
      </section>

      {selectedGuest ? (
        <GuestDrawer
          key={selectedGuest.id}
          guest={selectedGuest}
          onClose={closeDrawer}
          drawerRef={drawerRef}
        />
      ) : null}
    </div>
  );
}

function GuestResultCard({
  guest,
  onOpenGuest,
  isSelected,
}: {
  guest: GuestRecord;
  onOpenGuest: (guest: GuestRecord, trigger?: HTMLElement | null) => void;
  isSelected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onOpenGuest(guest, event.currentTarget)}
      className={[
        "w-full rounded-[1.5rem] border p-4 text-left transition",
        isSelected
          ? "border-cyan-400/30 bg-cyan-400/10"
          : "border-white/10 bg-slate-950/40 hover:border-white/15 hover:bg-slate-950/55",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold text-white">{guest.guestName}</p>
            <p className="mt-1 break-words text-xs text-slate-400">{guest.carnet}</p>
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <StatusBadge variant={statusTone(guest.admissionStatus)}>{guest.admissionStatus}</StatusBadge>
            <StatusBadge variant={statusTone(guest.deliveryStatus)}>{guest.deliveryStatus}</StatusBadge>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <CompactMeta label="Reserva" value={`${guest.reservationCode} · ${guest.reservationName}`} />
          <CompactMeta label="Mesa / espacio" value={guest.tableName || "Sin mesa"} />
          <CompactMeta label="Código" value={guest.invitationCode} />
          <CompactMeta label="Ingreso" value={guest.checkInTime || "Pendiente"} />
        </div>
      </div>
    </button>
  );
}

function GuestDrawer({
  guest,
  onClose,
  drawerRef,
}: {
  guest: GuestRecord;
  onClose: () => void;
  drawerRef: RefObject<HTMLDivElement | null>;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className={[
          "absolute inset-0 bg-black/60 backdrop-blur-[1px] transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-label="Cerrar detalle del invitado"
        onClick={onClose}
      />

      <div
        className={[
          "absolute inset-y-0 right-0 flex w-[min(100vw,560px)] transition-transform duration-300 ease-out",
          isVisible ? "translate-x-0" : "translate-x-4",
        ].join(" ")}
      >
        <div
          ref={drawerRef}
          tabIndex={-1}
          className="ml-auto flex h-full w-full flex-col border-l border-white/10 bg-[#0d1117] shadow-[0_24px_120px_rgba(0,0,0,0.45)] outline-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-drawer-title"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                Detalle del invitado
              </p>
              <h2 id="guest-drawer-title" className="mt-2 break-words text-2xl font-semibold tracking-tight text-white">
                {guest.guestName}
              </h2>
              <p className="mt-1 break-words text-sm text-slate-400">
                {guest.reservationName} · {guest.invitationCode}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge variant={statusTone(guest.admissionStatus)}>{guest.admissionStatus}</StatusBadge>
                <StatusBadge variant={statusTone(guest.deliveryStatus)}>{guest.deliveryStatus}</StatusBadge>
                <StatusBadge variant={getReservationStatusTone(guest.reservationStatus)}>
                  {formatReservationStatus(guest.reservationStatus)}
                </StatusBadge>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Cerrar
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="kicker">Información</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <CompactMeta label="Carnet" value={guest.carnet} />
                <CompactMeta label="WhatsApp" value={guest.whatsapp || "Sin WhatsApp"} />
                <CompactMeta label="Reserva" value={`${guest.reservationCode} · ${guest.reservationName}`} />
                <CompactMeta label="Mesa / espacio" value={guest.tableName || "Sin mesa"} />
                <CompactMeta label="Estado de ingreso" value={guest.admissionStatus} />
                <CompactMeta label="Estado de entrega" value={guest.deliveryStatus} />
              </div>
            </section>

            {guest.attention || guest.internalNotes ? (
              <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
                <p className="kicker">Observaciones</p>
                <p className="mt-3 break-words text-sm leading-6 text-slate-300">
                  {guest.attention || guest.internalNotes || "Sin observaciones operativas."}
                </p>
              </section>
            ) : (
              <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
                <p className="kicker">Observaciones</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">Sin observaciones operativas.</p>
              </section>
            )}
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
      <p className="break-words text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
        {label}
      </p>
      <p className="break-words text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function EmptyResultsState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}

function formatEventSummary(date?: string, startsAt?: string) {
  if (!date && !startsAt) {
    return "Evento activo";
  }

  return [date, startsAt].filter(Boolean).join(" · ");
}
