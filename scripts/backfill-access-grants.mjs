import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = resolve(ROOT, "reports", "backfill-access-grants");

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

function buildGrantEntry(guest, reservation, event) {
  const code = guest.invitation_code;
  const qrToken = createAccessGrantToken({
    guestId: guest.id,
    reservationId: guest.reservation_id,
    eventId: guest.event_id,
    code,
  });
  const deliveryHistory = Array.isArray(guest.delivery_history) ? guest.delivery_history : [];
  const timestamp = deliveryHistory[0]?.time ?? guest.updated_at?.slice(11, 16) ?? "19:00";
  const status = guest.admission_status === "Ingresó" || guest.check_in_time ? "used" : guest.admission_status === "Anulada" ? "cancelled" : guest.admission_status === "Bloqueada" ? "blocked" : "active";
  const tone = status === "used" ? "success" : status === "active" ? "info" : "warning";

  return {
    id: guest.id,
    event_id: guest.event_id,
    timestamp,
    kind: "timeline.note",
    icon: "guest",
    tone,
    title: "Acceso generado",
    description: `${guest.guest_name} recibió su código y QR operativo.`,
    reservation_id: guest.reservation_id,
    reservation_code: guest.reservation_code,
    reservation_name: guest.reservation_name,
    guest_id: guest.id,
    guest_name: guest.guest_name,
    table_id: guest.table_id ?? null,
    table_name: guest.table_name ?? null,
    metadata: {
      entryType: "access.grant",
      accessGrantId: guest.id,
      accessType: guest.manual_admission ? "registration" : "invitation",
      status,
      code,
      qrToken,
      usesAllowed: 1,
      usesConsumed: status === "used" ? 1 : 0,
      reservationId: guest.reservation_id,
      reservationName: guest.reservation_name,
      reservationCode: guest.reservation_code,
      guestId: guest.id,
      guestName: guest.guest_name,
      eventId: guest.event_id,
      eventName: guest.event_name,
      tableId: guest.table_id ?? null,
      tableName: guest.table_name ?? null,
      source: guest.manual_admission ? "manual" : "whatsapp",
      venueId: event?.venue_id ?? null,
      reservationMatch: reservation?.id ?? null,
    },
  };
}

async function fetchTable(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
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

async function upsertTimelineEvents(url, key, entries) {
  const res = await fetch(`${url}/rest/v1/timeline_events?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(entries),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to upsert timeline_events: ${text}`);
  }

  return text;
}

async function deleteTimelineEvents(url, key, ids) {
  if (!ids.length) {
    return;
  }

  const res = await fetch(`${url}/rest/v1/timeline_events?id=in.(${ids.join(",")})`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to delete timeline_events: ${text}`);
  }
}

async function writeReport(report, name = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`) {
  await mkdir(REPORT_DIR, { recursive: true });
  const filePath = resolve(REPORT_DIR, name);
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}

async function main() {
  const mode = process.argv[2] ?? "dry-run";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  const [guests, reservations, events, timelineEvents] = await Promise.all([
    fetchTable(url, key, "guests"),
    fetchTable(url, key, "reservations"),
    fetchTable(url, key, "events"),
    fetchTable(url, key, "timeline_events"),
  ]);

  const reservationsById = new Map(reservations.map((reservation) => [reservation.id, reservation]));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const existingGrantIds = new Set(
    timelineEvents
      .filter((entry) => entry.metadata?.entryType === "access.grant")
      .map((entry) => entry.id),
  );

  const desiredEntries = guests.map((guest) => buildGrantEntry(guest, reservationsById.get(guest.reservation_id), eventsById.get(guest.event_id)));
  const missingEntries = desiredEntries.filter((entry) => !existingGrantIds.has(entry.id));
  const conflictingEntries = desiredEntries.filter((entry) => {
    const existing = timelineEvents.find((item) => item.id === entry.id);
    if (!existing) return false;
    return JSON.stringify(existing.metadata ?? {}) !== JSON.stringify(entry.metadata ?? {});
  });

  const report = {
    mode,
    detected: {
      guests: guests.length,
      reservations: reservations.length,
      events: events.length,
      timelineEvents: timelineEvents.length,
    },
    grants: {
      total: desiredEntries.length,
      missing: missingEntries.length,
      conflicting: conflictingEntries.length,
      sampleMissing: missingEntries.slice(0, 3).map((entry) => ({
        id: entry.id,
        guestName: entry.guest_name,
        reservationName: entry.reservation_name,
        code: entry.metadata.code,
        qrToken: entry.metadata.qrToken,
      })),
    },
  };

  const reportPath = await writeReport(report);
  console.log(JSON.stringify({ reportPath, report }, null, 2));

  if (mode === "apply") {
    await upsertTimelineEvents(url, key, missingEntries);
    console.log(JSON.stringify({ applied: missingEntries.length }, null, 2));
  } else if (mode === "rollback") {
    await deleteTimelineEvents(url, key, desiredEntries.map((entry) => entry.id));
    console.log(JSON.stringify({ rolledBack: desiredEntries.length }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
