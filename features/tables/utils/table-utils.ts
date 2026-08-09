export function formatTableOccupancy(assignedGuests: number, capacity: number) {
  return `${Math.round((assignedGuests / Math.max(capacity, 1)) * 100)}%`;
}

export function hasCapacityAvailable(assignedGuests: number, capacity: number) {
  return assignedGuests < capacity;
}
