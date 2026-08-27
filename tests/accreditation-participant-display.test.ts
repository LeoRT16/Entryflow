import assert from "node:assert/strict";
import test from "node:test";

import { buildAccreditationParticipantDisplayModel } from "@/features/accreditation/participants";

test("participant display model prefers badge name over the enrollment name", () => {
  const model = buildAccreditationParticipantDisplayModel({
    participantId: "enrollment-1",
    participantName: "Ana Pérez",
    categoryName: "VIP",
    eventName: "Conferencia 2026",
    metadata: {
      badgeName: "Ana VIP",
      company: "OpenAI Bolivia",
      jobTitle: "Speaker",
      participantRole: "Ponente",
    },
  });

  assert.equal(model.displayName, "Ana VIP");
  assert.equal(model.badgeName, "Ana VIP");
  assert.equal(model.participantName, "Ana Pérez");
  assert.equal(model.participantSubtitleLine, "Ana Pérez");
  assert.equal(model.companyJobTitleLine, "OpenAI Bolivia · Speaker");
  assert.equal(model.company, "OpenAI Bolivia");
  assert.equal(model.jobTitle, "Speaker");
  assert.equal(model.participantRole, "Ponente");
  assert.equal(model.categoryName, "VIP");
  assert.equal(model.eventName, "Conferencia 2026");
});

test("participant display model falls back to the enrollment name and stays safe when profile data is absent", () => {
  const model = buildAccreditationParticipantDisplayModel({
    participantId: "enrollment-2",
    participantName: "Bruno Gómez",
    metadata: {
      company: "",
      jobTitle: null,
      participantRole: undefined,
    },
  });

  assert.equal(model.displayName, "Bruno Gómez");
  assert.equal(model.badgeName, undefined);
  assert.equal(model.participantSubtitleLine, undefined);
  assert.equal(model.companyJobTitleLine, undefined);
  assert.equal(model.company, undefined);
  assert.equal(model.jobTitle, undefined);
  assert.equal(model.participantRole, undefined);
});
