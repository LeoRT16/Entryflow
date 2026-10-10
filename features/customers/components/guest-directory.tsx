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
  resolveGuestDeliveryStatus,
  type WhatsAppDeliveryState,
} from "@/features/access/domain/whatsapp-delivery-tracking";
import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import type { Guest as CheckInGuest } from "@/features/check-in/types";
import { buildGuestQuickReadSummary } from "@/features/check-in/domain/check-in-domain";
import { formatGuestCarnetLabel } from "@/features/check-in/domain/check-in-domain";
import { normalizeReservationStatus } from "@/features/reservations/domain/reservation-domain";
import { useCheckInStore } from "@/services/workspace-service";
import { matchesText, normalizeText } from "@/features/customers/utils";
import { statusTone } from "@/features/customers/domain/customer-directory";
import type { GuestRecord } from "@/features/customers/types";
import GuestEditModal from "@/features/customers/components/guest-edit-modal";
import { formatEventWallDateTime } from "@/lib/date-time";
import { isOperationalReservationGuest } from "@/features/reservations/domain/reservation-domain";
import type { ReservationType } from "@/features/reservations/types";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20;
const attendeeFilters = ["Todos", "Mesa", "Preventa", "Cortesía", "Históricos"] as const;
type AttendeeFilter = typeof attendeeFilters[number];

