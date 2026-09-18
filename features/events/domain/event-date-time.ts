const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d{1,9})?)?$/;
const ZONED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

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
