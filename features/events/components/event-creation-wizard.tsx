"use client";

import { useEffect, useMemo, useState } from "react";

import TimezoneSelect from "@/components/timezone-select";
import { useFeedback } from "@/components/premium-feedback";
import type { Event, Venue } from "@/features/domain/types";
import {
  buildEventFromDraft,
  buildEventDraft,
  getEnabledModules,
  getEventBlueprint,
  getEventBlueprints,
  getEventModuleLabel,
  getEventNavigation,
  getEventTypeLabel,
  getOperationalModelLabel,
} from "@/features/events/domain";
import type { EventBlueprint, EventDraft } from "@/features/events/domain";
import { getDefaultTimezone } from "@/lib/timezone";

type EventCreationWizardProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (event: Event) => Promise<Event | undefined>;
  organizationId: string;
  organizationTimezone: string;
  venues: Venue[];
};

export default function EventCreationWizard({
  open,
  onClose,
  onCreate,
  organizationId,
  organizationTimezone,
  venues,
}: EventCreationWizardProps) {
  const { showToast } = useFeedback();
  const [step, setStep] = useState(1);
  const [blueprint, setBlueprint] = useState<EventBlueprint>(() => getEventBlueprint("custom"));
  const [draft, setDraft] = useState<EventDraft>(() => buildEventDraft(getEventBlueprint("custom")));
  const preferredTimezone = getDefaultTimezone(organizationTimezone);
  const venueOptions = useMemo(() => venues, [venues]);
  const defaultVenue = useMemo(() => venueOptions.find((venue) => venue.status === "active") ?? venueOptions[0] ?? null, [venueOptions]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const previewEvent = useMemo(
    () =>
      buildEventFromDraft({
        organizationId,
        blueprint,
        draft,
        status: step === 6 ? "published" : "draft",
      }),
    [blueprint, draft, organizationId, step],
  );

  const navigationPreview = useMemo(() => getEventNavigation(previewEvent), [previewEvent]);
  const eventBlueprints = useMemo(() => getEventBlueprints(), []);

  if (!open) {
    return null;
  }

  const updateDraft = (updater: (current: EventDraft) => EventDraft) => {
    setDraft((current) => updater(current));
  };

  const selectBlueprint = (nextBlueprint: EventBlueprint) => {
    setBlueprint(nextBlueprint);

    const nextDraft = buildEventDraft(nextBlueprint);

    if (nextBlueprint.eventType === "custom") {
      setDraft({
        ...nextDraft,
        name: "Evento personalizado",
        capacity: "",
        venueId: defaultVenue?.id ?? "",
        venue: defaultVenue?.name ?? nextDraft.venue,
        enabledModules: ["overview"],
        admissionMethods: ["manual", "list", "code"],
        resourceTypes: [],
        timezone: preferredTimezone,
      });
      setStep(2);
      return;
    }

    setDraft({
      ...nextDraft,
      timezone: preferredTimezone,
    });
    if (defaultVenue) {
      setDraft((current) => ({
        ...current,
        venueId: defaultVenue.id,
        venue: defaultVenue.name,
      }));
    }
    setStep(2);
  };

  const toggleModule = (module: EventBlueprint["enabledModules"][number]) => {
    if (blueprint.requiredModules.includes(module) || blueprint.futureModules.includes(module)) {
      return;
    }

    updateDraft((current) => ({
      ...current,
      enabledModules: current.enabledModules.includes(module)
        ? current.enabledModules.filter((item) => item !== module)
        : [...current.enabledModules, module],
    }));
  };

  const toggleAdmissionMethod = (method: EventDraft["admissionMethods"][number]) => {
    updateDraft((current) => ({
      ...current,
      admissionMethods: current.admissionMethods.includes(method)
        ? current.admissionMethods.filter((item) => item !== method)
        : [...current.admissionMethods, method],
    }));
  };

  const toggleResourceType = (resourceType: EventDraft["resourceTypes"][number]) => {
    updateDraft((current) => ({
      ...current,
      resourceTypes: current.resourceTypes.includes(resourceType)
        ? current.resourceTypes.filter((item) => item !== resourceType)
        : [...current.resourceTypes, resourceType],
    }));
  };

  const submitEvent = async () => {
    const nextEvent = buildEventFromDraft({
      organizationId,
      blueprint,
      draft,
      status: "published",
    });

    try {
      const createdEvent = await onCreate(nextEvent);

      if (!createdEvent) {
        return;
      }

      showToast({
        title: "Evento creado",
        description: `${nextEvent.name} quedó disponible en la biblioteca de eventos.`,
        tone: "success",
      });
      onClose();
    } catch (error) {
      showToast({
        title: "No pudimos crear el evento",
        description: error instanceof Error ? error.message : "Revisá la conexión con Supabase.",
        tone: "error",
      });
    }
  };

  const nextStep = () => setStep((current) => Math.min(current + 1, 6));
  const previousStep = () => setStep((current) => Math.max(current - 1, 1));

  const selectedModules = getEnabledModules(previewEvent);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[min(92vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#08111f] shadow-[0_40px_140px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Asistente de eventos</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Crear evento desde una plantilla
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              La plataforma sigue funcionando igual, pero ahora podemos crear eventos con configuraciones diferentes para validar la nueva arquitectura conceptual.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            aria-label="Cerrar wizard"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
            <WizardStepper step={step} />

            {step === 1 ? (
              <section className="mt-6 space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Paso 1</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Selecciona el tipo de evento</h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                    {eventBlueprints.length} formatos
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {eventBlueprints.map((item) => {
                    const isSelected = blueprint.eventType === item.eventType;

                    return (
                      <button
                        key={item.eventType}
                        type="button"
                        onClick={() => selectBlueprint(item)}
                        className={`group rounded-[1.5rem] border p-4 text-left transition ${
                          isSelected
                            ? "border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]"
                            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClasses[item.tone]}`}>
                            <span className="text-sm font-semibold uppercase tracking-[0.24em] text-white">
                              {item.icon.slice(0, 2)}
                            </span>
                          </div>
                          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-300">
                            {getEventTypeLabel(item.eventType)}
                          </span>
                        </div>

                        <h4 className="mt-4 text-lg font-semibold text-white">{item.label}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section className="mt-6 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Paso 2</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Información general</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field
                    label="Nombre del evento"
                    value={draft.name}
                    onChange={(value) => updateDraft((current) => ({ ...current, name: value }))}
                  />
                  {venueOptions.length ? (
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">Lugar / ubicación</span>
                      <select
                        value={draft.venueId}
                        onChange={(event) => {
                          const selectedVenue = venueOptions.find((venue) => venue.id === event.target.value);
                          updateDraft((current) => ({
                            ...current,
                            venueId: selectedVenue?.id ?? "",
                            venue: selectedVenue?.name ?? current.venue,
                          }));
                        }}
                        className="h-12 w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
                      >
                        {venueOptions.map((venue) => (
                          <option key={venue.id} value={venue.id}>
                            {venue.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <Field
                      label="Lugar / ubicación"
                      value={draft.venue}
                      onChange={(value) => updateDraft((current) => ({ ...current, venue: value }))}
                    />
                  )}
                  <Field
                    label="Fecha"
                    value={draft.date}
                    onChange={(value) => updateDraft((current) => ({ ...current, date: value }))}
                  />
                  <TimezoneSelect
                    label="Zona horaria"
                    value={draft.timezone}
                    onChange={(value) => updateDraft((current) => ({ ...current, timezone: value }))}
                    preferredTimezone={preferredTimezone}
                    helperText="Se ajusta sola según tu equipo, pero puedes cambiarla si el evento opera en otra franja horaria."
                  />
                  <Field
                    label="Hora inicio"
                    value={draft.startTime}
                    onChange={(value) => updateDraft((current) => ({ ...current, startTime: value }))}
                  />
                  <Field
                    label="Hora fin"
                    value={draft.endTime}
                    onChange={(value) => updateDraft((current) => ({ ...current, endTime: value }))}
                  />
                  <Field
                    label="Capacidad"
                    value={draft.capacity}
                    onChange={(value) => updateDraft((current) => ({ ...current, capacity: value }))}
                    type="number"
                  />
                  <div className="xl:col-span-3">
                    <label className="mb-2 block text-sm font-medium text-slate-300">Descripción opcional</label>
                    <textarea
                      value={draft.description}
                      onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))}
                      className="min-h-32 w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section className="mt-6 space-y-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Paso 3</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Modelo operativo</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    La plantilla limita las opciones para mantener coherencia operativa.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {blueprint.allowedOperationalModels.map((model) => {
                    const selected = draft.operationalModel === model;

                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() => updateDraft((current) => ({ ...current, operationalModel: model }))}
                        className={`rounded-[1.35rem] border p-4 text-left transition ${
                          selected
                            ? "border-cyan-400/50 bg-cyan-400/10"
                            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-white">{getOperationalModelLabel(model)}</span>
                          {selected ? <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Activo</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Espacios sugeridos</p>
                      <p className="mt-2 text-sm text-slate-400">Se muestran como orientación. Solo el tipo personalizado permite editarlos.</p>
                    </div>
                    {blueprint.eventType === "custom" ? (
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">Editable</span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-400">Sugerido</span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(blueprint.eventType === "custom" ? blueprint.resourceTypes : blueprint.resourceTypes).map((resourceType) => {
                      const selected = draft.resourceTypes.includes(resourceType);
                      const disabled = blueprint.eventType !== "custom";

                      return (
                        <button
                          key={resourceType}
                          type="button"
                          onClick={() => {
                            if (!disabled) {
                              toggleResourceType(resourceType);
                            }
                          }}
                          className={`rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] transition ${
                            selected
                              ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                              : "border-white/10 bg-white/[0.03] text-slate-300"
                          } ${disabled ? "cursor-default opacity-90" : "hover:border-white/20 hover:bg-white/[0.06]"}`}
                        >
                          {resourceType}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            {step === 4 ? (
              <section className="mt-6 space-y-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Paso 4</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Módulos</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Los módulos esenciales quedan bloqueados. Los futuros se muestran como próximos y no se pueden seleccionar.
                  </p>
                </div>

                <div className="space-y-4">
                  <ModuleGroup
                    title="Esenciales"
                    description="Siempre activos para mantener la operación estable."
                    items={blueprint.requiredModules.map((module) => ({
                      module,
                      required: true,
                    }))}
                    onToggle={toggleModule}
                    selectedModules={draft.enabledModules}
                    locked
                  />

                  <ModuleGroup
                    title="Opcionales"
                    description="Puedes desactivar estos módulos si el evento no los necesita."
                    items={blueprint.optionalModules.map((module) => ({
                      module,
                      required: false,
                    }))}
                    onToggle={toggleModule}
                    selectedModules={draft.enabledModules}
                  />

                  {blueprint.futureModules.length ? (
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Próximamente</p>
                          <p className="mt-2 text-sm text-slate-400">Estos módulos quedan fuera del alcance de la plantilla actual.</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-400">
                          {blueprint.futureModules.length} módulos
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {blueprint.futureModules.map((module) => (
                          <span
                            key={module}
                            className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] text-slate-500"
                          >
                            {getEventModuleLabel(module)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {step === 5 ? (
              <section className="mt-6 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Paso 5</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Admisión</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Configura cómo se permitirá el ingreso para este tipo de evento.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {blueprint.admissionMethods.map((method) => {
                    const selected = draft.admissionMethods.includes(method);

                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => toggleAdmissionMethod(method)}
                        className={`rounded-[1.25rem] border px-4 py-3 text-left transition ${
                          selected
                            ? "border-cyan-400/50 bg-cyan-400/10"
                            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium uppercase tracking-[0.24em] text-white">{method}</span>
                          {selected ? <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Activo</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {step === 6 ? (
              <section className="mt-6 space-y-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Paso 6</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Review</h3>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Resumen</p>

                    <dl className="mt-4 space-y-3 text-sm">
                      <SummaryRow label="Nombre" value={draft.name} />
                      <SummaryRow label="Tipo" value={getEventTypeLabel(blueprint.eventType)} />
                      <SummaryRow label="Fecha" value={draft.date} />
                      <SummaryRow label="Capacidad" value={draft.capacity || "0"} />
                      <SummaryRow label="Modelo operativo" value={getOperationalModelLabel(draft.operationalModel)} />
                      <SummaryRow label="Módulos incluidos" value={`${draft.enabledModules.length}`} />
                      <SummaryRow label="Admisión" value={draft.admissionMethods.join(" · ")} />
                    </dl>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Preview de navegación</p>

                    <div className="mt-4 space-y-3">
                      {navigationPreview.map((group) => (
                        <div key={group.title} className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{group.title}</p>
                          <div className="space-y-2">
                            {group.items.map((item) => (
                              <div
                                key={`${group.title}-${item.module}`}
                                className={`rounded-2xl border px-3 py-2 ${
                                  item.enabled
                                    ? "border-white/10 bg-white/[0.04]"
                                    : item.future
                                      ? "border-white/5 bg-black/20 opacity-70"
                                      : "border-white/5 bg-black/10 opacity-55"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-white">{item.label}</p>
                                    <p className="text-xs text-slate-400">{item.description}</p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                                    <span>{item.required ? "Esencial" : item.future ? "Próximamente" : "Opcional"}</span>
                                    <span>{item.route ?? "Sin ruta legacy"}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={previousStep}
                disabled={step === 1}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>

              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-[0.28em] text-slate-500">
                  {step} / 6
                </span>

                {step < 6 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                  >
                    Continuar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submitEvent}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                  >
                    Crear evento
                  </button>
                )}
              </div>
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-t border-white/10 bg-black/20 px-5 py-5 xl:border-l xl:border-t-0 sm:px-6">
            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Vista previa del evento</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{previewEvent.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{previewEvent.description}</p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <InfoChip label="Tipo" value={getEventTypeLabel(blueprint.eventType)} />
                  <InfoChip label="Modelo" value={getOperationalModelLabel(draft.operationalModel)} />
                  <InfoChip label="Módulos" value={`${selectedModules.length}`} />
                  <InfoChip label="Capacidad" value={draft.capacity || "0"} />
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Módulos seleccionados</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedModules.map((module) => (
                    <span
                      key={module}
                      className={`rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] ${
                        blueprint.requiredModules.includes(module)
                          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                          : "border-white/10 bg-white/[0.03] text-slate-300"
                      }`}
                    >
                      {getEventModuleLabel(module)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Métodos de admisión</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {draft.admissionMethods.map((method) => (
                    <span key={method} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] text-slate-300">
                      {method}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Recursos</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {draft.resourceTypes.length ? (
                    draft.resourceTypes.map((resourceType) => (
                      <span key={resourceType} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] text-slate-300">
                        {resourceType}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">Sin recursos seleccionados.</span>
                  )}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
                <p className="font-medium">La Rota Carlota permanece intacta.</p>
                <p className="mt-2 leading-6 text-cyan-50/75">
                  Este asistente solo agrega eventos a la biblioteca. No altera Reservas, Invitados, Ingreso, Espacios, Actividad u Operaciones.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function WizardStepper({ step }: { step: number }) {
  const labels = ["Tipo", "General", "Modelo", "Módulos", "Admisión", "Review"];

  return (
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {labels.map((label, index) => {
        const current = index + 1 === step;
        const completed = index + 1 < step;

        return (
          <div
            key={label}
            className={`rounded-2xl border px-3 py-3 text-center ${
              current
                ? "border-cyan-400/40 bg-cyan-400/10"
                : completed
                  ? "border-emerald-400/25 bg-emerald-400/10"
                  : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Paso {index + 1}</p>
            <p className="mt-2 text-sm font-medium text-white">{label}</p>
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
    </label>
  );
}

function ModuleGroup({
  title,
  description,
  items,
  selectedModules,
  onToggle,
  locked = false,
}: {
  title: string;
  description: string;
  items: Array<{ module: EventBlueprint["enabledModules"][number]; required: boolean }>;
  selectedModules: EventBlueprint["enabledModules"];
  onToggle: (module: EventBlueprint["enabledModules"][number]) => void;
  locked?: boolean;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{title}</p>
          <p className="mt-2 text-sm text-slate-400">{description}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map(({ module, required }) => {
          const selected = selectedModules.includes(module);

          return (
            <button
              key={module}
              type="button"
              onClick={() => onToggle(module)}
              disabled={locked}
              className={`rounded-[1.25rem] border px-4 py-3 text-left transition ${
                selected
                  ? "border-cyan-400/50 bg-cyan-400/10"
                  : "border-white/10 bg-black/10 hover:border-white/20 hover:bg-white/[0.04]"
              } ${locked ? "cursor-default" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white">{getEventModuleLabel(module)}</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {required ? "Esencial" : selected ? "Activo" : "Opcional"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[60%] text-right text-white">{value}</dd>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

const toneClasses: Record<EventBlueprint["tone"], string> = {
  cyan: "border-cyan-400/20 bg-cyan-400/10",
  violet: "border-violet-400/20 bg-violet-400/10",
  emerald: "border-emerald-400/20 bg-emerald-400/10",
  amber: "border-amber-400/20 bg-amber-400/10",
  rose: "border-rose-400/20 bg-rose-400/10",
  sky: "border-sky-400/20 bg-sky-400/10",
};
