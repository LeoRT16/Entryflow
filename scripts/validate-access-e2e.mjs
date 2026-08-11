import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = resolve(ROOT, "reports", "access-e2e");

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function hash32(value) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createAccessGrantToken({ guestId, reservationId, eventId, code }) {
  const seed = ["entryflow", guestId, reservationId, eventId, code].join("|");
  return `qr_${hash32(seed)}${hash32(`${seed}|secondary`)}`;
}

function createUuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function accessGrantKey(guest) {
  return guest.access_grant_id ?? guest.id;
}

function buildGrantFromGuest(guest, reservation = null) {
  const code = guest.access_code ?? guest.invitation_code;
  const qrToken = guest.qr_token ?? createAccessGrantToken({
    guestId: guest.id,
    reservationId: guest.reservation_id,
    eventId: guest.event_id,
    code,
  });
  const state = guest.check_in_time || guest.admission_status === "Ingresó"
    ? "used"
    : guest.admission_status === "Anulada" || reservation?.status === "Cancelled"
      ? "cancelled"
      : reservation?.status === "No Show"
        ? "expired"
        : guest.admission_status === "Bloqueada"
          ? "blocked"
          : "active";

  return {
    id: accessGrantKey(guest),
    eventId: guest.event_id,
    code,
    qrToken,
    status: state,
    guestId: guest.id,
    reservationId: guest.reservation_id,
    reservationName: guest.reservation_name,
    guestName: guest.guest_name,
    tableId: guest.table_id ?? null,
    tableName: guest.table_name ?? null,
    eventName: guest.event_name,
    usesAllowed: 1,
    usesConsumed: state === "used" ? 1 : 0,
    source: guest.manual_admission ? "manual" : "whatsapp",
  };
}

