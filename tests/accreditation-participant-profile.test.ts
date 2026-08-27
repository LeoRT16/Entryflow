import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeAccreditationParticipantMetadata,
  resolveAccreditationParticipantProfile,
} from "@/features/accreditation/participants";

test("participant profile parsing tolerates missing metadata", () => {
  assert.deepEqual(resolveAccreditationParticipantProfile(undefined), {});
  assert.deepEqual(resolveAccreditationParticipantProfile(null), {});
});

test("participant profile parsing ignores malformed metadata", () => {
  assert.deepEqual(resolveAccreditationParticipantProfile("bad" as never), {});
});

test("participant profile parsing trims valid fields and ignores empty strings", () => {
  assert.deepEqual(
    resolveAccreditationParticipantProfile({
      company: "  OpenAI Bolivia  ",
      jobTitle: "  Speaker  ",
      badgeName: "  Ana VIP  ",
      participantRole: "  Ponente  ",
      unknown: "keep",
    }),
    {
      company: "OpenAI Bolivia",
      jobTitle: "Speaker",
      badgeName: "Ana VIP",
      participantRole: "Ponente",
    },
  );

  assert.deepEqual(
    resolveAccreditationParticipantProfile({
      company: "",
      jobTitle: "   ",
      badgeName: null,
      participantRole: undefined,
    }),
    {},
  );
});

test("participant metadata merge preserves unrelated keys and clears empty fields", () => {
  const merged = mergeAccreditationParticipantMetadata(
    {
      company: "Old Company",
      custom: "keep",
      nested: { answer: 42 },
    },
    {
      company: "",
      jobTitle: "Speaker",
      badgeName: "VIP",
      participantRole: "Ponente",
    },
  );

  assert.deepEqual(merged, {
    custom: "keep",
    nested: { answer: 42 },
    jobTitle: "Speaker",
    badgeName: "VIP",
    participantRole: "Ponente",
  });
});
