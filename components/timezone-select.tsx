"use client";

import { useMemo } from "react";

import { getTimezoneOptions } from "@/lib/timezone";

type TimezoneSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  preferredTimezone?: string;
};

export default function TimezoneSelect({
  label,
  value,
  onChange,
  helperText,
  preferredTimezone,
}: TimezoneSelectProps) {
  const options = useMemo(() => getTimezoneOptions(preferredTimezone ?? value), [preferredTimezone, value]);

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText ? <p className="mt-2 text-xs text-slate-500">{helperText}</p> : null}
    </label>
  );
}
