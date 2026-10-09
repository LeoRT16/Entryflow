const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function partsFor(value: string, timeZone: string) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    return Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  } catch {
    return null;
  }
}

export const ENTRYFLOW_TIMEZONE = "America/La_Paz";

export function formatTime(value: string, timeZone = ENTRYFLOW_TIMEZONE) {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) return trimmed.slice(0, 5);
  const parts = partsFor(trimmed, timeZone);
  return parts?.hour && parts.minute ? `${parts.hour}:${parts.minute}` : "--:--";
}

export function formatTimestamp(value: string, timeZone = ENTRYFLOW_TIMEZONE) {
  const parts = partsFor(value.trim(), timeZone);
  if (!parts?.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return "—";
  return `${Number(parts.day)} ${MONTHS_ES[Number(parts.month) - 1] ?? parts.month} ${parts.year} · ${parts.hour}:${parts.minute}`;
}

export function formatEventWallDateTime(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!match) return value.trim() || "—";
  const [, year, month, day, time] = match;
  return `${Number(day)} ${MONTHS_ES[Number(month) - 1] ?? month} ${year}${time ? ` · ${time}` : ""}`;
}

export function formatDateOnly(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value.trim() || "—";
  return `${Number(match[3])} ${MONTHS_ES[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}
