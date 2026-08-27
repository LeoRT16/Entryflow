function getDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function buildIsoFromParts(parts: ReturnType<typeof getDateParts>) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function buildDateKeyFromParts(parts: ReturnType<typeof getDateParts>) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatAccreditationProgramDateTimeInput(iso: string, timeZone: string) {
  try {
    return buildIsoFromParts(getDateParts(new Date(iso), timeZone));
  } catch {
    return "";
  }
}

export function formatAccreditationProgramDateKey(iso: string, timeZone: string) {
  try {
    return buildDateKeyFromParts(getDateParts(new Date(iso), timeZone));
  } catch {
    return iso.slice(0, 10);
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getDateParts(date, timeZone);
  const utcEquivalent = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return utcEquivalent - date.getTime();
}

export function resolveAccreditationProgramDateTimeIso(localValue: string, timeZone: string) {
  const value = localValue.trim();

  if (!value) {
    return "";
  }

  const [datePart, timePart] = value.split("T");

  if (!datePart || !timePart) {
    return "";
  }

  const [year, month, day] = datePart.split("-").map((part) => Number(part));
  const [hour, minute] = timePart.split(":").map((part) => Number(part));

  if (![year, month, day, hour, minute].every((part) => Number.isFinite(part))) {
    return "";
  }

  const seed = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMillis = seed;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMillis), timeZone);
    const corrected = seed - offsetMs;

    if (Math.abs(corrected - utcMillis) < 1000) {
      utcMillis = corrected;
      break;
    }

    utcMillis = corrected;
  }

  return new Date(utcMillis).toISOString();
}
