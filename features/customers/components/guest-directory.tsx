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

import InvitationCard from "@/features/access/components/invitation-card";
import type { InvitationDesign } from "@/features/access/domain/access-domain";
import { INVITATION_RENDER_SIZE, getInvitationDownloadFilename } from "@/features/access/domain/invitation-rendering";
import { renderInvitationImageBlob, waitForInvitationImageNodeReady } from "@/features/access/domain/invitation-image-export";
import { canSendWhatsAppInvitation, normalizeWhatsAppPhoneNumber } from "@/features/access/domain/whatsapp-delivery";
import { prepareWhatsAppInvitationMediaBlob } from "@/features/access/domain/whatsapp-invitation-media";
import { buildGuestInvitationDesign } from "@/features/access/domain/whatsapp-reservation-invitations";
import {
  getWhatsAppDeliveryStatusLabel,
  getWhatsAppDeliveryStatusTone,
  type WhatsAppDeliveryState,
} from "@/features/access/domain/whatsapp-delivery-tracking";
import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import Topbar from "@/components/topbar";
import type { Guest as CheckInGuest } from "@/features/check-in/types";
import { buildGuestQuickReadSummary } from "@/features/check-in/domain/check-in-domain";
import { formatGuestCarnetLabel } from "@/features/check-in/domain/check-in-domain";
import { formatReservationStatus, getReservationStatusTone } from "@/features/reservations/domain/reservation-domain";
import { useCheckInStore } from "@/services/workspace-service";
import { matchesText, normalizeText } from "@/features/customers/utils";
import { statusTone } from "@/features/customers/domain/customer-directory";
import type { GuestRecord } from "@/features/customers/types";
import GuestEditModal from "@/features/customers/components/guest-edit-modal";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20;

export default function GuestDirectory() {
  const { activeEvent, can, customers, updateGuestProfile } = useCheckInStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);

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
  const editingGuest = customers.guestRecords.find((guest) => guest.id === editingGuestId) ?? null;
  const canEditGuest = can("guest.edit");

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

  const openEditGuest = (guest: GuestRecord) => {
    setEditingGuestId(guest.id);
  };

  const handleSaveGuest = async ({
    guestId,
    guestName,
    carnet,
    whatsapp,
  }: {
    guestId: string;
    guestName: string;
    carnet: string;
    whatsapp: string;
  }) => updateGuestProfile({ guestId, guestName, carnet, whatsapp });

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
          onEdit={canEditGuest ? openEditGuest : undefined}
          drawerRef={drawerRef}
        />
      ) : null}

      <GuestEditModal
        key={editingGuest ? `${editingGuest.id}-${editingGuestId ? "open" : "closed"}` : "closed"}
        open={Boolean(editingGuest)}
        guest={editingGuest}
        onClose={() => setEditingGuestId(null)}
        onSave={handleSaveGuest}
      />
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
  const quickRead = buildGuestQuickReadSummary(guest);
  const deliveryTone = getGuestDeliveryStatusTone(guest);

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
            <p className="break-words text-sm font-semibold text-white">{quickRead.name}</p>
            <p className="mt-1 break-words text-xs text-slate-400">{formatGuestCarnetLabel(quickRead.carnet)}</p>
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <StatusBadge variant={statusTone(guest.admissionStatus)}>{guest.admissionStatus}</StatusBadge>
            <StatusBadge variant={deliveryTone}>{getGuestDeliveryStatusLabel(guest)}</StatusBadge>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <CompactMeta label="Reserva" value={quickRead.reservation} />
          <CompactMeta label="Mesa / espacio" value={quickRead.space} />
          <CompactMeta label="Ingreso" value={quickRead.entryStatus} />
          <CompactMeta label="WhatsApp" value={guest.whatsapp || "Sin WhatsApp"} />
        </div>
      </div>
    </button>
  );
}

