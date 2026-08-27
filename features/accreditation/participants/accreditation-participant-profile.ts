export type AccreditationParticipantProfile = {
  company?: string;
  jobTitle?: string;
  badgeName?: string;
  participantRole?: string;
};

export type AccreditationParticipantProfileInput = {
  company?: string | null;
  jobTitle?: string | null;
  badgeName?: string | null;
  participantRole?: string | null;
};

function normalizeOptionalText(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function readStringField(metadata: Record<string, unknown> | undefined, key: keyof AccreditationParticipantProfile) {
  const value = metadata?.[key];
  return normalizeOptionalText(typeof value === "string" ? value : undefined);
}

export function resolveAccreditationParticipantProfile(metadata?: Record<string, unknown> | null): AccreditationParticipantProfile {
  const safeMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : undefined;
  const profile: AccreditationParticipantProfile = {};

  const company = readStringField(safeMetadata, "company");
  const jobTitle = readStringField(safeMetadata, "jobTitle");
  const badgeName = readStringField(safeMetadata, "badgeName");
  const participantRole = readStringField(safeMetadata, "participantRole");

  if (company) profile.company = company;
  if (jobTitle) profile.jobTitle = jobTitle;
  if (badgeName) profile.badgeName = badgeName;
  if (participantRole) profile.participantRole = participantRole;

  return profile;
}

function applyField(
  target: Record<string, unknown>,
  key: keyof AccreditationParticipantProfile,
  value?: string | null,
) {
  const normalized = normalizeOptionalText(value);

  if (normalized) {
    target[key] = normalized;
    return;
  }

  delete target[key];
}

export function mergeAccreditationParticipantMetadata(
  current: Record<string, unknown> | null | undefined,
  patch: AccreditationParticipantProfileInput,
) {
  const next = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};

  applyField(next, "company", patch.company);
  applyField(next, "jobTitle", patch.jobTitle);
  applyField(next, "badgeName", patch.badgeName);
  applyField(next, "participantRole", patch.participantRole);

  return Object.keys(next).length ? next : undefined;
}
