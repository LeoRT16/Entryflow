import type { GuestMoveAtomicResult } from "@/repositories/workspace-repositories";

export async function runMoveGuestToResource<T extends GuestMoveAtomicResult>(input: {
  persist: () => Promise<T>;
  commit: (result: T) => void;
  report: () => Promise<unknown>;
}) {
  const result = await input.persist();
  input.commit(result);
  if (result.changed) await input.report();
  return result;
}
