export type AtomicTableResult = { changed: boolean; reservation?: { resource_id?: string | null; table_id?: string | null; table_capacity?: number | null } };

export async function runAssignReservationTable<T extends AtomicTableResult>(input: {
  reservationId: string;
  resourceId: string;
  persist: () => Promise<T>;
  commit: (result: T) => void;
  report: () => Promise<unknown>;
}) {
  const result = await input.persist();
  input.commit(result);
  await input.report();
  return result;
}

export async function runReleaseReservationTable<T extends AtomicTableResult>(input: {
  persist: () => Promise<T>;
  commit: (result: T) => void;
  report: () => Promise<unknown>;
}) {
  const result = await input.persist();
  input.commit(result);
  await input.report();
  return result;
}

export async function runCloseTable<T extends AtomicTableResult>(input: {
  persist: () => Promise<T>;
  commit: (result: T) => void;
  report: () => Promise<unknown>;
}) {
  const result = await input.persist();
  input.commit(result);
  await input.report();
  return result;
}
