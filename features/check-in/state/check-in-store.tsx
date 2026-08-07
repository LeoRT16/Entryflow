"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  admissionFilters,
  deliveryFilters,
  quickFilters,
  reservationFilters,
} from "@/features/customers/mock/customers";
import { buildDashboardSnapshot, buildReservations, searchGuests } from "@/features/check-in/domain/check-in-domain";
import { checkInEvents, checkInGuests } from "@/features/check-in/mock/check-in";
import type {
  CheckIn,
  CheckInAttempt,
  CheckInMethod,
  Event,
  Guest,
  Reservation,
} from "@/features/check-in/types";

type CheckInStoreContextValue = {
  events: Event[];
  activeEventId: string;
  activeEvent: Event;
  guests: Guest[];
  reservations: Reservation[];
  checkIns: CheckIn[];
  attempts: CheckInAttempt[];
  dashboard: ReturnType<typeof buildDashboardSnapshot>;
  customers: {
    eventOptions: Array<{ name: string; status: Event["status"] }>;
    eventStats: Record<string, { expectedGuests: number; checkedIn: number; pending: number; attention: number }>;
    guestRecords: Guest[];
    admissionFilters: typeof admissionFilters;
    deliveryFilters: typeof deliveryFilters;
    reservationFilters: typeof reservationFilters;
    quickFilters: typeof quickFilters;
  };
  findGuestByQuery: (query: string) => Guest | null;
  searchGuests: (query: string) => Guest[];
  registerCheckIn: (params: {
    query: string;
    method: CheckInMethod;
    operator?: string;
    manual?: boolean;
  }) => {
    result: CheckInAttempt["result"];
    guest?: Guest;
    note: string;
  };
  setActiveEventId: (eventId: string) => void;
};

const CheckInStoreContext = createContext<CheckInStoreContextValue | null>(null);

function toEventStats(events: Event[], guests: Guest[]) {
  return Object.fromEntries(
    events.map((event) => {
      const eventGuests = guests.filter((guest) => guest.eventId === event.id);
      const checkedIn = eventGuests.filter((guest) => guest.admissionStatus === "Ingresó").length;
      const pending = Math.max(eventGuests.length - checkedIn, 0);
      const attention = eventGuests.filter((guest) => Boolean(guest.attention)).length;

      return [
        event.name,
        {
          expectedGuests: eventGuests.length,
          checkedIn,
          pending,
          attention,
        },
      ];
    }),
  );
}

