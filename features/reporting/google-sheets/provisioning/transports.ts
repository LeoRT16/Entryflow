import { google, type Auth, type drive_v3, type sheets_v4 } from "googleapis";
import { createGoogleOAuthClient, setGoogleOAuthCredentials } from "@/features/reporting/google-drive/oauth/google-oauth-client";

export const GOOGLE_SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
export const ENTRYFLOW_SPREADSHEET_MARKER = {
  managedBy: "entryflow",
  role: "live_reporting_sheet",
} as const;

export type SpreadsheetMarkers = typeof ENTRYFLOW_SPREADSHEET_MARKER & { eventId: string; organizationId: string };
export type ManagedSpreadsheetMetadata = {
  id: string;
  name: string;
  mimeType: string;
  trashed: boolean;
  parents: string[];
  appProperties: Record<string, string>;
};
export type GoogleSpreadsheetDriveTransport = {
  getFile(fileId: string): Promise<ManagedSpreadsheetMetadata>;
  findManagedSpreadsheets(parentId: string, markers: SpreadsheetMarkers): Promise<ManagedSpreadsheetMetadata[]>;
  createSpreadsheet(name: string, parentId: string, markers: SpreadsheetMarkers): Promise<ManagedSpreadsheetMetadata>;
  renameFile(fileId: string, name: string): Promise<ManagedSpreadsheetMetadata>;
};
export type GoogleSheetsOAuthMetadataTransport = {
  getSpreadsheetTitle(spreadsheetId: string): Promise<{ spreadsheetId: string; title: string }>;
};

function mapDriveFile(file: drive_v3.Schema$File, fallbackId = ""): ManagedSpreadsheetMetadata {
  const properties = file.appProperties && typeof file.appProperties === "object" ? file.appProperties : {};
  return {
    id: file.id ?? fallbackId,
    name: file.name ?? "",
    mimeType: file.mimeType ?? "",
    trashed: file.trashed === true,
    parents: file.parents ?? [],
    appProperties: Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
  };
}

function queryValue(value: string) { return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function markerQuery(key: string, value: string) { return `appProperties has { key='${queryValue(key)}' and value='${queryValue(value)}' }`; }

export function createGoogleSpreadsheetDriveTransport(auth: Auth.OAuth2Client): GoogleSpreadsheetDriveTransport {
  return createGoogleSpreadsheetDriveTransportFromApi(google.drive({ version: "v3", auth }));
}

export function createGoogleSpreadsheetDriveTransportFromApi(api: drive_v3.Drive): GoogleSpreadsheetDriveTransport {
  return {
    async getFile(fileId) {
      const response = await api.files.get({ fileId, fields: "id,name,mimeType,trashed,parents,appProperties", supportsAllDrives: true });
      return mapDriveFile(response.data, fileId);
    },
    async findManagedSpreadsheets(parentId, markers) {
      const q = [
        `'${queryValue(parentId)}' in parents`,
        `mimeType='${GOOGLE_SPREADSHEET_MIME_TYPE}'`,
        "trashed=false",
        markerQuery("managedBy", markers.managedBy),
        markerQuery("role", markers.role),
        markerQuery("eventId", markers.eventId),
        markerQuery("organizationId", markers.organizationId),
      ].join(" and ");
      const matches: ManagedSpreadsheetMetadata[] = [];
      let pageToken: string | undefined;
      do {
        const response = await api.files.list({
          q,
          fields: "nextPageToken,files(id,name,mimeType,trashed,parents,appProperties)",
          spaces: "drive",
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          pageSize: 100,
          pageToken,
        });
        matches.push(...(response.data.files ?? []).map((file) => mapDriveFile(file)));
        if (matches.length > 1) return matches.slice(0, 2);
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
      return matches;
    },
    async createSpreadsheet(name, parentId, markers) {
      const response = await api.files.create({
        requestBody: { name, mimeType: GOOGLE_SPREADSHEET_MIME_TYPE, parents: [parentId], appProperties: markers },
        fields: "id,name,mimeType,trashed,parents,appProperties",
        supportsAllDrives: true,
      });
      return mapDriveFile(response.data);
    },
    async renameFile(fileId, name) {
      const response = await api.files.update({ fileId, requestBody: { name }, fields: "id,name,mimeType,trashed,parents,appProperties", supportsAllDrives: true });
      return mapDriveFile(response.data, fileId);
    },
  };
}

export function createGoogleSheetsOAuthMetadataTransportFromAuth(
  auth: Auth.OAuth2Client,
  apiFactory: (auth: Auth.OAuth2Client) => sheets_v4.Sheets = (value) => google.sheets({ version: "v4", auth: value }),
): GoogleSheetsOAuthMetadataTransport {
  const api = apiFactory(auth);
  return {
    async getSpreadsheetTitle(spreadsheetId) {
      const response = await api.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId,properties(title)" });
      return { spreadsheetId: response.data.spreadsheetId ?? spreadsheetId, title: response.data.properties?.title ?? "" };
    },
  };
}

export function createGoogleSheetsOAuthMetadataTransport(refreshToken: string): GoogleSheetsOAuthMetadataTransport {
  return createGoogleSheetsOAuthMetadataTransportFromAuth(setGoogleOAuthCredentials(createGoogleOAuthClient(), refreshToken));
}

export function createGoogleOAuthTransports(refreshToken: string) {
  const auth = setGoogleOAuthCredentials(createGoogleOAuthClient(), refreshToken);
  return createGoogleOAuthTransportsFromAuth(auth);
}

export function createGoogleOAuthTransportsFromAuth(
  auth: Auth.OAuth2Client,
  factories: {
    drive: (client: Auth.OAuth2Client) => GoogleSpreadsheetDriveTransport;
    sheetsMetadata: (client: Auth.OAuth2Client) => GoogleSheetsOAuthMetadataTransport;
  } = {
    drive: createGoogleSpreadsheetDriveTransport,
    sheetsMetadata: createGoogleSheetsOAuthMetadataTransportFromAuth,
  },
) {
  return {
    drive: factories.drive(auth),
    sheetsMetadata: factories.sheetsMetadata(auth),
  };
}
