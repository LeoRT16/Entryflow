"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import InvitationCard from "@/features/access/components/invitation-card";
import type { Event as PlatformEvent } from "@/features/domain/types";
import type { Guest as CheckInGuest } from "@/features/check-in/types";
import StatusBadge from "@/components/status-badge";
import { useFeedback } from "@/components/premium-feedback";
import { sendReservationWhatsAppInvitation } from "@/features/access/domain/whatsapp-reservation-invitation-delivery";
import {
  buildReservationWhatsAppInvitationPlan,
  getWhatsAppDeliveryAcceptedMessage,
  getWhatsAppDeliveryAttemptNumber,
  getWhatsAppDeliveryTimestampLabel,
} from "@/features/access/domain/whatsapp-reservation-invitations";
import { getLegacyWhatsAppDeliveryStatus } from "@/features/access/domain/whatsapp-delivery-tracking";
import {
  formatReservationStatus,
  getReservationStatusTone,
  isTerminalReservationStatus,
} from "@/features/reservations/domain/reservation-domain";
import {
  canHardDeleteGuest,
  canHardDeleteReservation,
} from "@/features/reservations/domain/reservation-deletion";
import type {
  ReservationGuestAction,
  ReservationGuestInput,
  ReservationSummary,
} from "@/features/reservations/types";
export { canHardDeleteGuest, canHardDeleteReservation };
import type {
  ReservationWhatsAppInvitationCandidate,
  ReservationWhatsAppInvitationPlan,
} from "@/features/access/domain/whatsapp-reservation-invitations";

type ReservationOperationsBoardProps = {
  currentEvent: Pick<PlatformEvent, "name" | "startAt" | "timezone" | "venue">;
  currentVenueName?: string | null;
  reservationGuests: CheckInGuest[];
  reservations: ReservationSummary[];
  activeReservationId: string;
  isTerminalEvent?: boolean;
  canEditGuest: boolean;
  canEditReservation: boolean;
  canDeleteReservation: boolean;
  canIssueWhatsAppInvitations: boolean;
  setGuestsState: Dispatch<SetStateAction<CheckInGuest[]>>;
  onSelectReservation: (reservationId: string) => void;
  onEditReservation: (reservationId: string) => void;
  onDeleteReservation: (reservationId: string) => Promise<void>;
  onCancelReservation: (reservationId: string) => void;
  onMarkConfirmed: (reservationId: string) => void;
  onAddGuest: (reservationId: string, guest: ReservationGuestInput) => void;
  onGuestAction: (params: {
    reservationId: string;
    guestId: string;
    action: ReservationGuestAction;
  }) => void;
  onRegisterCheckIn: (reservationId: string, guestId: string) => void;
  onEditGuest: (guestId: string) => void;
};

type GuestOverflowActionTone = "success" | "warning" | "danger" | "info";

type GuestOverflowActionItem = {
  id: string;
  label: string;
  tone?: GuestOverflowActionTone;
  onSelect: () => void;
};

type ReservationWhatsAppBatchResult = {
  guestId: string;
  guestName: string;
  status: "accepted" | "failed";
  providerAccepted: boolean;
  trackingPersisted: boolean;
  warning?: string;
  detail: string;
  isRetry: boolean;
};

type ReservationWhatsAppBatchSummary = {
  results: ReservationWhatsAppBatchResult[];
  skippedCount: number;
  acceptedCount: number;
  failedCount: number;
  warningCount: number;
};

export function summarizeReservationWhatsAppBatchResults(
  results: ReservationWhatsAppBatchResult[],
  skippedCount: number,
): ReservationWhatsAppBatchSummary {
  const acceptedCount = results.filter((item) => item.providerAccepted).length;
  const failedCount = results.filter((item) => !item.providerAccepted).length;
  const warningCount = results.filter((item) => item.providerAccepted && !item.trackingPersisted).length;

  return {
    results,
    skippedCount,
    acceptedCount,
    failedCount,
    warningCount,
  };
}

export function getReservationGuestActionVisibility(
  reservationStatus: ReservationSummary["status"],
  guest: ReservationSummary["guests"][number],
  eventTerminal = false,
) {
  const terminal = eventTerminal || isTerminalReservationStatus(reservationStatus);

  return {
    terminal,
    showConfirm: !terminal && guest.canConfirm,
    showCheckIn: !terminal && guest.canCheckIn,
    showRevert: !terminal && guest.canRevert,
    showCancel: !terminal && guest.canCancel,
    showRemove: !terminal && guest.canRemove,
  };
}

