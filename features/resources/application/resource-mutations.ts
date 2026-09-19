import type { Resource } from "@/features/domain/types";

export type ResourceMutationDeps = {
  assertPermission: (permission: "resource.manage") => void;
  persist: (resource: Resource) => Promise<void>;
  moveToSector: (resourceId: string, sectorId: string) => Promise<void>;
  requestReporting: () => Promise<unknown>;
};

export async function createResourceOperation(resource: Resource, deps: ResourceMutationDeps): Promise<Resource> {
  deps.assertPermission("resource.manage");
  await deps.persist(resource);
  await deps.requestReporting();
  return resource;
}

export async function moveResourceToSectorOperation(resourceId: string, sectorId: string, deps: ResourceMutationDeps): Promise<void> {
  deps.assertPermission("resource.manage");
  await deps.moveToSector(resourceId, sectorId);
  await deps.requestReporting();
}
