import assert from "node:assert/strict";
import test from "node:test";

import type { AccreditationAccessGrant, AccreditationAccessRepository } from "../features/accreditation/access";
import type { AccreditationEnrollment } from "../features/accreditation/types";
import {
  AccreditationCheckInAlreadyConsumedError,
  registerAccreditationCheckInByAccessCode,
  registerAccreditationCheckInByQrToken,
} from "../features/accreditation/check-in";
import type { AccreditationCheckIn, AccreditationCheckInRepository } from "../features/accreditation/check-in";

function buildEnrollment(overrides: Partial<AccreditationEnrollment> = {}): AccreditationEnrollment {
  return {
    id: "enrollment-1",
    organizationId: "org-1",
    eventId: "event-1",
    name: "Invitado Accreditation",
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createAccessRepository(state: {
  grant?: AccreditationAccessGrant;
  enrollment?: AccreditationEnrollment;
}): AccreditationAccessRepository {
  return {
    async create(grant) {
      return grant;
    },
    async getById(scope, grantId) {
      void scope;
      return state.grant?.id === grantId ? state.grant : undefined;
    },
    async getByEnrollment(scope, enrollmentId) {
      void scope;
      return state.grant?.enrollmentId === enrollmentId ? state.grant : undefined;
    },
    async resolveByAccessCode(scope, accessCode) {
      if (!state.grant || state.grant.organizationId !== scope.organizationId || state.grant.eventId !== scope.eventId) {
        return undefined;
      }

      return state.grant.accessCode === accessCode.trim().toUpperCase() ? state.grant : undefined;
    },
    async resolveByQrToken(scope, qrToken) {
      if (!state.grant || state.grant.organizationId !== scope.organizationId || state.grant.eventId !== scope.eventId) {
        return undefined;
      }

      return state.grant.qrToken === qrToken.trim().toLowerCase() ? state.grant : undefined;
    },
    async revoke(scope, grantId) {
      void scope;
      if (!state.grant || state.grant.id !== grantId) {
        throw new Error("Accreditation access grant not found.");
      }

      state.grant = { ...state.grant, status: "revoked", updatedAt: "2026-08-26T13:00:00.000Z", revokedAt: "2026-08-26T13:00:00.000Z" };
      return state.grant;
    },
    async list() {
      return state.grant ? [state.grant] : [];
    },
  };
}

function createCheckInRepository(state: { checkIns: AccreditationCheckIn[] }) {
  return {
    async create(checkIn: AccreditationCheckIn) {
      state.checkIns.push(checkIn);
      return checkIn;
    },
    async getByAccessGrant(scope, accessGrantId: string) {
      void scope;
      return state.checkIns.find((item) => item.accessGrantId === accessGrantId);
    },
    async getByEnrollment(scope, enrollmentId: string) {
      void scope;
      return state.checkIns.find((item) => item.enrollmentId === enrollmentId);
    },
    async listByEvent(scope) {
      void scope;
      return [...state.checkIns];
    },
  } satisfies AccreditationCheckInRepository;
}

test("qr and manual code paths both resolve exact accreditation credentials and persist operator/source", async () => {
  const enrollment = buildEnrollment();
  const grant = buildGrant();
  const state = { checkIns: [] as AccreditationCheckIn[] };

  const qrResult = await registerAccreditationCheckInByQrToken({
    scope: { organizationId: "org-1", eventId: "event-1" },
    qrToken: " ACC1_1234567890ABCDEF1234567890ABCDEF ",
    operatorProfileId: "profile-1",
    metadata: { gate: "north" },
    dependencies: {
      enrollments: {
        async getById() {
          return enrollment;
        },
      },
      accessGrants: createAccessRepository({ grant, enrollment }),
      checkIns: createCheckInRepository(state),
      clock: () => "2026-08-26T12:10:00.000Z",
    },
  });

  const manualResult = await registerAccreditationCheckInByAccessCode({
    scope: { organizationId: "org-1", eventId: "event-1" },
    accessCode: " acc-aaaa-bbbb ",
    operatorProfileId: "profile-2",
    metadata: { gate: "south" },
    dependencies: {
      enrollments: {
        async getById() {
          return enrollment;
        },
      },
      accessGrants: createAccessRepository({ grant: buildGrant({ id: "grant-2", accessCode: "ACC-AAAA-BBBB", qrToken: "acc1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), enrollment }),
      checkIns: createCheckInRepository(state),
      clock: () => "2026-08-26T12:11:00.000Z",
    },
  });

  assert.equal(qrResult.source, "qr");
  assert.equal(qrResult.operatorProfileId, "profile-1");
  assert.equal(qrResult.accessGrantId, "grant-1");
  assert.equal(manualResult.source, "manual_code");
  assert.equal(manualResult.operatorProfileId, "profile-2");
  assert.equal(manualResult.accessGrantId, "grant-2");
});

test("duplicate access grant scans race through the DB unique constraint and return a consumption error", async () => {
  const enrollment = buildEnrollment();
  const grant = buildGrant();
  const state = { checkIns: [] as AccreditationCheckIn[] };
  const gate = deferred<void>();
  let createCalls = 0;

  const checkInRepository: AccreditationCheckInRepository = {
    async create(checkIn) {
      createCalls += 1;

      if (createCalls === 1) {
        await gate.promise;
        state.checkIns.push(checkIn);
        return checkIn;
      }

      gate.resolve();
      throw {
        code: "23505",
        constraint: "accreditation_checkins_access_grant_unique",
        message: 'duplicate key value violates unique constraint "accreditation_checkins_access_grant_unique"',
      };
    },
    async getByAccessGrant(_scope, accessGrantId) {
      return state.checkIns.find((item) => item.accessGrantId === accessGrantId);
    },
    async getByEnrollment(_scope, enrollmentId) {
      return state.checkIns.find((item) => item.enrollmentId === enrollmentId);
    },
    async listByEvent() {
      return [...state.checkIns];
    },
  };

  const dependencies = {
    enrollments: {
      async getById() {
        return enrollment;
      },
    },
    accessGrants: createAccessRepository({ grant, enrollment }),
    checkIns: checkInRepository,
    clock: () => "2026-08-26T12:12:00.000Z",
  };

  const first = registerAccreditationCheckInByQrToken({
    scope: { organizationId: "org-1", eventId: "event-1" },
    qrToken: grant.qrToken,
    operatorProfileId: "profile-1",
    dependencies,
  });

  const second = registerAccreditationCheckInByQrToken({
    scope: { organizationId: "org-1", eventId: "event-1" },
    qrToken: grant.qrToken,
    operatorProfileId: "profile-1",
    dependencies,
  });

  const results = await Promise.allSettled([first, second]);

  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal((results[1] as PromiseRejectedResult).reason instanceof AccreditationCheckInAlreadyConsumedError, true);
  assert.equal(state.checkIns.length, 1);
});

test("historical check-ins remain readable after later cancellation or revocation", async () => {
  const enrollment = buildEnrollment();
  const grant = buildGrant();
  const state = { checkIns: [] as AccreditationCheckIn[] };

  const dependencies = {
    enrollments: {
      async getById() {
        return enrollment;
      },
    },
    accessGrants: createAccessRepository({ grant, enrollment }),
    checkIns: createCheckInRepository(state),
    clock: () => "2026-08-26T12:13:00.000Z",
  };

  const checkIn = await registerAccreditationCheckInByQrToken({
    scope: { organizationId: "org-1", eventId: "event-1" },
    qrToken: grant.qrToken,
    operatorProfileId: "profile-1",
    dependencies,
  });

  enrollment.status = "cancelled";
  grant.status = "revoked";

  const historic = await dependencies.checkIns.getByAccessGrant({ organizationId: "org-1", eventId: "event-1" }, checkIn.accessGrantId);

  assert.equal(historic?.id, checkIn.id);
  assert.equal(historic?.source, "qr");
});
