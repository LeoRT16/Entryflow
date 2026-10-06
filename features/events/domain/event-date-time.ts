const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d{1,9})?)?$/;
const ZONED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

export function buildEventWallClockInterval({ date, startTime, endTime }: { date: string; startTime: string; endTime?: string }) {
  if (!date || !startTime) return { startAt: startTime ? `${date} ${startTime}` : date, endAt: endTime ? `${date} ${endTime}` : undefined, overnight: false };
  const overnight = Boolean(endTime && endTime <= startTime);
  const endDate = overnight ? addCalendarDay(date) : date;
  return { startAt: `${date} ${startTime}`, endAt: endTime ? `${endDate} ${endTime}` : undefined, overnight };
}

function addCalendarDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function toEventDateTimeInputValue(value: string, timeZone: string) {
  const local = LOCAL_DATE_TIME.exec(value);
  if (local) return `${local[1]}T${local[2]}`;
  if (!ZONED_DATE_TIME.test(value) || !timeZone) return "";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
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
    const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
  } catch {
    return "";
  }
}

export function resolveEventStartAtForSave({
  original,
  input,
  touched,
}: {
  original: string;
  input: string;
  touched: boolean;
}) {
  return touched ? input : original;
}
