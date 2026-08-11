import { createHash } from "node:crypto";

export const UUID_NAMESPACE = "7f2c5f9d-4f6d-4d5e-92c6-24b6d0a9b3c1";

export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function uuidFromName(namespace, name) {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(String(name)).digest();
  const bytes = Uint8Array.from(hash.slice(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

export function groupBy(items, iteratee) {
  const groups = new Map();

  for (const item of items) {
    const key = iteratee(item);
    const bucket = groups.get(key);

    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

export function uniqueBy(items, iteratee) {
  const seen = new Map();

  for (const item of items) {
    const key = iteratee(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  return [...seen.values()];
}

export function sortByCreatedAt(items) {
  return [...items].sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? -1 : 1;
    }

    return String(a.id).localeCompare(String(b.id));
  });
}

export function sortByDisplayOrder(items) {
  return [...items].sort((a, b) => {
    if (a.display_order !== b.display_order) {
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    }

    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? -1 : 1;
    }

    return String(a.id).localeCompare(String(b.id));
  });
}

export function softDeleteFilter(items) {
  return items.filter((item) => item.deleted_at === null);
}

export function nowIso() {
  return new Date().toISOString();
}

