export type TimezoneOption = {
  value: string;
  label: string;
};

const COMMON_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "America/La_Paz", label: "Bolivia (La Paz)" },
  { value: "America/Lima", label: "Perú (Lima)" },
  { value: "America/Bogota", label: "Colombia (Bogotá)" },
  { value: "America/Caracas", label: "Venezuela (Caracas)" },
  { value: "America/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { value: "America/Santiago", label: "Chile (Santiago)" },
  { value: "America/Asuncion", label: "Paraguay (Asunción)" },
  { value: "America/Montevideo", label: "Uruguay (Montevideo)" },
  { value: "America/Mexico_City", label: "México (Ciudad de México)" },
  { value: "America/New_York", label: "Estados Unidos (Nueva York)" },
];

export function detectTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/La_Paz";
}

export function getDefaultTimezone(preferredTimezone?: string | null) {
  const normalized = preferredTimezone?.trim();
  return normalized || detectTimezone();
}

export function getTimezoneLabel(timezone: string) {
  return COMMON_TIMEZONE_OPTIONS.find((option) => option.value === timezone)?.label
    ?? (timezone.trim() ? "Zona horaria personalizada" : "Zona horaria");
}

export function formatTimezoneLabel(timezone: string) {
  return getTimezoneLabel(timezone);
}

export function getTimezoneOptions(preferredTimezone?: string | null) {
  const values = new Set<string>();
  const options: TimezoneOption[] = [];

  const addOption = (option: TimezoneOption) => {
    if (!values.has(option.value)) {
      options.push(option);
      values.add(option.value);
    }
  };

  const preferred = preferredTimezone?.trim();
  if (preferred) {
    addOption({
      value: preferred,
      label: getTimezoneLabel(preferred),
    });
  }

  const detected = detectTimezone();
  addOption({
    value: detected,
    label: detected === preferred ? getTimezoneLabel(detected) : `${getTimezoneLabel(detected)} · detectada`,
  });

  COMMON_TIMEZONE_OPTIONS.forEach(addOption);

  return options;
}
