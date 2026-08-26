import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAccreditationAccessCode,
  generateAccreditationQrToken,
  getAccreditationAccessByEnrollment,
  issueAccreditationAccess,
  resolveAccreditationAccessByCode,
  resolveAccreditationAccessByQrToken,
  revokeAccreditationAccess,
} from "../features/accreditation/access";
import type {
  AccreditationAccessGrant,
  AccreditationAccessRepository,
  AccreditationAccessScope,
} from "../features/accreditation/access";
import type { AccreditationEnrollment } from "../features/accreditation/types";

function buildEnrollment(overrides: Partial<AccreditationEnrollment> = {}): AccreditationEnrollment {
  return {
    id: "enrollment-1",
    organizationId: "org-1",
    eventId: "event-1",
    name: "Leonardo Rodríguez",
    status: "active",
    metadata: { badge: "vip" },
    createdAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
    deletedAt: null,
    ...overrides,
  } as AccreditationEnrollment;
}

function buildGrant(overrides: Partial<AccreditationAccessGrant> = {}): AccreditationAccessGrant {
  return {
    id: "grant-1",
    organizationId: "org-1",
    eventId: "event-1",
    enrollmentId: "enrollment-1",
    accessCode: "ACC-7K4D-9M2Q",
    qrToken: "acc1_1234567890abcdef1234567890abcdef",
    status: "active",
    issuedAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
    revokedAt: null,
    metadata: { badge: "vip" },
    ...overrides,
  } as AccreditationAccessGrant;
}

function createRepository(overrides: Partial<AccreditationAccessRepository> = {}): AccreditationAccessRepository {
  const grants = new Map<string, AccreditationAccessGrant>();

  const repository: AccreditationAccessRepository = {
    async create(grant) {
      grants.set(grant.id, grant);
      return grant;
    },
    async getById(_scope, grantId) {
      return grants.get(grantId);
    },
    async getByEnrollment(_scope, enrollmentId) {
      for (const grant of grants.values()) {
        if (grant.enrollmentId === enrollmentId) {
          return grant;
        }
      }

      return undefined;
    },
    async resolveByAccessCode(_scope, accessCode) {
      for (const grant of grants.values()) {
        if (grant.accessCode === accessCode.trim().toUpperCase()) {
          return grant;
        }
      }

      return undefined;
    },
    async resolveByQrToken(_scope, qrToken) {
      for (const grant of grants.values()) {
        if (grant.qrToken === qrToken.trim().toLowerCase()) {
          return grant;
        }
      }

      return undefined;
    },
    async revoke(scope, grantId) {
      const current = grants.get(grantId);

      if (!current || current.organizationId !== scope.organizationId || current.eventId !== scope.eventId) {
        throw new Error("Accreditation access grant not found.");
      }

      const next = {
        ...current,
        status: "revoked" as const,
        revokedAt: current.revokedAt ?? "2026-08-26T13:00:00.000Z",
        updatedAt: "2026-08-26T13:00:00.000Z",
      };

      grants.set(grantId, next);
      return next;
    },
    async list(scope) {
      void scope;
      return [...grants.values()];
    },
    ...overrides,
  };

  return repository;
}

