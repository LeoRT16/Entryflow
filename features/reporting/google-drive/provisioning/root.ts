import type { GoogleDriveTransport, DriveFileMetadata } from "../client/transport";
import { FOLDER_MIME_TYPE } from "../client/transport";

export async function ensureOrganizationDriveRoot(transport: GoogleDriveTransport, rootFolderId?: string, name = "La Rota Carlota"): Promise<DriveFileMetadata> {
  if (rootFolderId) {
    const existing = await transport.getFileMetadata(rootFolderId);
    if (existing.trashed || existing.mimeType !== FOLDER_MIME_TYPE) throw new Error("drive_root_invalid");
    return existing;
  }
  const reservedId = await transport.generateFolderId();
  return transport.createFolder(name, undefined, reservedId);
}