export default function GuestDirectory() {
  const { activeEvent, can, customers, reservations, updateGuestProfile, rotateGuestAccessCredential } = useCheckInStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [attendeeFilter, setAttendeeFilter] = useState<AttendeeFilter>("Todos");

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
      .filter((guest) => {
        const operational = isOperationalReservationGuest(guest);
        if (attendeeFilter === "Históricos") return !operational;
        if (!operational) return false;
        if (attendeeFilter === "Todos") return true;
        const reservation = reservationsForGuest(guest, reservations);
        return reservation?.reservationType === attendeeFilter;
      })
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
  }, [activeEvent.id, attendeeFilter, customers.guestRecords, hasMeaningfulQuery, normalizedQuery]);

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
    <div className="space-y-5">
      <section className="surface-panel space-y-4 p-4 xl:p-5">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker">Invitados</p>
            <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-white">Buscar invitados</h1>
            <p className="mt-1 break-words text-sm text-slate-400">
              {activeEvent.name} · {eventSummary} · {activeEventStats.checkedIn} ingresados · {activeEventStats.pending} pendientes
            </p>
          </div>
          <StatusBadge variant="info">{activeEvent.status}</StatusBadge>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor="guest-directory-search" className="sr-only">Buscar invitados</label>
          <input
            id="guest-directory-search"
            ref={searchRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            data-shortcut-search="true"
            placeholder="Buscar por nombre, carnet, reserva o código..."
            className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-cyan-500/10"
          />
          <p className="shrink-0 text-xs text-slate-500">Escribe al menos {MIN_QUERY_LENGTH} caracteres.</p>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar invitados">
          {attendeeFilters.map((filter) => (
            <button key={filter} type="button" aria-pressed={attendeeFilter === filter} onClick={() => setAttendeeFilter(filter)} className={["shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition", attendeeFilter === filter ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-50" : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]"].join(" ")}>{filter}</button>
          ))}
        </div>
      </section>

      <section className="surface-panel min-w-0 p-4 xl:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div><p className="kicker">Resultados</p><h2 className="mt-1 text-xl font-semibold text-white">{hasMeaningfulQuery ? `${Math.min(visibleGuests.length, MAX_RESULTS)} coincidencias` : "Busca un invitado para comenzar."}</h2></div>
          {hasMeaningfulQuery && hasMoreResults ? <p className="text-xs text-slate-500">Mostrando {MAX_RESULTS} de {matchedGuests.length}</p> : null}
        </div>
        <div className="mt-4 space-y-2">
          {!hasMeaningfulQuery ? <EmptyResultsState title="Busca un invitado para comenzar." /> : visibleGuests.length ? visibleGuests.map((guest) => <GuestResultCard key={guest.id} guest={guest} reservation={reservationsForGuest(guest, reservations)} onOpenGuest={openGuest} isSelected={selectedGuestId === guest.id} />) : <EmptyResultsState title="No encontramos invitados que coincidan con esta búsqueda." />}
        </div>
      </section>

      {selectedGuest ? (
        <GuestDrawer
          key={selectedGuest.id}
          guest={selectedGuest}
          onClose={closeDrawer}
          onEdit={canEditGuest ? openEditGuest : undefined}
          canRegenerate={can("access.regenerate")}
          onRegenerate={rotateGuestAccessCredential}
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
  reservation,
  onOpenGuest,
  isSelected,
}: {
  guest: GuestRecord;
  reservation?: { reservationType?: ReservationType } | null;
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
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold text-white">{quickRead.name}</p>
            <p className="mt-1 break-words text-xs text-slate-400">{formatGuestCarnetLabel(quickRead.carnet)}</p>
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <StatusBadge variant={statusTone(guest.admissionStatus)}>{guest.admissionStatus}</StatusBadge>
            {reservation?.reservationType ? <span className="text-xs text-slate-500">{reservation.reservationType}</span> : null}
          </div>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>{quickRead.reservation}</span>
          {quickRead.space !== "Sin mesa" ? <span>{quickRead.space}</span> : null}
          <span className={deliveryTone === "danger" ? "text-rose-200" : "text-slate-400"}>{getGuestDeliveryStatusLabel(guest)}</span>
        </div>
    </button>
  );
}

function reservationsForGuest(guest: GuestRecord, reservations: Array<{ id: string; code: string; reservationType?: ReservationType }>) {
  return reservations.find((reservation) => reservation.id === guest.reservationId || reservation.code === guest.reservationCode) ?? null;
}

function GuestDrawer({
  guest,
  onClose,
  onEdit,
  canRegenerate,
  onRegenerate,
  drawerRef,
}: {
  guest: GuestRecord;
  onClose: () => void;
  onEdit?: (guest: GuestRecord) => void;
  canRegenerate: boolean;
  onRegenerate: (guestId: string) => Promise<GuestRecord>;
  drawerRef: RefObject<HTMLDivElement | null>;
}) {
  const { showToast, confirm } = useFeedback();
  const { currentEvent, currentVenue, reservations, setGuestsState } = useCheckInStore();
  const [isVisible, setIsVisible] = useState(false);
  const [isInvitationPreviewOpen, setIsInvitationPreviewOpen] = useState(false);
  const [isExportingInvitation, setIsExportingInvitation] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const exportInvitationRef = useRef<HTMLDivElement | null>(null);

  const visibleInvitationCode = guest.accessCode ?? guest.invitationCode;
  const isWhatsAppReady = Boolean(normalizeWhatsAppPhoneNumber(guest.whatsapp));
  const canRegenerateGuest = canRegenerate && guest.admissionStatus !== "Ingresó" && guest.admissionStatus !== "Anulada" && guest.reservationStatus !== "Cancelled";
  const showReservationStatus = !(guest.admissionStatus === "Ingresó" && normalizeReservationStatus(guest.reservationStatus) === "Checked In");
  const reservation = reservations.find((item) => item.id === guest.reservationId || item.code === guest.reservationCode);
  const handleRegenerate = () => {
    if (!canRegenerateGuest || isRegenerating) return;
    confirm({
      title: "Regenerar QR",
      description: "El QR actual dejará de funcionar y se generará uno nuevo. El invitado y su reserva no cambiarán.",
      confirmLabel: "Regenerar QR",
      cancelLabel: "Cancelar",
      tone: "warning",
      onConfirm: () => {
        void (async () => {
          setIsRegenerating(true);
          try {
            await onRegenerate(guest.id);
            showToast({ title: "QR regenerado", description: "La nueva credencial quedó disponible para la invitación.", tone: "success" });
          } catch (error) {
            showToast({ title: "No se pudo regenerar el QR", description: error instanceof Error ? error.message : "La credencial no pudo actualizarse.", tone: "error" });
          } finally { setIsRegenerating(false); }
        })();
      },
    });
  };
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
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge variant={statusTone(guest.admissionStatus)}>{guest.admissionStatus}</StatusBadge>
                <span className="text-xs text-slate-400">{getDeliveryPresentationLabel(guest)}</span>
                {showReservationStatus ? <span className="text-xs text-slate-400">{getReservationPresentationLabel(guest.reservationStatus)}</span> : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Cerrar
            </button>
            <GuestActionMenu items={[
              ...(onEdit ? [{ id: "edit", label: "Editar invitado", onSelect: () => onEdit(guest) }] : []),
              { id: "download", label: isExportingInvitation ? "Descargando…" : "Descargar PNG", onSelect: () => void handleDownloadInvitation() },
              ...(isWhatsAppReady ? [{ id: "whatsapp", label: isSendingWhatsApp ? "Enviando…" : "Enviar por WhatsApp", onSelect: () => void handleSendWhatsApp() }] : []),
              ...(canRegenerateGuest ? [{ id: "regenerate", label: isRegenerating ? "Regenerando…" : "Regenerar QR", onSelect: handleRegenerate }] : []),
            ]} />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="kicker">Quién es</p>
              <DefinitionList className="mt-3" items={[{ label: "Carnet", value: guest.carnet || "No registrado" }, { label: "WhatsApp", value: guest.whatsapp || "Sin WhatsApp" }, { label: "Ingreso", value: guest.admissionStatus }]} />
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="kicker">Reserva</p>
              <DefinitionList className="mt-3" items={[{ label: "Nombre", value: guest.reservationName }, { label: "Tipo", value: reservation?.reservationType ?? "Reserva" }, ...(guest.tableName ? [{ label: "Mesa / espacio", value: guest.tableName }] : []),]} />
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="kicker">Invitación</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Invitación asociada a este invitado.
                  </p>
                </div>
              </div>

              <DefinitionList className="mt-3" items={[{ label: "Código", value: visibleInvitationCode }]} />

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsInvitationPreviewOpen(true)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
                >
                  Visualizar invitación
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                {isWhatsAppReady ? "WhatsApp disponible para envío desde Más acciones." : "No hay un WhatsApp válido para enviar."}
              </p>
            </section>

            {guest.attention || guest.internalNotes ? (
              <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
                <p className="kicker">Observaciones</p>
                <p className="mt-3 break-words text-sm leading-6 text-slate-300">
                  {guest.attention || guest.internalNotes || "Sin observaciones operativas."}
                </p>
              </section>
            ) : null}
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

  return resolveGuestDeliveryStatus(guest);
}

function getGuestDeliveryStatusTone(guest: GuestRecord) {
  const deliveryState = getGuestDeliveryState(guest);

  if (deliveryState) {
    return getWhatsAppDeliveryStatusTone(deliveryState.currentStatus);
  }

  return statusTone(resolveGuestDeliveryStatus(guest));
}

function getDeliveryPresentationLabel(guest: GuestRecord) {
  const status = getGuestDeliveryStatusLabel(guest);
  return status === "Pendiente de envío" ? "Invitación pendiente" : status === "Enviada" ? "Invitación enviada" : status === "Reenviada" ? "Invitación reenviada" : status === "Vista" ? "Invitación vista" : "Invitación fallida";
}

function getReservationPresentationLabel(status: GuestRecord["reservationStatus"]) {
  const normalized = normalizeReservationStatus(status);
  return normalized === "Confirmed" ? "Reserva confirmada" : normalized === "Pending" ? "Reserva pendiente" : normalized === "Cancelled" ? "Reserva cancelada" : normalized === "Completed" ? "Reserva completada" : "Reserva en estado operativo";
}

function DefinitionList({ items, className = "" }: { items: Array<{ label: string; value: string }>; className?: string }) {
  return (
    <dl className={`divide-y divide-white/10 ${className}`}>
      {items.map((item) => <div key={item.label} className="grid min-w-0 gap-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3"><dt className="text-xs text-slate-500">{item.label}</dt><dd className="break-words text-sm font-medium text-white">{item.value}</dd></div>)}
    </dl>
  );
}

function GuestActionMenu({ items }: { items: Array<{ id: string; label: string; onSelect: () => void }> }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={rootRef} className="relative">
    <button type="button" aria-label="Más acciones del invitado" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white">•••</button>
    {open ? <div role="menu" aria-label="Más acciones del invitado" className="absolute right-0 top-12 z-10 w-52 rounded-2xl border border-white/10 bg-[#0b0f14] p-2 shadow-2xl">
      {items.map((item) => <button key={item.id} type="button" role="menuitem" onClick={() => { item.onSelect(); setOpen(false); }} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-white hover:bg-white/[0.08]">{item.label}</button>)}
    </div> : null}
  </div>;
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
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      {description ? <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p> : null}
    </div>
  );
}

function formatEventSummary(date?: string, startsAt?: string) {
  if (!date && !startsAt) {
    return "Evento activo";
  }
  const value = date?.includes("T") || date?.includes(" ") ? date : [date, startsAt].filter(Boolean).join("T");
  return formatEventWallDateTime(value ?? "");
}