test("issue generates an operator-friendly access code and opaque QR token", async () => {
  const enrollment = buildEnrollment();
  const repository = createRepository();
  const scope: AccreditationAccessScope = { organizationId: "org-1", eventId: "event-1" };

  const dto = await issueAccreditationAccess({
    scope,
    enrollmentId: enrollment.id,
    dependencies: {
      enrollments: {
        async getById() {
          return enrollment;
        },
      },
      accessGrants: repository,
      clock: () => "2026-08-26T12:00:00.000Z",
      generateAccessCode: () => "ACC-7K4D-9M2Q",
      generateQrToken: () => "acc1_1234567890abcdef1234567890abcdef",
    },
  });

  assert.equal(dto.displayName, "Leonardo Rodríguez");
  assert.equal(dto.isValid, true);
  assert.match(dto.accessCode, /^ACC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(dto.qrToken, /^acc1_[a-f0-9]{32}$/);
});

test("issue remains stable when the same enrollment is requested again", async () => {
  const enrollment = buildEnrollment();
  const repository = createRepository();
  const scope: AccreditationAccessScope = { organizationId: "org-1", eventId: "event-1" };

  const first = await issueAccreditationAccess({
    scope,
    enrollmentId: enrollment.id,
    dependencies: {
      enrollments: {
        async getById() {
          return enrollment;
        },
      },
      accessGrants: repository,
      clock: () => "2026-08-26T12:00:00.000Z",
      generateAccessCode: () => "ACC-7K4D-9M2Q",
      generateQrToken: () => "acc1_1234567890abcdef1234567890abcdef",
    },
  });

  const second = await issueAccreditationAccess({
    scope,
    enrollmentId: enrollment.id,
    dependencies: {
      enrollments: {
        async getById() {
          return enrollment;
        },
      },
      accessGrants: repository,
      clock: () => "2026-08-26T12:30:00.000Z",
    },
  });

  assert.equal(first.grantId, second.grantId);
  assert.equal(second.accessCode, first.accessCode);
  assert.equal(second.qrToken, first.qrToken);
});

test("issue retries when the database rejects a generated access code or QR token", async () => {
  const enrollment = buildEnrollment();
  const calls: string[] = [];
  let attempts = 0;

  const repository = createRepository({
    async create(grant) {
      attempts += 1;
      calls.push(grant.accessCode);

      if (attempts === 1) {
        throw {
          code: "23505",
          constraint: "accreditation_access_grants_organization_event_access_code_unique",
          message: "duplicate key value violates unique constraint \"accreditation_access_grants_organization_event_access_code_unique\"",
        };
      }

      return grant;
    },
  });

  const dto = await issueAccreditationAccess({
    scope: { organizationId: "org-1", eventId: "event-1" },
    enrollmentId: enrollment.id,
    dependencies: {
      enrollments: {
        async getById() {
          return enrollment;
        },
      },
      accessGrants: repository,
      clock: () => "2026-08-26T12:00:00.000Z",
      generateAccessCode: (() => {
        const generated = ["ACC-AAAA-BBBB", "ACC-CCCC-DDDD"];
        return () => generated.shift() ?? "ACC-ZZZZ-ZZZZ";
      })(),
      generateQrToken: () => "acc1_1234567890abcdef1234567890abcdef",
    },
  });

  assert.equal(dto.accessCode, "ACC-CCCC-DDDD");
  assert.equal(calls.length, 2);
});

test("cancelled enrollment cannot be issued and existing grants stay readable as invalid", async () => {
  const cancelledEnrollment = buildEnrollment({ status: "cancelled" });
  const repository = createRepository({
    async create(grant) {
      return grant;
    },
  });

  await assert.rejects(
    () =>
      issueAccreditationAccess({
        scope: { organizationId: "org-1", eventId: "event-1" },
        enrollmentId: cancelledEnrollment.id,
        dependencies: {
          enrollments: {
            async getById() {
              return cancelledEnrollment;
            },
          },
          accessGrants: repository,
        },
      }),
    /not active/i,
  );

  const revokedGrant = buildGrant({ status: "revoked" });
  const revokedRepository = createRepository({
    async getByEnrollment() {
      return revokedGrant;
    },
  });

  const dto = await getAccreditationAccessByEnrollment({
    scope: { organizationId: "org-1", eventId: "event-1" },
    enrollmentId: revokedGrant.enrollmentId,
    dependencies: {
      enrollments: {
        async getById() {
          return cancelledEnrollment;
        },
      },
      accessGrants: revokedRepository,
    },
  });

  assert.equal(dto?.invalidReason, "revoked");
});

test("resolve by access code and QR token uses exact matching only", async () => {
  const grant = buildGrant();
  const repository = createRepository({
    async getByEnrollment() {
      return grant;
    },
    async resolveByAccessCode() {
      return grant;
    },
    async resolveByQrToken() {
      return grant;
    },
  });

  const code = await resolveAccreditationAccessByCode({
    scope: { organizationId: "org-1", eventId: "event-1" },
    accessCode: " acc-7k4d-9m2q ",
    dependencies: {
      enrollments: {
        async getById() {
          return buildEnrollment();
        },
      },
      accessGrants: repository,
    },
  });

  const token = await resolveAccreditationAccessByQrToken({
    scope: { organizationId: "org-1", eventId: "event-1" },
    qrToken: " ACC1_1234567890ABCDEF1234567890ABCDEF ",
    dependencies: {
      enrollments: {
        async getById() {
          return buildEnrollment();
        },
      },
      accessGrants: repository,
    },
  });

  assert.equal(code?.grantId, grant.id);
  assert.equal(token?.grantId, grant.id);
});

test("revoking a grant updates the persisted row and marks the DTO invalid", async () => {
  const grant = buildGrant();
  const repository = createRepository();
  const scope: AccreditationAccessScope = { organizationId: "org-1", eventId: "event-1" };
  await repository.create(grant);

  const dto = await revokeAccreditationAccess({
    scope,
    grantId: grant.id,
    dependencies: {
      enrollments: {
        async getById() {
          return buildEnrollment();
        },
      },
      accessGrants: repository,
    },
  });

  assert.equal(dto.isValid, false);
  assert.equal(dto.invalidReason, "revoked");
  assert.equal(dto.grantId, grant.id);
});

test("generators produce stable public formats", () => {
  const accessCode = generateAccreditationAccessCode();
  const qrToken = generateAccreditationQrToken();

  assert.match(accessCode, /^ACC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(qrToken, /^acc1_[a-f0-9]{32}$/);
});
