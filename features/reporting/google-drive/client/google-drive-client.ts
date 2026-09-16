import { google } from "googleapis";
import { createGoogleOAuthClient, setGoogleOAuthCredentials } from "../oauth/google-oauth-client";
import { createGoogleDriveTransport, type GoogleDriveTransport } from "./transport";
export function createAuthenticatedGoogleDriveTransport(refreshToken: string): GoogleDriveTransport { const auth = setGoogleOAuthCredentials(createGoogleOAuthClient(), refreshToken); return createGoogleDriveTransport(google.drive({ version: "v3", auth })); }
