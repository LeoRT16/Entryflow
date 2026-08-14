"use client";

import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import MetricCard from "@/components/metric-card";
import Topbar from "@/components/topbar";
import LiveSummaryRow from "@/features/reservations/components/live-summary-row";
import ReservationWizardModal, {
  wizardSteps,
} from "@/features/reservations/components/reservation-wizard-modal";
import ReservationOperationsBoard from "@/features/reservations/components/reservation-operations-board";
import { buildGuestDraftsFromGuests, createGuestDraft } from "@/features/reservations/domain/reservation-draft";
import {
  deriveFrequentCustomerFromHistory,
  normalizeReservationStatus,
} from "@/features/reservations/domain/reservation-domain";
import {
  countDraftPendingGuests,
  countDraftRegisteredGuests,
  createReservationWizardDefaults,
  createReservationSubmissionGate,
  resolveInitialReservationResourceId,
  resolveReservationCapacityViolation,
  runReservationSubmission,
} from "@/features/reservations/domain/reservation-wizard";
import { reservationGuestPresets } from "@/features/reservations/domain/reservation-presets";
import { clampGuestCount } from "@/features/reservations/utils/reservation-utils";
import type {
  GuestDraft,
  PaymentMethod,
  PaymentStatus,
  ReservationCreationInput,
  ReservationSummary,
  ReservationType,
  TableOption,
  WizardStep,
} from "@/features/reservations/types";
import { useCheckInStore } from "@/services/workspace-service";
import { resolveCurrentEventLayout, resolveCurrentEventLayoutResource } from "@/services/workspace-layout-resolution";
import StatusBadge from "@/components/status-badge";
import TerminalEventBanner from "@/components/terminal-event-banner";
import { GuidedActionPanel, buildGuidedActionItem } from "@/components/quick-actions-menu";
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { isTerminalEventStatus } from "@/features/events/domain";

type CheckInStore = ReturnType<typeof useCheckInStore>;

type ReservationFlowWorkspaceProps = Pick<
  CheckInStore,
  | "currentOrganization"
  | "currentEvent"
  | "venues"
  | "sectors"
  | "resources"
  | "currentVenue"
  | "currentVenueSectors"
  | "currentVenueResources"
  | "venueLayoutResources"
  | "eventLayoutResources"
  | "eventLayouts"
  | "events"
  | "guests"
  | "reservations"
  | "tableSummaries"
  | "workspaceIntelligence"
  | "workspacePriority"
  | "reservationSummaries"
  | "createReservation"
  | "updateReservation"
  | "appendReservationGuests"
  | "addReservationGuest"
  | "updateReservationGuest"
  | "setReservationStatus"
  | "registerCheckIn"
>;

function reservationPriorityWeight(statusTone: ReservationSummary["statusTone"]) {
  if (statusTone === "danger") return 0;
  if (statusTone === "warning") return 1;
  if (statusTone === "info") return 2;
  return 3;
}

function compareReservationPriority(a: ReservationSummary, b: ReservationSummary) {
  const toneDelta = reservationPriorityWeight(a.statusTone) - reservationPriorityWeight(b.statusTone);

  if (toneDelta !== 0) {
    return toneDelta;
  }

  const pendingDelta = b.metrics.pendingGuests - a.metrics.pendingGuests;

  if (pendingDelta !== 0) {
    return pendingDelta;
  }

  const checkedInDelta = b.metrics.checkedInGuests - a.metrics.checkedInGuests;

  if (checkedInDelta !== 0) {
    return checkedInDelta;
  }

  return a.name.localeCompare(b.name);
}

export default function ReservationFlow() {
  const store = useCheckInStore();

  return (
    <ReservationFlowWorkspace
      key={store.currentEvent.id}
      currentOrganization={store.currentOrganization}
      currentEvent={store.currentEvent}
      venues={store.venues}
      sectors={store.sectors}
      resources={store.resources}
      currentVenue={store.currentVenue}
      currentVenueSectors={store.currentVenueSectors}
      currentVenueResources={store.currentVenueResources}
      venueLayoutResources={store.venueLayoutResources}
      eventLayoutResources={store.eventLayoutResources}
      eventLayouts={store.eventLayouts}
      events={store.events}
      guests={store.guests}
      reservations={store.reservations}
      tableSummaries={store.tableSummaries}
      workspaceIntelligence={store.workspaceIntelligence}
      workspacePriority={store.workspacePriority}
      reservationSummaries={store.reservationSummaries}
      createReservation={store.createReservation}
      updateReservation={store.updateReservation}
      appendReservationGuests={store.appendReservationGuests}
      addReservationGuest={store.addReservationGuest}
      updateReservationGuest={store.updateReservationGuest}
      setReservationStatus={store.setReservationStatus}
      registerCheckIn={store.registerCheckIn}
    />
  );
}

