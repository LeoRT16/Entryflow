import type { TableOption } from "@/features/tables/types";

export const tableOptions: TableOption[] = [
  {
    id: "mesa-4",
    name: "Mesa 4",
    capacity: 4,
    location: "Sala principal",
    status: "Reserved",
    venueId: "venue-la-rota-carlota",
    sectorId: "sector-planta-baja",
    recommended: true,
    tone: "warning",
  },
  {
    id: "mesa-8",
    name: "Mesa 8",
    capacity: 8,
    location: "Sala principal",
    status: "Available",
    venueId: "venue-la-rota-carlota",
    sectorId: "sector-planta-baja",
    tone: "success",
  },
  {
    id: "vip-lounge",
    name: "VIP Lounge",
    capacity: 2,
    location: "Nivel superior",
    status: "Reserved",
    venueId: "venue-la-rota-carlota",
    sectorId: "sector-planta-alta",
    tone: "info",
  },
  {
    id: "terraza",
    name: "Terraza",
    capacity: 6,
    location: "Patio lateral",
    status: "Available",
    venueId: "venue-la-rota-carlota",
    sectorId: "sector-patio-a",
    tone: "success",
  },
  {
    id: "bar-1",
    name: "Bar 1",
    capacity: 3,
    location: "Frente a pista",
    status: "Closed",
    venueId: "venue-la-rota-carlota",
    sectorId: "sector-patio-b",
    tone: "danger",
  },
];

export const tableReservationSeeds = [
  {
    tableId: "mesa-4",
    reservationCode: "RC-0084",
  },
  {
    tableId: "vip-lounge",
    reservationCode: "CS-0142",
  },
  {
    tableId: "terraza",
    reservationCode: "MO-0208",
  },
];

export const tableDashboardNotes = [
  "Las mesas se actualizan con el mismo estado compartido de la operación.",
  "El movimiento entre mesas es mock y se recalcula en memoria.",
];