function createCheckInRecord(params: {
  guest: Guest;
  method: CheckInMethod;
  operator: string;
  time: string;
}): CheckIn {
  return {
    id: `${params.guest.id}-${params.time}`,
    guestId: params.guest.id,
    reservationId: params.guest.reservationId,
    eventId: params.guest.eventId,
    method: params.method,
    checkedInAt: params.time,
    operator: params.operator,
    status: "Ingresó",
  };
}

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [activeEventId, setActiveEventId] = useState(checkInEvents[0].id);
  const [guests, setGuests] = useState<Guest[]>(checkInGuests);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [attempts, setAttempts] = useState<CheckInAttempt[]>([]);

  const activeEvent = useMemo(
    () => checkInEvents.find((event) => event.id === activeEventId) ?? checkInEvents[0],
    [activeEventId],
  );

  const reservations = useMemo(() => buildReservations(guests, activeEvent), [activeEvent, guests]);
  const dashboard = useMemo(
    () => buildDashboardSnapshot(guests, checkInEvents, activeEventId),
    [activeEventId, guests],
  );
  const customerEventStats = useMemo(() => toEventStats(checkInEvents, guests), [guests]);

  const customers = useMemo(
    () => ({
      eventOptions: checkInEvents.map((event) => ({ name: event.name, status: event.status })),
      eventStats: customerEventStats,
      guestRecords: guests,
      admissionFilters,
      deliveryFilters,
      reservationFilters,
      quickFilters,
    }),
    [customerEventStats, guests],
  );

  const findGuestByQuery = useCallback(
    (query: string) => {
      return searchGuests(guests, query)[0] ?? null;
    },
    [guests],
  );

  const registerCheckIn = useCallback(
    ({
      query,
      method,
      operator = method === "Manual" ? "Recepción" : "Escáner",
    }: {
      query: string;
      method: CheckInMethod;
      operator?: string;
      manual?: boolean;
    }) => {
      const guest = findGuestByQuery(query);
      const timestamp = new Date().toLocaleTimeString("es-BO", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      if (!guest) {
        const attempt: CheckInAttempt = {
          id: `attempt-${crypto.randomUUID()}`,
          query,
          method,
          timestamp,
          result: "No encontrado",
          note: "Código inválido.",
        };

        setAttempts((current) => [attempt, ...current].slice(0, 12));

        return {
          result: attempt.result,
          note: attempt.note,
        };
      }

      if (guest.admissionStatus === "Ingresó") {
        const attempt: CheckInAttempt = {
          id: `attempt-${crypto.randomUUID()}`,
          query,
          method,
          timestamp,
          result: "Usado",
          guestId: guest.id,
          guestName: guest.guestName,
          note: "Esta invitación ya fue utilizada.",
        };

        setAttempts((current) => [attempt, ...current].slice(0, 12));

        return {
          result: attempt.result,
          guest,
          note: attempt.note,
        };
      }

      if (guest.admissionStatus === "Anulada" || guest.admissionStatus === "Bloqueada") {
        const result = guest.admissionStatus === "Anulada" ? "Anulado" : "Bloqueado";
        const attempt: CheckInAttempt = {
          id: `attempt-${crypto.randomUUID()}`,
          query,
          method,
          timestamp,
          result,
          guestId: guest.id,
          guestName: guest.guestName,
          note:
            guest.admissionStatus === "Anulada"
              ? "La invitación fue anulada."
              : "La invitación está bloqueada.",
        };

        setAttempts((current) => [attempt, ...current].slice(0, 12));

        return {
          result: attempt.result,
          guest,
          note: attempt.note,
        };
      }

      const nextGuest: Guest = {
        ...guest,
        admissionStatus: "Ingresó",
        qrStatus: "Usado",
        checkInTime: timestamp,
        checkInMethod: method,
        gate: method === "Manual" ? "Recepción" : guest.gate ?? "Principal",
        manualAdmission: method === "Manual" ? true : guest.manualAdmission,
      };

      setGuests((current) => current.map((item) => (item.id === guest.id ? nextGuest : item)));
      setCheckIns((current) => [createCheckInRecord({ guest: nextGuest, method, operator, time: timestamp }), ...current].slice(0, 12));

      const attempt: CheckInAttempt = {
        id: `attempt-${crypto.randomUUID()}`,
        query,
        method,
        timestamp,
        result: "Encontrado",
        guestId: nextGuest.id,
        guestName: nextGuest.guestName,
        note: method === "Manual" ? "Ingreso manual registrado." : "QR validado correctamente.",
      };

      setAttempts((current) => [attempt, ...current].slice(0, 12));

      return {
        result: attempt.result,
        guest: nextGuest,
        note: attempt.note,
      };
    },
    [findGuestByQuery],
  );

  const value = useMemo<CheckInStoreContextValue>(
    () => ({
      events: checkInEvents,
      activeEventId,
      activeEvent,
      guests,
      reservations,
      checkIns,
      attempts,
      dashboard,
      customers,
      findGuestByQuery,
      searchGuests: (query: string) => searchGuests(guests, query),
      registerCheckIn,
      setActiveEventId,
    }),
    [activeEvent, activeEventId, attempts, checkIns, customers, dashboard, findGuestByQuery, guests, registerCheckIn, reservations],
  );

  return <CheckInStoreContext.Provider value={value}>{children}</CheckInStoreContext.Provider>;
}

export function useCheckInStore() {
  const context = useContext(CheckInStoreContext);

  if (!context) {
    throw new Error("useCheckInStore must be used within a CheckInProvider");
  }

  return context;
}
