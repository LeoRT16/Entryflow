import { resolveAccreditationParticipantProfile, type AccreditationParticipantProfile } from "./accreditation-participant-profile";

export type AccreditationParticipantDisplayModel = {
  participantId: string;
  participantName: string;
  displayName: string;
  badgeName?: string;
  company?: string;
  jobTitle?: string;
  participantRole?: string;
  categoryName?: string;
  eventName?: string;
  participantTitleLine?: string;
  participantSubtitleLine?: string;
  companyJobTitleLine?: string;
  participantRoleLine?: string;
};

export type AccreditationParticipantDisplayInput = {
  participantId: string;
  participantName: string;
  metadata?: Record<string, unknown> | null;
  categoryName?: string;
  eventName?: string;
};

function joinDisplayParts(parts: Array<string | undefined>) {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length ? filtered.join(" · ") : undefined;
}

function buildParticipantLines(profile: AccreditationParticipantProfile, participantName: string) {
  const displayName = profile.badgeName || participantName;
  const titleLine = displayName;
  const subtitleLine = displayName !== participantName ? participantName : undefined;
  const companyJobLine = joinDisplayParts([profile.company, profile.jobTitle]);

  return {
    displayName,
    titleLine,
    subtitleLine,
    companyJobLine,
    participantRoleLine: profile.participantRole || undefined,
  };
}

export function buildAccreditationParticipantDisplayModel(
  input: AccreditationParticipantDisplayInput,
): AccreditationParticipantDisplayModel {
  const profile = resolveAccreditationParticipantProfile(input.metadata);
  const lines = buildParticipantLines(profile, input.participantName);

  return {
    participantId: input.participantId,
    participantName: input.participantName,
    displayName: lines.displayName,
    badgeName: profile.badgeName,
    company: profile.company,
    jobTitle: profile.jobTitle,
    participantRole: profile.participantRole,
    categoryName: input.categoryName,
    eventName: input.eventName,
    participantTitleLine: lines.titleLine,
    participantSubtitleLine: lines.subtitleLine,
    companyJobTitleLine: lines.companyJobLine,
    participantRoleLine: lines.participantRoleLine,
  };
}