function GuestDrawer({
  guest,
  onClose,
  onEdit,
  drawerRef,
}: {
  guest: GuestRecord;
  onClose: () => void;
  onEdit?: (guest: GuestRecord) => void;
  drawerRef: RefObject<HTMLDivElement | null>;
}) {
  const { showToast } = useFeedback();
  const { currentEvent, currentVenue, reservations, setGuestsState } = useCheckInStore();
  const [isVisible, setIsVisible] = useState(false);
  const [isInvitationPreviewOpen, setIsInvitationPreviewOpen] = useState(false);
  const [isExportingInvitation, setIsExportingInvitation] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const exportInvitationRef = useRef<HTMLDivElement | null>(null);

  const visibleInvitationCode = guest.accessCode ?? guest.invitationCode;
  const isWhatsAppReady = Boolean(normalizeWhatsAppPhoneNumber(guest.whatsapp));
  const reservationHolderName = useMemo(
    () =>
      reservations.find((reservation) => reservation.code === guest.reservationCode || reservation.id === guest.reservationCode)?.holderName ??
      undefined,
    [guest.reservationCode, reservations],
  );

  const invitation = useMemo<InvitationDesign>(
    () =>
      buildGuestInvitationDesign({
        guest: {
          id: guest.id,
          guestName: guest.guestName,
          reservationName: guest.reservationName,
          reservationCode: guest.reservationCode,
          seat: guest.seat,
          tableName: guest.tableName,
          accessCode: guest.accessCode,
          invitationCode: guest.invitationCode,
          qrToken: guest.qrToken,
        },
        currentEvent,
        currentVenueName: currentVenue?.name,
        reservationHolderName,
      }),
    [currentEvent, currentVenue?.name, guest.accessCode, guest.guestName, guest.id, guest.invitationCode, guest.qrToken, guest.reservationCode, guest.reservationName, guest.seat, guest.tableName, reservationHolderName],
  );

  const handleDownloadInvitation = useCallback(async () => {
    if (!exportInvitationRef.current || isExportingInvitation) {
      return;
    }

    setIsExportingInvitation(true);

    try {
      await waitForInvitationImageNodeReady(exportInvitationRef.current);
      const { blob, filename } = await renderInvitationImageBlob(exportInvitationRef.current, {
        filename: getInvitationDownloadFilename(visibleInvitationCode),
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

      showToast({
        title: "Invitación descargada",
        description: "Se generó el PNG con el QR real del invitado.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "No se pudo descargar la invitación",
        description: error instanceof Error ? error.message : "La exportación PNG no pudo completarse.",
        tone: "error",
      });
    } finally {
      setIsExportingInvitation(false);
    }
  }, [isExportingInvitation, showToast, visibleInvitationCode]);

  const handleSendWhatsApp = useCallback(async () => {
    if (!canSendWhatsAppInvitation({ isReady: isWhatsAppReady, isSending: isSendingWhatsApp })) {
      if (!isWhatsAppReady) {
        showToast({
          title: "WhatsApp no válido",
          description: "Necesitás un número válido para enviar la invitación.",
          tone: "warning",
        });
      }

      return;
    }

    setIsSendingWhatsApp(true);

    try {
      if (!exportInvitationRef.current) {
        throw new Error("No se pudo preparar la invitación para WhatsApp.");
      }

      await waitForInvitationImageNodeReady(exportInvitationRef.current);
      const invitationImage = await renderInvitationImageBlob(exportInvitationRef.current, {
        filename: getInvitationDownloadFilename(visibleInvitationCode),
      });

      const mediaAsset = await prepareWhatsAppInvitationMediaBlob(invitationImage.blob, invitationImage.filename);
      const mediaFormData = new FormData();
      mediaFormData.append("file", new File([mediaAsset.blob], mediaAsset.filename, { type: mediaAsset.mimeType }));

      const mediaResponse = await fetch("/api/whatsapp/media", {
        method: "POST",
        body: mediaFormData,
      });

      const mediaPayload = (await mediaResponse.json().catch(() => null)) as {
        error?: { message?: string };
        mediaId?: string;
      } | null;

      if (!mediaResponse.ok) {
        throw new Error(mediaPayload?.error?.message || "No se pudo subir la invitación para WhatsApp.");
      }

      const mediaId = mediaPayload?.mediaId?.trim();

      if (!mediaId) {
        throw new Error("WhatsApp Media no devolvió un identificador válido.");
      }

      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          guestId: guest.id,
          recipient: guest.whatsapp,
          guestName: guest.guestName,
          eventName: currentEvent.name,
          accessCode: visibleInvitationCode,
          mediaId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: { message?: string };
            providerAccepted?: boolean;
            trackingPersisted?: boolean;
            status?: string;
            warning?: { message?: string };
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error?.message || "No se pudo enviar la invitación por WhatsApp.");
      }

      const trackingPersisted = payload?.trackingPersisted !== false;
      const timestamp = new Date().toISOString();
      const nextDeliveryStatus =
        guest.deliveryStatus === "Enviada" || guest.deliveryStatus === "Reenviada" || guest.deliveryStatus === "Vista"
          ? "Reenviada"
          : "Enviada";
      const nextGuestActivityDetail = trackingPersisted
        ? "Envío por WhatsApp aceptado por proveedor"
        : payload?.warning?.message || "WhatsApp aceptó el mensaje, pero EntryFlow no pudo registrar su seguimiento. No lo reenvíes todavía.";

      const nextGuestActivity = {
        time: timestamp.slice(11, 16),
        title: nextDeliveryStatus,
        detail: nextGuestActivityDetail,
      };

      setGuestsState((current) =>
        current.map((item): CheckInGuest =>
          item.id === guest.id
            ? {
                ...item,
                deliveryStatus: nextDeliveryStatus,
                noInvitationSent: false,
                recentChange: true,
                deliveryHistory: [...item.deliveryHistory, nextGuestActivity],
                whatsappDelivery: {
                  messageId: item.whatsappDelivery?.messageId || visibleInvitationCode,
                  attemptNumber: (item.whatsappDelivery?.attemptNumber ?? 0) + 1,
                  currentStatus: "accepted",
                  updatedAt: timestamp,
                  acceptedAt: timestamp,
                },
              }
            : item,
        ),
      );
      if (trackingPersisted) {
        showToast({
          title: nextDeliveryStatus === "Reenviada" ? "Invitación reenviada" : "Invitación enviada",
          description: "El estado visible se actualizó en el detalle del invitado.",
          tone: "success",
        });
      } else {
        showToast({
          title: "WhatsApp aceptó el envío",
          description: payload?.warning?.message || "No pudimos registrar su seguimiento. No lo reenvíes todavía.",
          tone: "warning",
        });
      }
    } catch (error) {
      showToast({
        title: "No se pudo enviar la invitación",
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        tone: "error",
      });
    } finally {
      setIsSendingWhatsApp(false);
    }
  }, [currentEvent.name, guest, isSendingWhatsApp, isWhatsAppReady, setGuestsState, showToast, visibleInvitationCode]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isInvitationPreviewOpen) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setIsInvitationPreviewOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [isInvitationPreviewOpen]);

  useEffect(() => {
    if (!isInvitationPreviewOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isInvitationPreviewOpen]);

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
                <StatusBadge variant={getGuestDeliveryStatusTone(guest)}>{getGuestDeliveryStatusLabel(guest)}</StatusBadge>
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
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(guest)}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
              >
                Editar
              </button>
            ) : null}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="kicker">Quién es</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <CompactMeta label="Carnet" value={guest.carnet} />
                <CompactMeta label="WhatsApp" value={guest.whatsapp || "Sin WhatsApp"} />
                <CompactMeta label="Estado de ingreso" value={guest.admissionStatus} />
                <CompactMeta label="Estado de entrega" value={getGuestDeliveryStatusLabel(guest)} />
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="kicker">Dónde pertenece</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <CompactMeta label="Reserva" value={`${guest.reservationCode} · ${guest.reservationName}`} />
                <CompactMeta label="Mesa / espacio" value={guest.tableName || "Sin mesa"} />
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="kicker">Invitación</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Revisa, descarga o comparte la misma invitación real que consume Ingreso.
                  </p>
                </div>
                <StatusBadge variant={getGuestDeliveryStatusTone(guest)}>{getGuestDeliveryStatusLabel(guest)}</StatusBadge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <CompactMeta label="Código visible" value={visibleInvitationCode} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsInvitationPreviewOpen(true)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
                >
                  Visualizar invitación
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadInvitation()}
                  disabled={isExportingInvitation}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isExportingInvitation ? "Descargando..." : "Descargar PNG"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendWhatsApp()}
                  disabled={isSendingWhatsApp || !isWhatsAppReady}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-50 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSendingWhatsApp ? "Enviando..." : "Enviar por WhatsApp"}
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                {isWhatsAppReady
                  ? "El botón usa el número del invitado y el QR opaco real."
                  : "Agrega un WhatsApp válido para habilitar el envío."}
              </p>
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

      <InvitationPreviewModal
        isOpen={isInvitationPreviewOpen}
        invitation={invitation}
        isExporting={isExportingInvitation}
        onClose={() => setIsInvitationPreviewOpen(false)}
        onDownload={() => void handleDownloadInvitation()}
      />

      <div className="pointer-events-none fixed left-[-200vw] top-0 w-[1080px] overflow-hidden" aria-hidden="true">
        <div ref={exportInvitationRef} className="w-[1080px]">
          <InvitationCard invitation={invitation} mode="download" />
        </div>
      </div>

    </div>
  );
}