function guestOverflowToneClasses(tone: GuestOverflowActionTone) {
  return tone === "success"
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15"
    : tone === "warning"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-50 hover:bg-amber-400/15"
      : tone === "danger"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-50 hover:bg-rose-400/15"
        : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]";
}

export default function ReservationOperationsBoard({
  currentEvent,
  currentVenueName,
  reservationGuests,
  reservations,
  activeReservationId,
  onSelectReservation,
  onEditReservation,
  onDeleteReservation,
  onCancelReservation,
  onMarkConfirmed,
  onAddGuest,
  onGuestAction,
  onRegisterCheckIn,
  onEditGuest,
  canEditGuest,
  canEditReservation,
  canDeleteReservation,
  canIssueWhatsAppInvitations,
  setGuestsState,
  isTerminalEvent = false,
}: ReservationOperationsBoardProps) {
  const { showToast, confirm } = useFeedback();
  const [query, setQuery] = useState("");
  const [reservationFilter, setReservationFilter] = useState<"all" | "tables" | "presale">("all");
  const [isAddGuestFormOpen, setIsAddGuestFormOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestDocument, setGuestDocument] = useState("");
  const [guestWhatsapp, setGuestWhatsapp] = useState("");
  const [isSendingReservationInvitations, setIsSendingReservationInvitations] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastBatchResult, setLastBatchResult] = useState<ReservationWhatsAppBatchSummary | null>(null);
  const [bulkExportCandidate, setBulkExportCandidate] = useState<ReservationWhatsAppInvitationCandidate | null>(null);
  const bulkExportInvitationRef = useRef<HTMLDivElement | null>(null);
  const bulkExportReadyResolverRef = useRef<(() => void) | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleReservations = useMemo(() => {
    const filteredReservations = reservationFilter === "presale"
      ? reservations.filter((reservation) => reservation.reservationType === "Preventa")
      : reservationFilter === "tables"
        ? reservations.filter((reservation) => reservation.reservationType !== "Preventa")
        : reservations;

    if (!normalizedQuery) return filteredReservations;

    return filteredReservations.filter((reservation) =>
      [reservation.name, reservation.code, reservation.eventName, reservation.tableName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, reservationFilter, reservations]);

  const activeReservation =
    visibleReservations.find((reservation) => reservation.id === activeReservationId) ??
    visibleReservations[0] ??
    null;
  const canHardDeleteActiveReservation = activeReservation ? canHardDeleteReservation(activeReservation) : false;
  const whatsappPlan = useMemo(
    () =>
      activeReservation
        ? buildReservationWhatsAppInvitationPlan({
            reservation: activeReservation,
            guests: reservationGuests,
            currentEvent,
            currentVenueName,
          })
        : null,
    [activeReservation, currentEvent, currentVenueName, reservationGuests],
  );
  const whatsappCandidateCount = whatsappPlan?.eligibleCount ?? 0;
  const whatsappRetryableCount = whatsappPlan?.retryableCount ?? 0;
  const whatsappAlreadySentCount = whatsappPlan?.alreadySentCount ?? 0;
  const whatsappMissingCount = (whatsappPlan?.missingWhatsAppCount ?? 0) + (whatsappPlan?.missingCodeCount ?? 0);
  const hasReservationGuests = (activeReservation?.guests.length ?? 0) > 0;
  const whatsappInvitationStatusMessage = whatsappPlan
    ? whatsappCandidateCount > 0
      ? whatsappRetryableCount > 0
      ? `${whatsappCandidateCount} invitaciones listas · ${whatsappRetryableCount} fallidas para reintentar`
        : `${whatsappCandidateCount} invitaciones listas`
      : whatsappAlreadySentCount > 0
        ? `${whatsappAlreadySentCount} aceptadas por WhatsApp${whatsappMissingCount ? ` · ${whatsappMissingCount} sin datos válidos` : ""}`
        : `${whatsappMissingCount} sin datos válidos`
    : null;
  const isTerminalReservation = activeReservation
    ? isTerminalEvent || isTerminalReservationStatus(activeReservation.status)
    : false;

  useLayoutEffect(() => {
    if (!bulkExportCandidate) {
      return;
    }

    const node = bulkExportInvitationRef.current;

    if (!node) {
      return;
    }

    const exportGuestId = node.dataset.exportGuestId?.trim() ?? "";
    const exportAccessCode = node.dataset.exportAccessCode?.trim() ?? "";

    if (exportGuestId !== bulkExportCandidate.guest.id || exportAccessCode !== bulkExportCandidate.accessCode) {
      return;
    }

    bulkExportReadyResolverRef.current?.();
    bulkExportReadyResolverRef.current = null;
  }, [bulkExportCandidate]);

  const waitForBulkExportCandidate = useCallback((candidate: ReservationWhatsAppInvitationCandidate) => {
    return new Promise<void>((resolve) => {
      bulkExportReadyResolverRef.current = resolve;
      setBulkExportCandidate(candidate);
    });
  }, []);

  const resetGuestForm = () => {
    setGuestName("");
    setGuestDocument("");
    setGuestWhatsapp("");
  };

  const handleSelectReservation = (reservationId: string) => {
    onSelectReservation(reservationId);
    setIsAddGuestFormOpen(false);
    resetGuestForm();
  };

  const handleAddGuest = () => {
    if (!activeReservation || isTerminalReservation) {
      return;
    }

    if (!guestName.trim()) {
      showToast({
        title: "Ingresa un nombre",
        description: "Necesitamos al menos el nombre del invitado para crear la invitación.",
        tone: "warning",
      });
      return;
    }

    onAddGuest(activeReservation.id, {
      guestName,
      carnet: guestDocument,
      whatsapp: guestWhatsapp,
    });

    setIsAddGuestFormOpen(false);
    resetGuestForm();
  };

  const sendOneReservationInvitation = useCallback(
    async (guest: ReservationWhatsAppInvitationPlan["eligibleGuests"][number]) => {
      await waitForBulkExportCandidate(guest);

      if (!bulkExportInvitationRef.current) {
        throw new Error("No se pudo preparar la invitación para WhatsApp.");
      }

      const delivery = await sendReservationWhatsAppInvitation(guest, currentEvent.name, {
        invitationNode: bulkExportInvitationRef.current,
      });

      const acceptedResult = {
        status: delivery.status,
        providerAccepted: delivery.providerAccepted,
        trackingPersisted: delivery.trackingPersisted,
        warning: delivery.warning?.message ?? (delivery.trackingPersisted ? undefined : delivery.detail),
        detail: delivery.detail,
      } as const;

      const acceptedAt = new Date().toISOString();
      const attemptNumber = getWhatsAppDeliveryAttemptNumber(guest.guest);
      const deliveryStatus = getLegacyWhatsAppDeliveryStatus("accepted", attemptNumber);
      const nextGuest = {
        ...guest.guest,
        deliveryStatus,
        noInvitationSent: false,
        recentChange: true,
        deliveryHistory: [
          ...guest.guest.deliveryHistory,
          {
            time: getWhatsAppDeliveryTimestampLabel(acceptedAt),
            title: deliveryStatus,
            detail: getWhatsAppDeliveryAcceptedMessage(Boolean(delivery.trackingPersisted)),
          },
        ],
        whatsappDelivery: {
          messageId: delivery.messageId,
          attemptNumber,
          currentStatus: "accepted",
          updatedAt: acceptedAt,
          acceptedAt,
        },
      } as CheckInGuest;

      try {
        setGuestsState((current) => current.map((item) => (item.id === nextGuest.id ? nextGuest : item)));
      } catch (error) {
        console.error("WhatsApp guest state update failed after accepted send", {
          guestId: guest.guest.id,
          messageId: delivery.messageId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }

      return acceptedResult;
    },
    [currentEvent.name, setGuestsState, waitForBulkExportCandidate],
  );

  const runBulkSendReservations = useCallback(
    async (includeAlreadySentGuests = false) => {
      if (!activeReservation) {
        return;
      }

      const plan = includeAlreadySentGuests
        ? buildReservationWhatsAppInvitationPlan({
            reservation: activeReservation,
            guests: reservationGuests,
            currentEvent,
            currentVenueName,
            includeAlreadySentGuests: true,
          })
        : whatsappPlan;

      if (!plan) {
        return;
      }

      const { eligibleGuests, skippedGuests, eligibleCount } = plan;

      setIsSendingReservationInvitations(true);
      setBulkProgress({ current: 0, total: eligibleCount });
      const batchResults: ReservationWhatsAppBatchResult[] = [];

      try {
        for (const [index, candidate] of eligibleGuests.entries()) {
          setBulkProgress({ current: index + 1, total: eligibleGuests.length });

          try {
            const result = await sendOneReservationInvitation(candidate);
            batchResults.push({
              guestId: candidate.guest.id,
              guestName: candidate.guest.guestName,
              status: "accepted",
              providerAccepted: true,
              trackingPersisted: result.trackingPersisted,
              warning: result.warning,
              detail: result.detail,
              isRetry: candidate.isRetry,
            });
          } catch (error) {
            const detail = error instanceof Error ? error.message : "No se pudo completar el envío.";
            batchResults.push({
              guestId: candidate.guest.id,
              guestName: candidate.guest.guestName,
              status: "failed",
              providerAccepted: false,
              trackingPersisted: false,
              detail,
              isRetry: candidate.isRetry,
            });
          }
        }

        const batchSummary = summarizeReservationWhatsAppBatchResults(batchResults, skippedGuests.length);
        setLastBatchResult(batchSummary);

        showToast({
          title: batchSummary.failedCount ? "Aceptación parcial completada" : "Aceptadas por WhatsApp",
          description: batchSummary.failedCount
            ? `${batchSummary.acceptedCount} aceptadas por WhatsApp · ${batchSummary.failedCount} fallidas · ${skippedGuests.length} omitidas. Podés repetir el botón para reintentar las fallidas.`
            : `${batchSummary.acceptedCount} aceptadas por WhatsApp · ${batchSummary.failedCount} fallidas · ${skippedGuests.length} omitidas${batchSummary.warningCount ? ` · ${batchSummary.warningCount} con advertencia de seguimiento` : ""}.`,
          tone: batchSummary.failedCount ? "warning" : "success",
        });
      } finally {
        setBulkProgress(null);
        setIsSendingReservationInvitations(false);
      }
    },
    [activeReservation, currentEvent, currentVenueName, reservationGuests, sendOneReservationInvitation, showToast, whatsappPlan],
  );

  const handleBulkSendReservations = useCallback(() => {
    if (!activeReservation || isTerminalReservation || !canIssueWhatsAppInvitations || !hasReservationGuests) {
      return;
    }

    if (whatsappCandidateCount > 0) {
      const confirmMessage =
        whatsappRetryableCount > 0
          ? `Se enviarán ${whatsappCandidateCount} invitaciones y se reintentarán ${whatsappRetryableCount} fallidas. Se omitirán ${whatsappAlreadySentCount} ya aceptadas por WhatsApp y ${whatsappMissingCount} sin datos válidos.`
          : `Se enviarán ${whatsappCandidateCount} invitaciones listas. Se omitirán ${whatsappAlreadySentCount} ya aceptadas por WhatsApp y ${whatsappMissingCount} sin datos válidos.`;

      confirm({
        title: "Enviar invitaciones",
        description: confirmMessage,
        confirmLabel: `Enviar ${whatsappCandidateCount} invitaciones`,
        cancelLabel: "Cancelar",
        tone: "success",
        onConfirm: () => {
          void runBulkSendReservations(false);
        },
      });
      return;
    }

    if (whatsappAlreadySentCount > 0) {
      confirm({
        title: "Invitaciones ya aceptadas por WhatsApp",
        description: `${whatsappAlreadySentCount} de ${activeReservation.guests.length} invitados ya tienen una aceptación registrada por WhatsApp.`,
        confirmLabel: "Reenviar invitaciones",
        cancelLabel: "Cancelar",
        tone: "warning",
        onConfirm: () => {
          void runBulkSendReservations(true);
        },
      });
      return;
    }

    showToast({
      title: "No hay invitados listos para envío",
      description: `${whatsappMissingCount} invitados no tienen WhatsApp o código válidos.`,
      tone: "warning",
    });
  }, [
    activeReservation,
    canIssueWhatsAppInvitations,
    confirm,
    hasReservationGuests,
    isTerminalReservation,
    runBulkSendReservations,
    showToast,
    whatsappAlreadySentCount,
    whatsappCandidateCount,
    whatsappMissingCount,
    whatsappRetryableCount,
  ]);

  if (!reservations.length) {
    return (
      <section className="surface-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker">Reservas operativas</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              No hay reservas para operar.
            </h2>
          </div>
          <StatusBadge variant="info">0</StatusBadge>
        </div>
      </section>
    );
  }

  if (!activeReservation) {
    return (
      <section className="grid min-w-0 gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="surface-panel min-w-0 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="kicker">Reservas activas</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Selecciona una reserva para operar.
              </h2>
            </div>
            <StatusBadge variant="info">{visibleReservations.length}</StatusBadge>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            No hay coincidencias con la búsqueda actual.
          </div>
        </div>

        <section className="surface-panel min-w-0 p-5">
          <p className="kicker">Detalle de reserva</p>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            Selecciona una reserva visible para ver su detalle operativo.
          </div>
        </section>
      </section>
    );
  }

  const canConfirmReservation = activeReservation.status === "Draft" || activeReservation.status === "Pending";
  const canMutateReservation = !isTerminalReservation && (canEditReservation || canDeleteReservation);

  return (
    <section className="grid min-w-0 gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <div className="surface-panel min-w-0 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker">Reservas activas</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Selecciona una reserva para operar.
            </h2>
          </div>
          <StatusBadge variant="info">{visibleReservations.length}</StatusBadge>
        </div>

        <div className="mt-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, código, mesa o evento"
            className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filtrar reservas">
          {(["all", "tables", "presale"] as const).map((filter) => {
            const selected = reservationFilter === filter;
            const label = filter === "all" ? "Todas" : filter === "tables" ? "Mesas" : "Preventa";
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setReservationFilter(filter)}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  selected
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-50"
                    : "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
          Mostrando {visibleReservations.length} de {reservations.length}
        </p>

        <div className="mt-4 space-y-3">
          {visibleReservations.map((reservation) => {
            const isActive = reservation.id === activeReservation.id;

            return (
              <button
                key={reservation.id}
                type="button"
                onClick={() => handleSelectReservation(reservation.id)}
                className={[
                  "w-full rounded-[1.35rem] border p-4 text-left transition",
                  isActive
                    ? "border-cyan-400/30 bg-cyan-400/10"
                    : "border-white/10 bg-slate-950/40 hover:bg-slate-950/55",
                ].join(" ")}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-white">{reservation.name}</p>
                    <p
                      className="mt-1 break-words text-xs uppercase tracking-[0.22em] text-slate-500"
                      title={`${reservation.code} · ${reservation.eventName}`}
                    >
                      {reservation.code} · {reservation.eventName}
                    </p>
                  </div>
                  <StatusBadge variant={getReservationStatusTone(reservation.status)}>
                    {formatReservationStatus(reservation.status)}
                  </StatusBadge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300">
                  <span className="max-w-full break-words rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 normal-case tracking-normal">
                    {reservation.reservationType === "Preventa" ? `${reservation.metrics.guestCount} preventas` : `Mesa ${reservation.tableName}`}
                  </span>
                  {reservation.reservationType === "Preventa" && reservation.commercialSnapshot ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                      {formatCommercialCurrency(reservation.commercialSnapshot.currency)} {formatCommercialAmount(getPresaleUnitPrice(reservation.commercialSnapshot))} c/u
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Invitados {reservation.metrics.guestCount}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Ingresados {reservation.metrics.checkedInGuests}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Pendientes {reservation.metrics.pendingGuests}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <section className="surface-panel min-w-0 space-y-5 p-5">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <p className="kicker">Detalle de reserva</p>

            <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
              <StatusBadge variant={getReservationStatusTone(activeReservation.status)}>
                {formatReservationStatus(activeReservation.status)}
              </StatusBadge>
              {canConfirmReservation ? (
                <button
                type="button"
                  onClick={() => onMarkConfirmed(activeReservation.id)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
                >
                  Marcar confirmado
                </button>
              ) : isTerminalReservation ? (
                <span className="inline-flex h-11 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-slate-400">
                  Reserva terminal
                </span>
              ) : null}
              {canMutateReservation ? (
                <>
                  {canIssueWhatsAppInvitations && hasReservationGuests ? (
                    <button
                      type="button"
                      onClick={() => void handleBulkSendReservations()}
                      disabled={isSendingReservationInvitations}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-400/15 px-4 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSendingReservationInvitations && bulkProgress
                        ? `Enviando ${bulkProgress.current}/${bulkProgress.total}`
                        : "Enviar invitaciones"}
                    </button>
                  ) : null}
                  {canEditReservation ? (
                    <button
                      type="button"
                      onClick={() => onEditReservation(activeReservation.id)}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                    >
                      Editar reserva
                    </button>
                  ) : null}
                  {canDeleteReservation ? (
                    canHardDeleteActiveReservation ? (
                      <button
                        type="button"
                        onClick={() =>
                          confirm({
                            title: "Eliminar reserva",
                            description: `Vas a eliminar ${activeReservation.name}. Se liberará ${activeReservation.tableName} y los invitados asociados dejarán de mostrarse.`,
                            confirmLabel: "Eliminar reserva",
                            cancelLabel: "Cancelar",
                            tone: "danger",
                            onConfirm: () => {
                              void onDeleteReservation(activeReservation.id);
                            },
                          })
                        }
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 text-sm font-medium text-rose-50 transition hover:bg-rose-400/15"
                      >
                        Eliminar reserva
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          confirm({
                            title: "Cancelar reserva",
                            description: `Esta reserva ya tiene invitados o actividad registrada. La cancelaremos para conservar el historial operativo.`,
                            confirmLabel: "Cancelar reserva",
                            cancelLabel: "Cancelar",
                            tone: "warning",
                            onConfirm: () => {
                              onCancelReservation(activeReservation.id);
                            },
                          })
                        }
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 text-sm font-medium text-amber-50 transition hover:bg-amber-400/15"
                      >
                        Cancelar reserva
                      </button>
                    )
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {activeReservation.reservationType === "Preventa"
                ? activeReservation.name
                : `${activeReservation.tableName} · ${activeReservation.eventName}`}
            </h2>
            <p className="mt-2 break-words text-sm text-slate-400">
              {activeReservation.code} · {activeReservation.name}
            </p>
          </div>
        </div>

        {whatsappInvitationStatusMessage ? (
          <p className="break-words text-xs text-slate-400">{whatsappInvitationStatusMessage}</p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReservationInfoRow label="Fecha" value={activeReservation.date} />
          <ReservationInfoRow label="Hora" value={activeReservation.time} />
          <ReservationInfoRow
            label={activeReservation.reservationType === "Preventa" ? "Tipo" : "Mesa / espacio"}
            value={activeReservation.reservationType === "Preventa" ? "Preventa" : activeReservation.tableName}
          />
          <ReservationInfoRow label="Pago" value={activeReservation.paymentStatus} />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReservationInfoRow label="Invitados" value={`${activeReservation.metrics.guestCount}`} />
          <ReservationInfoRow label="Ingresados" value={`${activeReservation.metrics.checkedInGuests}`} />
          <ReservationInfoRow label="Pendientes" value={`${activeReservation.metrics.pendingGuests}`} />
          <ReservationInfoRow label="Capacidad restante" value={`${activeReservation.metrics.capacityRemaining}`} />
        </div>

        <section className="surface-elevated min-w-0 p-4">
          <p className="kicker">Condiciones comerciales</p>
          {activeReservation.commercialSnapshot ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ReservationInfoRow
                label={activeReservation.commercialSnapshot.saleType === "presale" ? "Precio por acceso" : "Precio vendido"}
                value={`${formatCommercialCurrency(activeReservation.commercialSnapshot.currency)} ${formatCommercialAmount(getPresaleUnitPrice(activeReservation.commercialSnapshot))}`}
              />
              <ReservationInfoRow label="Moneda" value={activeReservation.commercialSnapshot.currency} />
              <ReservationInfoRow
                label={activeReservation.commercialSnapshot.saleType === "presale" ? "Preventas compradas" : "Accesos incluidos"}
                value={`${getPresaleQuantity(activeReservation.commercialSnapshot)}`}
              />
              {activeReservation.commercialSnapshot.saleType === "presale" ? (
                <ReservationInfoRow
                  label="Total vendido"
                  value={`${formatCommercialCurrency(activeReservation.commercialSnapshot.currency)} ${formatCommercialAmount(getPresaleTotal(activeReservation.commercialSnapshot))}`}
                />
              ) : null}
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:col-span-3">
                <p className="break-words text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Beneficios incluidos
                </p>
                {activeReservation.commercialSnapshot.benefits.length ? (
                  <ul className="mt-2 space-y-1 text-sm font-medium text-white">
                    {activeReservation.commercialSnapshot.benefits.map((benefit) => (
                      <li key={benefit.id}>
                        {benefit.label} ×{benefit.quantity}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">Ninguno</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Sin condiciones comerciales registradas.</p>
          )}
        </section>

        <section className="surface-elevated min-w-0 p-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="kicker">Invitados ({activeReservation.guests.length})</p>
              <p className="mt-2 break-words text-sm text-slate-400">
                Estado individual y acciones
                {canIssueWhatsAppInvitations && whatsappCandidateCount > 0 ? ` · ${whatsappCandidateCount} invitaciones listas` : ""}
              </p>
            </div>

            {activeReservation.reservationType !== "Preventa" ? <button
              type="button"
              onClick={() => setIsAddGuestFormOpen((current) => !current)}
              disabled={isTerminalReservation}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
                + Agregar invitado
            </button> : null}
          </div>

          <div className="mt-4 space-y-3">
            {activeReservation.guests.length ? (
              activeReservation.guests.map((guest) => (
                <ReservationGuestRow
                  key={guest.id}
                  reservationStatus={activeReservation.status}
                  guest={guest}
                  eventTerminal={isTerminalEvent}
                  canEditGuest={canEditGuest}
                  allowRemove={activeReservation.reservationType !== "Preventa"}
                  onEdit={() => onEditGuest(guest.id)}
                  onConfirm={() => {
                    onGuestAction({ reservationId: activeReservation.id, guestId: guest.id, action: "confirm" });
                  }}
                  onCancel={() => {
                    onGuestAction({ reservationId: activeReservation.id, guestId: guest.id, action: "cancel" });
                  }}
                  onCheckIn={() => {
                    onRegisterCheckIn(activeReservation.id, guest.id);
                  }}
                  onRevert={() => {
                    onGuestAction({ reservationId: activeReservation.id, guestId: guest.id, action: "revert" });
                  }}
                  onRemove={() => {
                    onGuestAction({ reservationId: activeReservation.id, guestId: guest.id, action: "remove" });
                  }}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                Todavía no hay invitados cargados en esta reserva.
              </div>
            )}
          </div>

          {isAddGuestFormOpen ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.95fr)_auto]">
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Nombre del invitado"
                  className="h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
                />
                <input
                  value={guestDocument}
                  onChange={(event) => setGuestDocument(event.target.value)}
                  placeholder="Carnet"
                  className="h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
                />
                <input
                  value={guestWhatsapp}
                  onChange={(event) => setGuestWhatsapp(event.target.value)}
                  placeholder="WhatsApp"
                  className="h-11 w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-white/[0.06]"
                />
                <div className="flex min-w-0 flex-wrap gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddGuestFormOpen(false);
                      resetGuestForm();
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAddGuest}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
                  >
                    Agregar invitado
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {lastBatchResult ? (
          <section className="surface-elevated min-w-0 p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="kicker">Último envío</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {lastBatchResult.acceptedCount} aceptadas por WhatsApp ·{" "}
                  {lastBatchResult.failedCount} fallidas ·{" "}
                  {lastBatchResult.skippedCount} omitidas
                </p>
                {lastBatchResult.warningCount ? (
                  <p className="mt-2 text-xs text-amber-200">
                    {lastBatchResult.warningCount} envío{lastBatchResult.warningCount === 1 ? "" : "s"} aceptado{lastBatchResult.warningCount === 1 ? "" : "s"} con advertencia de seguimiento.
                  </p>
                ) : null}
              </div>
              <StatusBadge variant={lastBatchResult.failedCount ? "warning" : "success"}>
                {lastBatchResult.acceptedCount + lastBatchResult.failedCount}
              </StatusBadge>
            </div>

            {lastBatchResult.failedCount ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Fallidas</p>
                <div className="flex flex-wrap gap-2">
                  {lastBatchResult.results
                    .filter((item) => item.status === "failed")
                    .map((item) => (
                      <span
                        key={item.guestId}
                        className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-50"
                        title={item.detail}
                      >
                        {item.guestName}
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <details className="surface-elevated min-w-0 p-4">
          <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="kicker">Timeline</p>
              <h3 className="mt-2 break-words text-lg font-semibold tracking-tight text-white">
                Línea de tiempo operativa
              </h3>
            </div>
            <StatusBadge variant="info">{activeReservation.timeline.length}</StatusBadge>
          </summary>

          <div className="mt-4 space-y-3">
            {activeReservation.timeline.map((item) => (
              <ReservationTimelineRow key={item.id} item={item} />
            ))}
          </div>
        </details>

        <section className="surface-elevated min-w-0 p-4">
          <p className="kicker">Observaciones</p>
          <p className="mt-3 break-words text-sm leading-6 text-slate-300">
            {activeReservation.notes || "Sin observaciones operativas."}
          </p>
        </section>

      </section>

      <div className="pointer-events-none fixed left-[-200vw] top-0 w-[1080px] overflow-hidden" aria-hidden="true">
        <div
          ref={bulkExportInvitationRef}
          className="w-[1080px]"
          data-export-guest-id={bulkExportCandidate?.guest.id ?? ""}
          data-export-access-code={bulkExportCandidate?.accessCode ?? ""}
        >
          {bulkExportCandidate ? <InvitationCard invitation={bulkExportCandidate.invitation} mode="download" /> : null}
        </div>
      </div>

    </section>
  );
}

function ReservationGuestRow({
  guest,
  reservationStatus,
  eventTerminal,
  canEditGuest,
  allowRemove,
  onEdit,
  onConfirm,
  onCancel,
  onCheckIn,
  onRevert,
  onRemove,
}: {
  guest: ReservationSummary["guests"][number];
  reservationStatus: ReservationSummary["status"];
  eventTerminal: boolean;
  canEditGuest: boolean;
  allowRemove: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onCheckIn: () => void;
  onRevert: () => void;
  onRemove: () => void;
}) {
  const actionVisibility = getReservationGuestActionVisibility(reservationStatus, guest, eventTerminal);
  const canHardDelete = canHardDeleteGuest(guest);
  const overflowActions: GuestOverflowActionItem[] = [
    canEditGuest
      ? {
          id: "edit",
          label: "Editar",
          onSelect: onEdit,
        }
      : null,
    actionVisibility.showConfirm
      ? {
          id: "confirm",
          label: "Confirmar",
          tone: "info",
          onSelect: onConfirm,
        }
      : null,
    actionVisibility.showRevert
      ? {
          id: "revert",
          label: "Revertir ingreso",
          tone: "warning",
          onSelect: onRevert,
        }
      : null,
    actionVisibility.showCancel
      ? {
          id: "cancel",
          label: "Cancelar invitado",
          tone: "danger",
          onSelect: onCancel,
        }
      : null,
    allowRemove && actionVisibility.showRemove && canHardDelete
      ? {
          id: "remove",
          label: "Eliminar",
          tone: "danger",
          onSelect: onRemove,
        }
      : null,
  ].filter((item): item is GuestOverflowActionItem => item !== null);

  return (
    <div className="surface-elevated min-w-0 p-4">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-white">{guest.guestName}</p>
          <p
            className="mt-1 break-words text-xs text-slate-400"
            title={`${guest.invitationCode} · ${guest.invitationSequence}`}
          >
            {guest.invitationCode} · {guest.invitationSequence}
          </p>
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">
            <StatusBadge
              variant={
                guest.admissionStatus === "Ingresó"
                  ? "success"
                  : guest.admissionStatus === "Anulada"
                    ? "danger"
                    : guest.admissionStatus === "Bloqueada"
                      ? "warning"
                      : "warning"
              }
            >
              {guest.admissionStatus}
            </StatusBadge>
            <StatusBadge
              variant={
                guest.reservationStatus === "Cancelled"
                  ? "danger"
                  : guest.reservationStatus === "Pending"
                    ? "warning"
                    : guest.reservationStatus === "Checked In"
                      ? "success"
                      : "info"
              }
            >
              {formatReservationStatus(guest.reservationStatus)}
            </StatusBadge>
            <StatusBadge variant="info">{guest.deliveryStatus}</StatusBadge>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          {actionVisibility.showCheckIn ? (
            <button
              type="button"
              onClick={onCheckIn}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/15"
            >
              Registrar ingreso
            </button>
          ) : null}
          <ReservationGuestOverflowMenu actions={overflowActions} />
        </div>
      </div>
    </div>
  );
}

function ReservationGuestOverflowMenu({ actions }: { actions: GuestOverflowActionItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (rootRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [open]);

  if (!actions.length) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/80 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        aria-label="Más acciones del invitado"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="text-xl leading-none">...</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Más acciones del invitado"
          className="absolute right-0 top-12 z-20 w-[min(18rem,calc(100vw-2rem))] overflow-hidden surface-panel bg-[#0b0f14]"
        >
          <div className="border-b border-white/10 px-4 py-2.5">
            <p className="kicker">Más acciones</p>
          </div>

          <div className="p-2">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  action.onSelect();
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                  guestOverflowToneClasses(action.tone ?? "info"),
                ].join(" ")}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{action.label}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReservationTimelineRow({
  item,
}: {
  item: ReservationSummary["timeline"][number];
}) {
  return (
    <div className="surface-elevated min-w-0 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-white">{item.title}</p>
          <p className="mt-1 break-words text-sm leading-6 text-slate-400">{item.detail}</p>
        </div>
        <p className="shrink-0 text-xs uppercase tracking-[0.22em] text-slate-500">{item.time}</p>
      </div>
    </div>
  );
}

function ReservationInfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="break-words text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="break-words text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function formatCommercialAmount(value: number) {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCommercialCurrency(currency: string) {
  return currency === "BOB" ? "Bs" : currency;
}

function getPresaleUnitPrice(snapshot: NonNullable<ReservationSummary["commercialSnapshot"]>) {
  return snapshot.unitPrice ?? snapshot.reservationPrice;
}

function getPresaleQuantity(snapshot: NonNullable<ReservationSummary["commercialSnapshot"]>) {
  return snapshot.quantity ?? snapshot.includedAccesses;
}

function getPresaleTotal(snapshot: NonNullable<ReservationSummary["commercialSnapshot"]>) {
  return snapshot.totalPrice ?? getPresaleUnitPrice(snapshot) * getPresaleQuantity(snapshot);
}
