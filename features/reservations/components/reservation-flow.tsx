"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Topbar from "@/components/topbar";
import ReservationWizardModal, {
  wizardSteps,
} from "@/features/reservations/components/reservation-wizard-modal";
import ReservationOperationsBoard from "@/features/reservations/components/reservation-operations-board";
import GuestEditModal from "@/features/customers/components/guest-edit-modal";
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
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { isTerminalEventStatus } from "@/features/events/domain";
import type { WorkspaceIntelligence } from "@/domain/workspace-intelligence";

type CheckInStore = ReturnType<typeof useCheckInStore>;

type ReservationFlowTotals = Pick<
  WorkspaceIntelligence["statistics"]["cards"],
  "checkedInGuests" | "pendingGuests" | "capacityRemaining" | "occupancyPercent"
>;

export function buildReservationFlowTotals(totals: ReservationFlowTotals) {
  return {
    occupancyPercent: totals.occupancyPercent,
    checkedInGuests: totals.checkedInGuests,
    pendingGuests: totals.pendingGuests,
    capacityRemaining: totals.capacityRemaining,
  };
}

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
  | "reservationSummaries"
  | "can"
  | "createReservation"
  | "updateReservation"
  | "appendReservationGuests"
  | "addReservationGuest"
  | "updateReservationGuest"
  | "updateGuestProfile"
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
      reservationSummaries={store.reservationSummaries}
      can={store.can}
      createReservation={store.createReservation}
      updateReservation={store.updateReservation}
      appendReservationGuests={store.appendReservationGuests}
      addReservationGuest={store.addReservationGuest}
      updateReservationGuest={store.updateReservationGuest}
      updateGuestProfile={store.updateGuestProfile}
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
  reservationSummaries,
  can,
  createReservation,
  updateReservation,
  appendReservationGuests,
  addReservationGuest,
  updateReservationGuest,
  updateGuestProfile,
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
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
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
  const canEditGuest = can("guest.edit");

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
  const editingGuest = reservationGuests.find((guest) => guest.id === editingGuestId) ?? null;

  const handleSaveGuestProfile = useCallback(
    ({
      guestId,
      guestName,
      carnet,
      whatsapp,
    }: {
      guestId: string;
      guestName: string;
      carnet: string;
      whatsapp: string;
    }) => updateGuestProfile({ guestId, guestName, carnet, whatsapp }),
    [updateGuestProfile],
  );

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
  const reservationFlowTotals = buildReservationFlowTotals(reservationTotals);
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
        title="Reservas"
        description="Vista compacta para crear y operar reservas sin salir del flujo principal."
      />

      <section className="flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Contexto activo
          </p>
          <p className="mt-2 break-words text-sm font-medium text-white">{currentEvent.name}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {isTerminalEvent ? "Evento cerrado" : "Operación activa"}
          </p>
        </div>

        <button
          type="button"
          onClick={openReservationWizard}
          disabled={isTerminalEvent}
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        >
          {isTerminalEvent ? "Evento cerrado" : "Nueva reserva"}
        </button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="OCUPACIÓN"
          value={`${reservationFlowTotals.occupancyPercent}%`}
          detail="Capacidad utilizada sobre el total disponible."
        />
        <KpiCard
          label="INGRESADOS"
          value={`${reservationFlowTotals.checkedInGuests}`}
          detail="Ingresos ya registrados en el evento."
        />
        <KpiCard
          label="PENDIENTES"
          value={`${reservationFlowTotals.pendingGuests}`}
          detail="Invitados pendientes de ingreso."
        />
        <KpiCard
          label="CAPACIDAD RESTANTE"
          value={`${reservationFlowTotals.capacityRemaining}`}
          detail="Lugar disponible por operar."
        />
      </section>

      <section className="min-w-0">
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
          canEditGuest={canEditGuest}
          onEditGuest={(guestId) => {
            setEditingGuestId(guestId);
          }}
        />
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

      <GuestEditModal
        key={editingGuest ? `${editingGuest.id}-${editingGuestId ? "open" : "closed"}` : "closed"}
        open={Boolean(editingGuest)}
        guest={editingGuest}
        onClose={() => setEditingGuestId(null)}
        onSave={handleSaveGuestProfile}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
    </section>
  );
}