function ReservationFlowWorkspace({
  currentOrganization,
  currentEvent,
  venues,
  sectors,
  resources,
  currentVenue,
  currentVenueSectors,
  currentVenueResources,
  venueLayoutResources,
  eventLayoutResources,
  eventLayouts,
  events,
  guests: reservationGuests,
  reservations,
  tableSummaries,
  workspaceIntelligence,
  workspacePriority,
  reservationSummaries,
  createReservation,
  updateReservation,
  appendReservationGuests,
  addReservationGuest,
  updateReservationGuest,
  setReservationStatus,
  registerCheckIn,
}: ReservationFlowWorkspaceProps) {
  const wizardDefaults = useMemo(
    () => createReservationWizardDefaults(currentEvent),
    [currentEvent],
  );
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [eventName, setEventName] = useState(wizardDefaults.eventName);
  const [date, setDate] = useState(wizardDefaults.date);
  const [time, setTime] = useState(wizardDefaults.time);
  const [guestCount, setGuestCount] = useState(wizardDefaults.guestCount);
  const [reservationType, setReservationType] = useState<ReservationType>(wizardDefaults.reservationType);
  const [observations, setObservations] = useState(wizardDefaults.observations);
  const [holderName, setHolderName] = useState(wizardDefaults.holderName);
  const [holderLastName, setHolderLastName] = useState(wizardDefaults.holderLastName);
  const [documentValue, setDocumentValue] = useState(wizardDefaults.documentValue);
  const [whatsapp, setWhatsapp] = useState(wizardDefaults.whatsapp);
  const [email, setEmail] = useState(wizardDefaults.email);
  const [preferences, setPreferences] = useState(wizardDefaults.preferences);
  const [vip, setVip] = useState(wizardDefaults.vip);
  const [notes, setNotes] = useState(wizardDefaults.notes);
  const [guestDrafts, setGuestDrafts] = useState<GuestDraft[]>(() => wizardDefaults.guestDrafts);
  const [selectedResourceId, setSelectedResourceId] = useState(wizardDefaults.selectedResourceId);
  const [amount, setAmount] = useState(wizardDefaults.amount);
  const [advance, setAdvance] = useState(wizardDefaults.advance);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(wizardDefaults.paymentMethod);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(wizardDefaults.paymentStatus);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prioritizedReservations = useMemo(
    () => [...reservationSummaries].sort(compareReservationPriority),
    [reservationSummaries],
  );
  const [activeReservationId, setActiveReservationId] = useState<string>(
    () => prioritizedReservations[0]?.id ?? "",
  );
  const [wizardMode, setWizardMode] = useState<"create" | "edit" | "append">("create");
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);
  const editHydratedRef = useRef<string | null>(null);
  const suppressEditHydrationRef = useRef(false);
  const reservationSubmissionGateRef = useRef(createReservationSubmissionGate());
  const [isSubmittingReservation, setIsSubmittingReservation] = useState(false);
  const [submissionActionLabel, setSubmissionActionLabel] = useState("Creando reserva…");

  const eventOptions = useMemo(
    () =>
      events
        .filter((event) => event.organizationId === currentOrganization.id)
        .map((event) => event.name),
    [currentOrganization.id, events],
  );

  const frequentCustomer = useMemo(
    () =>
      deriveFrequentCustomerFromHistory(reservations, {
        holderName: `${holderName} ${holderLastName}`.trim(),
        holderDocument: documentValue,
        holderWhatsapp: whatsapp,
        eventId: currentEvent.id,
      }),
    [currentEvent.id, documentValue, holderLastName, holderName, reservations, whatsapp],
  );

  const selectedResourceContext = useMemo(() => {
    const venue = currentVenue ?? venues.find((item) => item.id === currentEvent.venueId) ?? null;
    const venueSectors = currentVenueSectors.length
      ? currentVenueSectors
      : sectors.filter((sector) => !venue || sector.venueId === venue.id);
    const venueResources = currentVenueResources.length
      ? currentVenueResources
      : resources.filter((resource) => !venue || resource.venueId === venue.id);

    const resource = selectedResourceId ? venueResources.find((item) => item.id === selectedResourceId) ?? null : null;
    const currentEventLayout = resolveCurrentEventLayout({
      currentEventId: currentEvent.id,
      currentVenueId: currentVenue?.id ?? currentEvent.venueId,
      eventLayouts,
    });
    const currentEventLayoutResource = resource
      ? resolveCurrentEventLayoutResource({
          currentEventLayout,
          resourceId: resource.id,
          venueLayoutResources,
          eventLayoutResources,
        })
      : null;
    const summary = resource ? tableSummaries.find((item) => item.id === resource.id) ?? null : null;

    return {
      resource: resource
        ? {
            id: resource.id,
            name: resource.name,
            capacity: resource.capacity,
            location: venueSectors.find((sector) => sector.id === resource.sectorId)?.name ?? venue?.name ?? "Sin sector",
            status: (summary?.status ?? resource.status) as TableOption["status"],
            venueId: resource.venueId,
            sectorId: resource.sectorId,
            tone: summary?.statusTone ?? (resource.status === "Closed" || resource.status === "Over Capacity" ? "danger" : resource.status === "Reserved" ? "info" : resource.status === "Full" ? "warning" : "success"),
            assignedGuests: summary?.metrics.assignedGuests,
            activeReservations: summary?.reservationIds.length,
            overCapacity: summary?.metrics.overCapacity,
            eventLayoutResourceId: currentEventLayoutResource?.id,
            eventLayoutId: currentEventLayoutResource?.eventLayoutId,
          }
        : null,
      summary,
    };
  }, [currentEvent.id, currentEvent.venueId, currentVenue, currentVenueResources, currentVenueSectors, eventLayoutResources, eventLayouts, resources, sectors, selectedResourceId, tableSummaries, venueLayoutResources, venues]);

  const selectedResource = selectedResourceContext.resource;
  const selectedResourceSummary = selectedResourceContext.summary;
  const selectedResourceEventLayoutResourceId = selectedResource?.eventLayoutResourceId ?? "";
  const selectedResourceReservations = useMemo(
    () =>
      selectedResource
        ? reservations
            .filter((reservation) => {
              if (reservation.eventId !== currentEvent.id) {
                return false;
              }

              if (selectedResourceEventLayoutResourceId && reservation.eventLayoutResourceId === selectedResourceEventLayoutResourceId) {
                return true;
              }

              return (reservation.tableId ?? reservation.resourceId) === selectedResource.id;
            })
            .filter((reservation) => {
              const status = normalizeReservationStatus(reservation.status);
              return status !== "Cancelled" && status !== "No Show";
            })
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        : [],
    [currentEvent.id, reservations, selectedResource, selectedResourceEventLayoutResourceId],
  );
  const selectedActiveReservation = selectedResourceReservations[0] ?? null;
  const selectedReservationConflictCount = selectedResourceReservations.length;
  const editReservationId = searchParams.get("editReservationId") ?? "";
  const editAction = searchParams.get("action");
  const editingReservation = editReservationId
    ? reservations.find((reservation) => reservation.id === editReservationId) ?? null
    : null;
  const wizardReservation = editingReservation ?? selectedActiveReservation;
  const editingReservationGuests = useMemo(
    () =>
      editingReservation
        ? reservationGuests.filter((guest) => guest.reservationId === editingReservation.id).sort((a, b) => a.id.localeCompare(b.id))
        : [],
    [editingReservation, reservationGuests],
  );
  const isTerminalEvent = isTerminalEventStatus(currentEvent.status);

  useEffect(() => {
    let cancelled = false;

    if (isTerminalEvent) {
      return;
    }

    if (!editingReservationId) {
      editHydratedRef.current = null;
      return;
    }

    if (!editingReservation || editHydratedRef.current === editingReservationId) {
      return;
    }

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setEventName(editingReservation.eventName);
      setDate(editingReservation.date);
      setTime(editingReservation.time);
      setGuestCount(Math.max(editingReservationGuests.length, 1));
      setReservationType(editingReservation.reservationType);
      setObservations(editingReservation.notes);
      setHolderName(editingReservation.holderName.split(" ")[0] ?? editingReservation.holderName);
      setHolderLastName(editingReservation.holderName.split(" ").slice(1).join(" "));
      setDocumentValue(editingReservation.holderDocument);
      setWhatsapp(editingReservation.holderWhatsapp);
      setEmail(editingReservation.holderEmail);
      setPreferences("");
      setVip(false);
      setNotes(editingReservation.notes);
      setGuestDrafts(buildGuestDraftsFromGuests(editingReservationGuests));
      setSelectedResourceId(
        resolveInitialReservationResourceId({
          currentVenueResources,
          resourceId: editingReservation.resourceId,
          tableId: editingReservation.tableId,
        }),
      );
      setAmount(editingReservation.amount);
      setAdvance(editingReservation.advance);
      setPaymentStatus(editingReservation.paymentStatus);
      setWizardMode(editAction === "append" ? "append" : "edit");
      setIsWizardOpen(true);
      setStep(editAction === "append" ? 3 : 1);
      editHydratedRef.current = editingReservationId;
    });

    return () => {
      cancelled = true;
    };
  }, [currentVenueResources, editAction, editingReservation, editingReservationGuests, editingReservationId, isTerminalEvent]);

  useEffect(() => {
    let cancelled = false;

    if (isTerminalEvent) {
      return;
    }

    if (!editReservationId) {
      suppressEditHydrationRef.current = false;
      return;
    }

    if (suppressEditHydrationRef.current) {
      return;
    }

    queueMicrotask(() => {
      if (!cancelled) {
        setEditingReservationId(editReservationId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [editReservationId, isTerminalEvent]);

  const resetWizardState = useCallback(() => {
    setEditingReservationId(null);
    editHydratedRef.current = null;
    setWizardMode("create");
    setEventName(wizardDefaults.eventName);
    setDate(wizardDefaults.date);
    setTime(wizardDefaults.time);
    setGuestCount(wizardDefaults.guestCount);
    setReservationType(wizardDefaults.reservationType);
    setObservations(wizardDefaults.observations);
    setHolderName(wizardDefaults.holderName);
    setHolderLastName(wizardDefaults.holderLastName);
    setDocumentValue(wizardDefaults.documentValue);
    setWhatsapp(wizardDefaults.whatsapp);
    setEmail(wizardDefaults.email);
    setPreferences(wizardDefaults.preferences);
    setVip(wizardDefaults.vip);
    setNotes(wizardDefaults.notes);
    setGuestDrafts([...wizardDefaults.guestDrafts]);
    setSelectedResourceId(wizardDefaults.selectedResourceId);
    setAmount(wizardDefaults.amount);
    setAdvance(wizardDefaults.advance);
    setPaymentMethod(wizardDefaults.paymentMethod);
    setPaymentStatus(wizardDefaults.paymentStatus);
    setSubmissionError(null);
    setIsSubmittingReservation(false);
    setSubmissionActionLabel("Creando reserva…");
  }, [wizardDefaults]);

  const clearWizardQuery = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("editReservationId");
    nextParams.delete("action");

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const resourceOptions = useMemo<TableOption[]>(
    () => {
      const venue = currentVenue ?? venues.find((item) => item.id === currentEvent.venueId) ?? null;
      const venueSectors = currentVenueSectors.length
        ? currentVenueSectors
        : sectors.filter((sector) => !venue || sector.venueId === venue.id);
      const venueResources = currentVenueResources.length
        ? currentVenueResources
        : resources.filter((resource) => !venue || resource.venueId === venue.id);
      const currentEventLayout = resolveCurrentEventLayout({
        currentEventId: currentEvent.id,
        currentVenueId: currentVenue?.id ?? currentEvent.venueId,
        eventLayouts,
      });

      return venueResources.map((resource) => {
        const summary = tableSummaries.find((item) => item.id === resource.id);
        const eventLayoutResource = resolveCurrentEventLayoutResource({
          currentEventLayout,
          resourceId: resource.id,
          venueLayoutResources,
          eventLayoutResources,
        });

        return {
          id: resource.id,
          name: resource.name,
          capacity: resource.capacity,
          location: venueSectors.find((sector) => sector.id === resource.sectorId)?.name ?? venue?.name ?? "Sin sector",
          status: (summary?.status ?? resource.status) as TableOption["status"],
          venueId: resource.venueId,
          sectorId: resource.sectorId,
          eventLayoutId: eventLayoutResource?.eventLayoutId,
          eventLayoutResourceId: eventLayoutResource?.id,
          tone: summary?.statusTone ?? (resource.status === "Closed" || resource.status === "Over Capacity" ? "danger" : resource.status === "Reserved" ? "info" : resource.status === "Full" ? "warning" : "success"),
          assignedGuests: summary?.metrics.assignedGuests,
          activeReservations: summary?.reservationIds.length,
          overCapacity: summary?.metrics.overCapacity,
        };
      });
    },
    [currentEvent.id, currentEvent.venueId, currentVenue, currentVenueResources, currentVenueSectors, eventLayoutResources, eventLayouts, resources, sectors, tableSummaries, venueLayoutResources, venues],
  );

  const registeredGuests = useMemo(() => countDraftRegisteredGuests(guestDrafts), [guestDrafts]);

  const pendingGuests = countDraftPendingGuests(guestCount, registeredGuests);

  const amountNumber = Number(amount || 0);
  const advanceNumber = Number(advance || 0);
  const pendingNumber = Math.max(amountNumber - advanceNumber, 0);
  const completion = step / wizardSteps.length;
  const reservationTotals = workspaceIntelligence.statistics.cards;
  const reservationInsights = workspacePriority.byModule.Reservations;
  const prioritySummary = workspacePriority.summary;
  const capacity = workspaceIntelligence.capacity;
  const openReservationWizard = useCallback(() => {
    if (isTerminalEvent) {
      return;
    }

    if (reservationSubmissionGateRef.current.isLocked()) {
      return;
    }

    suppressEditHydrationRef.current = true;
    clearWizardQuery();
    resetWizardState();
    setIsWizardOpen(true);
    setStep(1);
  }, [clearWizardQuery, resetWizardState, isTerminalEvent]);
  const closeWizard = useCallback(() => {
    if (reservationSubmissionGateRef.current.isLocked()) {
      return;
    }

    suppressEditHydrationRef.current = true;
    setIsWizardOpen(false);
    clearWizardQuery();
    resetWizardState();
  }, [clearWizardQuery, resetWizardState]);

  const finalizeWizardClose = useCallback(() => {
    suppressEditHydrationRef.current = true;
    setIsWizardOpen(false);
    clearWizardQuery();
    resetWizardState();
  }, [clearWizardQuery, resetWizardState]);

  const activeReservation =
    prioritizedReservations.find((reservation) => reservation.id === activeReservationId) ??
    prioritizedReservations[0] ??
    null;
  const guidedActions = useMemo(() => {
    if (isTerminalEvent) {
      return [];
    }

    const actions = [
      ...(activeReservation && (activeReservation.status === "Draft" || activeReservation.status === "Pending")
        ? [
            {
              id: `${activeReservation.id}-confirm`,
              label: "Confirmar reserva",
              reason: `${activeReservation.name} todavía no está confirmada.`,
              impact: "Desbloquea invitados, mesa y check-in para esta reserva.",
              priority: "critical" as const,
              tone: "danger" as const,
              onSelect: () => setReservationStatus(activeReservation.id, "Confirmed"),
            },
          ]
        : []),
      ...(activeReservation && (!activeReservation.tableName || activeReservation.tableName.toLowerCase().includes("sin mesa"))
        ? [
            {
              id: `${activeReservation.id}-table`,
              label: "Asignar mesa",
              reason: `${activeReservation.name} todavía no tiene mesa asignada.`,
              impact: "Reduce fricción y deja la reserva lista para operar.",
              priority: "blocking" as const,
              tone: "warning" as const,
              href: "/tables",
            },
          ]
        : []),
      ...(activeReservation && activeReservation.metrics.pendingGuests > 0
        ? [
            {
              id: `${activeReservation.id}-checkin`,
              label: "Continuar check-in",
              reason: `${activeReservation.metrics.pendingGuests} invitados siguen pendientes de ingreso.`,
              impact: "Lleva el grupo al flujo de admisión sin perder contexto.",
              priority: "quick" as const,
              tone: "info" as const,
              href: "/check-in",
            },
          ]
        : []),
      ...reservationInsights.slice(0, 2).map((item) =>
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
  }, [activeReservation, isTerminalEvent, reservationInsights, setReservationStatus]);

  const keyboardShortcuts = useMemo(
    () => [
      ...(isTerminalEvent
        ? []
        : [
            {
              id: "reservations-new",
              shortcut: "n",
              priority: 50,
              handler: openReservationWizard,
            },
          ]),
      {
        id: "reservations-assign-table",
        shortcut: "a",
        priority: 45,
        handler: () => router.push("/tables"),
      },
      ...(isTerminalEvent
        ? []
        : [
            {
              id: "reservations-confirm",
              shortcut: "c",
              priority: 55,
              handler: () => {
                if (!activeReservation) {
                  return;
                }

                if (activeReservation.status === "Draft" || activeReservation.status === "Pending") {
                  setReservationStatus(activeReservation.id, "Confirmed");
                }
              },
            },
          ]),
    ],
    [activeReservation, isTerminalEvent, openReservationWizard, router, setReservationStatus],
  );

  useKeyboardShortcuts(keyboardShortcuts);

  useEffect(() => {
    if (!isWizardOpen || isTerminalEvent) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeWizard();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeWizard, isTerminalEvent, isWizardOpen]);

  const updateGuestCount = (nextCount: number) => {
    const sanitizedCount = clampGuestCount(nextCount);
    setGuestCount(sanitizedCount);
    setGuestDrafts((currentGuests) => {
      if (sanitizedCount === currentGuests.length) {
        return currentGuests;
      }

      if (sanitizedCount > currentGuests.length) {
      return [
        ...currentGuests,
        ...Array.from({ length: sanitizedCount - currentGuests.length }, (_, index) =>
          createGuestDraft(currentGuests.length + index, reservationGuestPresets),
        ),
      ];
      }

      return currentGuests.slice(0, sanitizedCount);
    });
  };

  const updateGuest = (
    index: number,
    field: keyof GuestDraft,
    value: string | boolean,
  ) => {
    setGuestDrafts((currentGuests) =>
      currentGuests.map((guest, guestIndex) =>
        guestIndex === index ? { ...guest, [field]: value } : guest,
      ),
    );
  };

  const addGuest = () => {
    if (guestCount >= 10) {
      return;
    }

    const nextCount = guestCount + 1;
    setGuestCount(nextCount);
    setGuestDrafts((currentGuests) => [
      ...currentGuests,
      createGuestDraft(currentGuests.length, reservationGuestPresets),
    ]);
  };

  const removeGuest = (index: number) => {
    if (guestDrafts.length <= 1) {
      return;
    }

    setGuestDrafts((currentGuests) => currentGuests.filter((_, guestIndex) => guestIndex !== index));
    setGuestCount((currentCount) => clampGuestCount(currentCount - 1));
  };

  const goNext = () =>
    setStep((currentStep) => Math.min(6, currentStep + 1) as WizardStep);
  const goPrevious = () =>
    setStep((currentStep) => Math.max(1, currentStep - 1) as WizardStep);

  const runReservationSubmit = useCallback(
    async (submissionLabel: string, task: () => Promise<void>) => {
      const result = await runReservationSubmission(reservationSubmissionGateRef.current, async () => {
        setIsSubmittingReservation(true);
        setSubmissionActionLabel(submissionLabel);

        try {
          return await task();
        } finally {
          setIsSubmittingReservation(false);
        }
      });

      return result;
    },
    [],
  );

  const completeReservation = async (input: Omit<ReservationCreationInput, "eventId">) => {
    try {
      await runReservationSubmit("Creando reserva…", async () => {
        setSubmissionError(null);
        const payload = {
          ...input,
          eventId: currentEvent.id,
          eventName: currentEvent.name,
        };

        const selectedResource = payload.selectedResource ?? payload.selectedTable ?? selectedResourceContext.resource;
        const capacityViolation = resolveReservationCapacityViolation({
          resourceCapacity: selectedResource?.capacity,
          guestCount: payload.guests.length,
          resourceName: selectedResource?.name,
        });

        if (capacityViolation) {
          setSubmissionError(capacityViolation);
          return;
        }

        const reservation = await createReservation(payload);

        if (!reservation) {
          setSubmissionError("El evento está cerrado y no admite nuevas reservas.");
          return;
        }

        setActiveReservationId(reservation.id);

        finalizeWizardClose();
      });
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "No se pudo crear la reserva. Intenta nuevamente.");
      console.error("Failed to create reservation:", error);
    }
  };

  const completeEditedReservation = async (input: Omit<ReservationCreationInput, "eventId"> & { reservationId: string }) => {
    try {
      await runReservationSubmit("Guardando cambios…", async () => {
        setSubmissionError(null);
        const payload = {
          ...input,
          eventId: currentEvent.id,
          eventName: currentEvent.name,
        };
        const selectedResource = payload.selectedResource ?? payload.selectedTable ?? selectedResourceContext.resource;
        const capacityViolation = resolveReservationCapacityViolation({
          resourceCapacity: selectedResource?.capacity,
          guestCount: payload.guests.length,
          resourceName: selectedResource?.name,
        });

        if (capacityViolation) {
          setSubmissionError(capacityViolation);
          return;
        }

        const reservation = await updateReservation(payload);

        if (!reservation) {
          setSubmissionError("El evento está cerrado y no admite cambios en la reserva.");
          return;
        }

        finalizeWizardClose();
      });
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "No se pudo guardar la reserva. Intenta nuevamente.");
      console.error("Failed to update reservation:", error);
    }
  };

  const completeAppendReservation = async (input: Omit<ReservationCreationInput, "eventId">) => {
    try {
      await runReservationSubmit("Agregando manillas…", async () => {
        setSubmissionError(null);

        if (!selectedActiveReservation) {
          setSubmissionError("No se encontró una reserva activa para agregar manillas.");
          return;
        }

        const payload = {
          ...input,
          eventId: currentEvent.id,
          eventName: currentEvent.name,
        };
        const selectedResource = payload.selectedResource ?? payload.selectedTable ?? selectedResourceContext.resource;
        const capacityViolation = resolveReservationCapacityViolation({
          resourceCapacity: selectedResource?.capacity,
          guestCount: payload.guests.length,
          existingGuestCount: selectedActiveReservation.guestIds.length,
          resourceName: selectedResource?.name,
        });

        if (capacityViolation) {
          setSubmissionError(capacityViolation);
          return;
        }

        const reservation = await appendReservationGuests(
          selectedActiveReservation.id,
          payload.guests.map((guest) => ({
            guestName: guest.name.trim() || "Invitado",
            carnet: guest.document,
            whatsapp: guest.whatsapp,
          })),
        );

        if (!reservation) {
          setSubmissionError("La reserva o el evento están cerrados y no admiten más invitados.");
          return;
        }

        setActiveReservationId(reservation.id);

        finalizeWizardClose();
      });
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "No se pudieron agregar las manillas. Intenta nuevamente.");
      console.error("Failed to append reservation guests:", error);
    }
  };

  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="Reservas"
        title="Flujo de creación"
        description="Experiencia premium guiada para crear reservas con datos simulados y sin salir del espacio operativo."
      />

      <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
              Borrador
            </span>
            <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
              Todo el flujo es simulado
            </span>
          </div>

          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Crear una reserva premium en menos de un minuto.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              El operador captura la información general, titular, invitados, mesa
              y pago dentro de un flujo limpio, rápido y elegante.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={openReservationWizard}
              disabled={isTerminalEvent}
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white sm:w-auto"
            >
              {isTerminalEvent ? "Evento cerrado" : "Crear reserva"}
            </button>
            <div className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300 sm:w-auto">
              Contexto activo: <span className="font-medium text-white">{currentEvent.name}</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Resumen operativo
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {workspaceIntelligence.dashboard.summaryMetrics.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                detail={metric.detail}
                tone={metric.tone}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.74fr]">
        <div className="min-w-0 space-y-6">
          {isTerminalEvent ? (
            <TerminalEventBanner description="El evento está cerrado. La vista queda disponible para revisar reservas y trazabilidad sin ejecutar mutaciones." />
          ) : (
            <GuidedActionPanel
              title="Siguiente paso"
              description="El sistema muestra primero la acción que más desbloquea esta reserva."
              items={guidedActions}
            />
          )}

          <ReservationOperationsBoard
            reservations={prioritizedReservations}
            activeReservationId={activeReservation?.id ?? ""}
            isTerminalEvent={isTerminalEvent}
            onSelectReservation={setActiveReservationId}
            onMarkConfirmed={(reservationId) => {
              setReservationStatus(reservationId, "Confirmed");
            }}
            onAddGuest={(reservationId, guest) => {
              addReservationGuest(reservationId, guest);
            }}
            onGuestAction={(params) => {
              updateReservationGuest(params);
            }}
            onRegisterCheckIn={(reservationId, guestId) => {
              const reservation = reservationSummaries.find((item) => item.id === reservationId);
              const guest = reservation?.guests.find((item) => item.id === guestId);

              if (!reservation || !guest) {
                return;
              }

              registerCheckIn({
                query: guest.invitationCode,
                method: "Manual",
                operator: "Recepción",
              });
            }}
            onCancelReservation={(reservationId) => {
              setReservationStatus(reservationId, "Cancelled");
            }}
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Estado general
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LiveSummaryRow label="Reservas activas" value={`${reservationTotals.activeReservations}`} />
              <LiveSummaryRow label="Invitados" value={`${reservationTotals.expectedGuests}`} />
              <LiveSummaryRow label="Confirmados" value={`${reservationTotals.confirmedReservations}`} />
              <LiveSummaryRow label="Ingresados" value={`${reservationTotals.checkedInGuests}`} />
              <LiveSummaryRow label="Pendientes" value={`${reservationTotals.pendingGuests}`} />
              <LiveSummaryRow label="Capacidad restante" value={`${reservationTotals.capacityRemaining}`} />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-slate-950/40 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Reserva activa
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Reserva
                </p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-white">
                  {activeReservation?.name ?? reservationType} · {activeReservation?.eventName ?? eventName}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <LiveSummaryRow label="Invitados" value={`${activeReservation?.metrics.guestCount ?? guestCount}`} />
                <LiveSummaryRow label="Registrados" value={`${activeReservation?.metrics.checkedInGuests ?? registeredGuests}`} />
                <LiveSummaryRow label="Recurso" value={activeReservation?.tableName ?? selectedResource?.name ?? "Sin recurso"} />
                <LiveSummaryRow label="Pago" value={activeReservation?.paymentStatus ?? paymentStatus} />
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Prioridad operativa</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{prioritySummary.message}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{prioritySummary.nextBestAction}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">{workspaceIntelligence.health.title}</p>
            <div className="mt-4 space-y-3">
              {reservationInsights.length ? (
                reservationInsights.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{item.description}</p>
                      </div>
                      <StatusBadge variant={item.tone}>{item.priority}</StatusBadge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
                  Sin recomendaciones activas.
                </div>
              )}
            </div>
            <p className="mt-4 text-xs text-slate-400">{capacity.summary}</p>
          </section>
        </aside>
      </section>

      {isWizardOpen && !isTerminalEvent ? (
        <ReservationWizardModal
          step={step}
          setStep={setStep}
          goNext={goNext}
          goPrevious={goPrevious}
          closeWizard={closeWizard}
          eventName={eventName}
          setEventName={setEventName}
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
          guestCount={guestCount}
          updateGuestCount={updateGuestCount}
          reservationType={reservationType}
          setReservationType={setReservationType}
          observations={observations}
          setObservations={setObservations}
          holderName={holderName}
          setHolderName={setHolderName}
          holderLastName={holderLastName}
          setHolderLastName={setHolderLastName}
          documentValue={documentValue}
          setDocumentValue={setDocumentValue}
          whatsapp={whatsapp}
          setWhatsapp={setWhatsapp}
          email={email}
          setEmail={setEmail}
          preferences={preferences}
          setPreferences={setPreferences}
          vip={vip}
          setVip={setVip}
          frequent={frequentCustomer.frequent}
          notes={notes}
          setNotes={setNotes}
          guests={guestDrafts}
          addGuest={addGuest}
          removeGuest={removeGuest}
          updateGuest={updateGuest}
          selectedResource={selectedResource}
          selectedResourceSummary={selectedResourceSummary}
          selectedActiveReservation={wizardReservation}
          selectedReservationConflictCount={selectedReservationConflictCount}
          wizardMode={wizardMode}
          selectedResourceId={selectedResourceId}
          setSelectedResourceId={setSelectedResourceId}
          resourceOptions={resourceOptions}
          amount={amount}
          setAmount={setAmount}
          advance={advance}
          setAdvance={setAdvance}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentStatus={paymentStatus}
          setPaymentStatus={setPaymentStatus}
          pendingNumber={pendingNumber}
          completion={completion}
          registeredGuests={registeredGuests}
          pendingGuests={pendingGuests}
          isSubmitting={isSubmittingReservation}
          submissionActionLabel={submissionActionLabel}
          onCreateReservation={completeReservation}
          onUpdateReservation={completeEditedReservation}
          onAddManillas={completeAppendReservation}
          eventOptions={eventOptions}
          submissionError={submissionError}
        />
      ) : null}
      {isWizardOpen && isTerminalEvent ? (
        <TerminalEventBanner description="El evento está cerrado. El asistente de reservas queda en modo lectura y no permite crear ni editar reservas." />
      ) : null}
    </div>
  );
}
