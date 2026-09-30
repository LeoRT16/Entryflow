export async function persistReservationThenGuests<T>(input: { persistReservation: () => Promise<unknown>; guests: T[]; persistGuest: (guest: T) => Promise<unknown>; report: () => Promise<unknown> }) {
  await input.persistReservation();
  for (const guest of input.guests) await input.persistGuest(guest);
  return input.report();
}