function getGuestDeliveryState(guest: GuestRecord): WhatsAppDeliveryState | undefined {
  return guest.whatsappDelivery;
}

function getGuestDeliveryStatusLabel(guest: GuestRecord) {
  const deliveryState = getGuestDeliveryState(guest);

  if (deliveryState) {
    return getWhatsAppDeliveryStatusLabel(deliveryState.currentStatus);
  }

  return guest.deliveryStatus;
}

function getGuestDeliveryStatusTone(guest: GuestRecord) {
  const deliveryState = getGuestDeliveryState(guest);

  if (deliveryState) {
    return getWhatsAppDeliveryStatusTone(deliveryState.currentStatus);
  }

  return statusTone(guest.deliveryStatus);
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

function InvitationPreviewModal({
  isOpen,
  invitation,
  isExporting,
  onClose,
  onDownload,
}: {
  isOpen: boolean;
  invitation: InvitationDesign;
  isExporting: boolean;
  onClose: () => void;
  onDownload: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Cerrar vista previa de invitación"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
        <div className="relative flex h-[calc(100vh-2rem)] w-full max-w-[min(94vw,520px)] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b111a] shadow-[0_24px_120px_rgba(0,0,0,0.55)] sm:h-[calc(100vh-3rem)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Vista previa
              </p>
              <p className="mt-1 text-sm text-slate-400">La misma invitación que se descarga y se comparte.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Cerrar
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              <InvitationPreviewStage invitation={invitation} />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onDownload}
                disabled={isExporting}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExporting ? "Descargando..." : "Descargar PNG"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvitationPreviewStage({ invitation }: { invitation: InvitationDesign }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = stageRef.current;

    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setStageSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const scale = useMemo(() => {
    if (!stageSize.width || !stageSize.height) {
      return 0.24;
    }

    const widthScale = stageSize.width / INVITATION_RENDER_SIZE.width;
    const heightScale = stageSize.height / INVITATION_RENDER_SIZE.height;

    return Math.min(widthScale, heightScale, 1);
  }, [stageSize.height, stageSize.width]);

  const renderWidth = INVITATION_RENDER_SIZE.width * scale;
  const renderHeight = INVITATION_RENDER_SIZE.height * scale;

  return (
    <div ref={stageRef} className="flex min-h-0 w-full items-center justify-center">
      <div className="relative shrink-0" style={{ width: renderWidth, height: renderHeight }}>
        <InvitationCard invitation={invitation} mode="preview" className="h-full w-full" />
      </div>
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