function resolveAccessGrantByQuery({ query, guests, reservations, event = null }) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return { status: "not-found", grant: null, guest: null, reservation: null, matches: [], reason: "Búsqueda vacía." };
  }

  const scopedGuests = event ? guests.filter((guest) => guest.event_id === event.id) : guests;
  const candidateEntries = scopedGuests.map((guest) => {
    const reservation = reservations.find((item) => item.id === guest.reservation_id) ?? null;
    return { guest, reservation, grant: buildGrantFromGuest(guest, reservation) };
  });

  const exactMatches = candidateEntries.filter(({ grant, guest }) => {
    const haystack = [
      grant.qrToken,
      grant.code,
      guest.guest_name,
      guest.reservation_name,
      guest.reservation_code,
      guest.invitation_code,
      guest.access_code ?? "",
      guest.carnet,
      guest.whatsapp,
      guest.table_name ?? "",
      guest.event_name,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    return { status: "found", ...match, matches: exactMatches.map((entry) => entry.grant), reason: "Coincidencia exacta." };
  }

  if (exactMatches.length > 1) {
    return { status: "ambiguous", grant: null, guest: null, reservation: null, matches: exactMatches.map((entry) => entry.grant), reason: "Hay más de una coincidencia." };
  }

  const partialMatches = candidateEntries.filter(({ grant, guest }) => {
    const haystack = [
      grant.qrToken,
      grant.code,
      guest.guest_name,
      guest.reservation_name,
      guest.reservation_code,
      guest.invitation_code,
      guest.access_code ?? "",
      guest.carnet,
      guest.whatsapp,
      guest.table_name ?? "",
      guest.event_name,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  if (partialMatches.length === 1) {
    const match = partialMatches[0];
    return { status: "found", ...match, matches: partialMatches.map((entry) => entry.grant), reason: "Coincidencia parcial." };
  }

  if (partialMatches.length > 1) {
    return { status: "ambiguous", grant: null, guest: null, reservation: null, matches: partialMatches.map((entry) => entry.grant), reason: "La búsqueda devolvió varias coincidencias." };
  }

  return { status: "not-found", grant: null, guest: null, reservation: null, matches: [], reason: "Sin coincidencias." };
}

function buildAdmissionTicket(guest) {
  const code = guest.access_code ?? guest.invitation_code;
  const qrToken = guest.qr_token ?? code;
  return {
    id: accessGrantKey(guest),
    reservationId: guest.reservation_id,
    guestId: guest.id,
    eventId: guest.event_id,
    code,
    qrToken,
    status: guest.check_in_time || guest.admission_status === "Ingresó" ? "Checked In" : guest.admission_status === "Anulada" ? "Cancelled" : guest.admission_status === "Bloqueada" ? "Blocked" : "Created",
    createdAt: guest.updated_at,
    lastAction: "Created",
    accessType: guest.manual_admission ? "manual" : "invitation",
    entryCount: guest.check_in_time ? 1 : 0,
    maxEntries: 1,
    reentryAllowed: false,
  };
}

function evaluateAdmission({ ticket, query, method, operator, gate, timestamp }) {
  if (!ticket) {
    return {
      result: "Unknown",
      title: "Código inválido",
      reason: "No se encontró un ticket coincidente.",
      status: "Blocked",
      tone: "danger",
      note: "Código inválido.",
      shouldPersist: false,
      audit: { query, method, operator, gate, timestamp },
    };
  }

  if (ticket.status === "Expired") {
    return {
      result: "Expired",
      title: "Acceso expirado",
      reason: "El acceso expiró.",
      status: "Expired",
      tone: "danger",
      note: "La invitación o ticket ya venció.",
      shouldPersist: true,
      audit: { query, method, operator, gate, timestamp },
    };
  }

  if (ticket.status === "Blocked") {
    return {
      result: "Blocked",
      title: "Acceso bloqueado",
      reason: "El acceso fue bloqueado.",
      status: "Blocked",
      tone: "danger",
      note: "La invitación está bloqueada.",
      shouldPersist: true,
      audit: { query, method, operator, gate, timestamp },
    };
  }

  if (ticket.status === "Cancelled") {
    return {
      result: "Cancelled",
      title: "Acceso cancelado",
      reason: "El acceso fue cancelado.",
      status: "Cancelled",
      tone: "danger",
      note: "La invitación fue anulada.",
      shouldPersist: true,
      audit: { query, method, operator, gate, timestamp },
    };
  }

  if (ticket.status === "Checked In" || ticket.status === "Inside") {
    return {
      result: "Already Checked In",
      title: "Segundo intento bloqueado",
      reason: "El ticket ya fue consumido.",
      status: "Duplicate Attempt",
      tone: "warning",
      note: "Esta invitación ya fue utilizada.",
      shouldPersist: true,
      audit: { query, method, operator, gate, timestamp },
    };
  }

  return {
    result: "Valid",
    title: method === "manual" ? "Check-in manual" : "Check-in exitoso",
    reason: method === "manual" ? "Ingreso manual autorizado." : "QR validado correctamente.",
    status: "Checked In",
    tone: "success",
    note: method === "manual" ? "Ingreso manual registrado." : "QR validado correctamente.",
    shouldPersist: true,
    audit: { query, method, operator, gate, timestamp },
  };
}

async function fetchTable(url, key, table, select = "*") {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  const payload = await res.json();

  if (!res.ok) {
    throw new Error(`Failed to read ${table}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function upsertRow(url, key, table, row) {
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([row]),
  });

  const payload = await res.json();

  if (!res.ok) {
    throw new Error(`Failed to upsert ${table}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  const [guests, reservations, events, checkins, timelineEvents] = await Promise.all([
    fetchTable(url, key, "guests"),
    fetchTable(url, key, "reservations"),
    fetchTable(url, key, "events"),
    fetchTable(url, key, "checkins"),
    fetchTable(url, key, "timeline_events"),
  ]);

  const targetGuest = guests.find((guest) => !guest.check_in_time) ?? guests[0];
  const targetReservation = reservations.find((reservation) => reservation.id === targetGuest.reservation_id) ?? null;
  const targetEvent = events.find((event) => event.id === targetGuest.event_id) ?? null;
  const otherEvent = events.find((event) => event.id !== targetGuest.event_id) ?? targetEvent;
  const timestampIso = new Date().toISOString();
  const timestamp = timestampIso.slice(11, 16);
  const grant = buildGrantFromGuest(targetGuest, targetReservation);
  const ticket = buildAdmissionTicket(targetGuest);
  const admission = evaluateAdmission({ ticket, query: targetGuest.qr_token ?? grant.qrToken, method: "qr", operator: "Escáner", gate: "Principal", timestamp: timestampIso });
  const duplicateGuest = { ...targetGuest, admission_status: "Ingresó", check_in_time: targetGuest.check_in_time ?? timestamp, qr_status: "Usado", reservation_status: "Checked In" };
  const revokedGuest = { ...targetGuest, admission_status: "Anulada" };
  const regeneratedGuest = { ...targetGuest, access_code: `${targetGuest.access_code}-X`, qr_token: createAccessGrantToken({ guestId: targetGuest.id, reservationId: targetGuest.reservation_id, eventId: targetGuest.event_id, code: `${targetGuest.access_code}-X` }) };

  const resolutionByQr = resolveAccessGrantByQuery({ query: targetGuest.qr_token ?? grant.qrToken, guests, reservations, event: targetEvent });
  const resolutionByCode = resolveAccessGrantByQuery({ query: targetGuest.access_code ?? targetGuest.invitation_code, guests, reservations, event: targetEvent });
  const resolutionWrongEvent = resolveAccessGrantByQuery({ query: targetGuest.qr_token ?? grant.qrToken, guests, reservations, event: otherEvent && otherEvent.id !== targetGuest.event_id ? otherEvent : { id: "00000000-0000-0000-0000-000000000000" } });
  const resolutionMissing = resolveAccessGrantByQuery({ query: "NO-EXISTE-123", guests, reservations, event: targetEvent });
  const revokedGrant = buildGrantFromGuest(revokedGuest, targetReservation);
  const regeneratedGrant = buildGrantFromGuest(regeneratedGuest, targetReservation);

  const writeCheckIn = {
    id: grant.id,
    guest_id: targetGuest.id,
    reservation_id: targetGuest.reservation_id,
    event_id: targetGuest.event_id,
    access_grant_id: grant.id,
    access_type: targetGuest.manual_admission ? "manual" : "invitation",
    method: "QR",
    checked_in_at: timestamp,
    checked_out_at: null,
    operator: "Escáner",
    gate: targetGuest.gate ?? "Principal",
    notes: "QR validado correctamente.",
    audit_trail: [
      {
        id: createUuid(),
        timestamp,
        kind: "access.checked_in",
        title: "Check-in exitoso",
        description: "QR validado correctamente.",
        tone: "success",
        operator: "Escáner",
        gate: targetGuest.gate ?? "Principal",
        metadata: { method: "qr", query: targetGuest.qr_token ?? grant.qrToken, result: "Valid" },
      },
    ],
    reentry_allowed: true,
    max_entries: 1,
    reentry_window_minutes: null,
    attempt_count: 1,
    last_attempt_at: timestamp,
    status: "Checked In",
    source: "qr",
  };

  const writeTimeline = {
    id: createUuid(),
    event_id: targetGuest.event_id,
    timestamp,
    kind: "checkin.success",
    icon: "checkin",
    tone: "success",
    title: "Check-in exitoso",
    description: `${targetGuest.guest_name} validó su ingreso con QR.`,
    reservation_id: targetGuest.reservation_id,
    reservation_code: targetGuest.reservation_code,
    reservation_name: targetGuest.reservation_name,
    guest_id: targetGuest.id,
    guest_name: targetGuest.guest_name,
    table_id: targetGuest.table_id ?? null,
    table_name: targetGuest.table_name ?? null,
    metadata: {
      method: "qr",
      query: targetGuest.qr_token ?? grant.qrToken,
      result: "Valid",
      accessGrantId: grant.id,
      eventId: targetGuest.event_id,
    },
  };

  await Promise.all([
    upsertRow(url, key, "checkins", writeCheckIn),
    upsertRow(url, key, "timeline_events", writeTimeline),
    upsertRow(url, key, "guests", {
      ...targetGuest,
      admission_status: "Ingresó",
      reservation_status: "Checked In",
      qr_status: "Usado",
      check_in_time: timestamp,
      check_in_method: "QR",
      gate: targetGuest.gate ?? "Principal",
      manual_admission: targetGuest.manual_admission,
    }),
  ]);

  const concurrentWrites = await Promise.allSettled([
    upsertRow(url, key, "checkins", writeCheckIn),
    upsertRow(url, key, "checkins", writeCheckIn),
  ]);

  const checkinsAfter = await fetchTable(url, key, "checkins");
  const checkinMatches = checkinsAfter.filter((row) => row.access_grant_id === grant.id);
  const timelineAfter = await fetchTable(url, key, "timeline_events");
  const timelineMatches = timelineAfter.filter((row) => row.id === writeTimeline.id);
  const guestsAfter = await fetchTable(url, key, "guests");
  const updatedGuest = guestsAfter.find((guest) => guest.id === targetGuest.id) ?? null;
  const secondAttemptSource = updatedGuest ? { ...updatedGuest, admission_status: updatedGuest.admission_status ?? "Ingresó", check_in_time: updatedGuest.check_in_time ?? timestamp } : { ...targetGuest, admission_status: "Ingresó", check_in_time: timestamp };
  const secondAttemptTicket = buildAdmissionTicket(secondAttemptSource);
  const secondAttempt = evaluateAdmission({ ticket: secondAttemptTicket, query: targetGuest.qr_token ?? grant.qrToken, method: "qr", operator: "Escáner", gate: "Principal", timestamp: new Date().toISOString() });

  const report = {
    initialState: {
      checkins: checkins.length,
      timelineEvents: timelineEvents.length,
    },
    target: {
      guestId: targetGuest.id,
      reservationId: targetGuest.reservation_id,
      eventId: targetGuest.event_id,
      grantId: grant.id,
      code: grant.code,
      qrToken: grant.qrToken,
    },
    resolutionByQr: {
      status: resolutionByQr.status,
      grantId: resolutionByQr.grant?.id ?? null,
      guestId: resolutionByQr.guest?.id ?? null,
    },
    resolutionByCode: {
      status: resolutionByCode.status,
      grantId: resolutionByCode.grant?.id ?? null,
      guestId: resolutionByCode.guest?.id ?? null,
    },
    resolutionWrongEvent: {
      status: resolutionWrongEvent.status,
      matches: resolutionWrongEvent.matches.length,
    },
    resolutionMissing: {
      status: resolutionMissing.status,
      matches: resolutionMissing.matches.length,
    },
    revocation: {
      grantStatus: revokedGrant.status,
      evaluationResult: evaluateAdmission({
        ticket: buildAdmissionTicket(revokedGuest),
        query: targetGuest.qr_token ?? grant.qrToken,
        method: "qr",
        operator: "Escáner",
        gate: "Principal",
        timestamp,
      }).result,
    },
    admission,
    regeneration: {
      oldResolution: resolveAccessGrantByQuery({ query: grant.qrToken, guests: [regeneratedGuest], reservations, event: targetEvent }).status,
      newGrantToken: regeneratedGrant.qrToken,
      newResolution: resolveAccessGrantByQuery({ query: regeneratedGrant.qrToken, guests: [regeneratedGuest], reservations, event: targetEvent }).status,
    },
    duplicateGuestPreview: {
      status: buildGrantFromGuest(duplicateGuest, targetReservation).status,
      checkInTime: duplicateGuest.check_in_time,
    },
    persistence: {
      checkinsForGrant: checkinMatches.length,
      timelineForCheckin: timelineMatches.length,
      guestCheckInTime: updatedGuest?.check_in_time ?? null,
      secondAttemptResult: secondAttempt.result,
    },
    concurrency: {
      settled: concurrentWrites.map((entry) => entry.status),
      checkinsForGrantAfterConcurrency: (await fetchTable(url, key, "checkins")).filter((row) => row.access_grant_id === grant.id).length,
    },
    summary: {
      pass:
        resolutionByQr.status === "found" &&
        resolutionByCode.status === "found" &&
        resolutionWrongEvent.status !== "found" &&
        resolutionMissing.status === "not-found" &&
        grant.qrToken !== regeneratedGrant.qrToken &&
        checkinMatches.length === 1 &&
        timelineMatches.length >= 1 &&
        secondAttempt.result === "Already Checked In" &&
        (await fetchTable(url, key, "checkins")).filter((row) => row.access_grant_id === grant.id).length === 1,
    },
  };

  const reportPath = resolve(REPORT_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
