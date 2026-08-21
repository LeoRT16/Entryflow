"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import InvitationOverlayStage from "@/features/access/components/invitation-overlay-stage";
import type {
  InvitationOverlayElement,
  InvitationOverlayLayout,
  InvitationOverlayPreviewContext,
  InvitationOverlayTextElement,
} from "@/features/events/domain/invitation-overlay";
import {
  formatInvitationEventDateLabel,
  getDefaultInvitationOverlayLayout,
  getInvitationOverlayElementLabel,
  getInvitationOverlayTextElementMinimumHeight,
  getInvitationOverlayTextElementMinimumWidth,
  INVITATION_OVERLAY_CANVAS_SIZE,
  INVITATION_OVERLAY_TEXT_TEMPLATE_VARIABLES,
  formatInspectableNumber,
  isValidInvitationOverlayTextColor,
  normalizeInvitationOverlayTextColor,
} from "@/features/events/domain/invitation-overlay";
import { formatTimelineDisplayTime } from "@/features/timeline/domain/timeline-domain";
import { INVITATION_FONT_OPTIONS } from "@/features/events/domain/invitation-fonts";

type InvitationOverlayEditorProps = {
  eventName: string;
  eventStartAt: string;
  eventVenue: string;
  eventTimezone?: string;
  artworkUrl?: string;
  layout: InvitationOverlayLayout;
  onChange: (layout: InvitationOverlayLayout) => void;
};

type InteractionMode = "move" | "resize";

type InteractionState = {
  elementId: string;
  mode: InteractionMode;
  pointerId: number;
  startX: number;
  startY: number;
  startElement: InvitationOverlayElement;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isTextElement(element: InvitationOverlayElement): element is InvitationOverlayTextElement {
  return element.type !== "QR";
}

function formatPointerToLogicalDelta(rect: DOMRect, deltaX: number, deltaY: number) {
  const widthScale = rect.width / INVITATION_OVERLAY_CANVAS_SIZE.width;
  const heightScale = rect.height / INVITATION_OVERLAY_CANVAS_SIZE.height;
  const scale = Math.max(Math.min(widthScale, heightScale), 0.0001);

  return {
    dx: deltaX / scale,
    dy: deltaY / scale,
  };
}

function updateLayoutElement(
  layout: InvitationOverlayLayout,
  elementId: string,
  updater: (element: InvitationOverlayElement) => InvitationOverlayElement,
) {
  return {
    ...layout,
    elements: layout.elements.map((element) => (element.id === elementId ? updater(element) : element)),
    updatedAt: new Date().toISOString(),
  };
}

export default function InvitationOverlayEditor({
  eventName,
  eventStartAt,
  eventVenue,
  eventTimezone,
  artworkUrl,
  layout,
  onChange,
}: InvitationOverlayEditorProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const templateTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const [selectedElementId, setSelectedElementId] = useState(layout.elements[0]?.id ?? null);
  const effectiveSelectedElementId = layout.elements.some((element) => element.id === selectedElementId)
    ? selectedElementId
    : layout.elements[0]?.id ?? null;

  const eventDateLabel = useMemo(() => formatInvitationEventDateLabel(eventStartAt, eventTimezone), [eventStartAt, eventTimezone]);
  const eventTimeLabel = useMemo(() => formatTimelineDisplayTime(eventStartAt), [eventStartAt]);
  const previewContext: InvitationOverlayPreviewContext = useMemo(
    () => ({
      eventName,
      guestName: "Juan Pérez",
      reservationName: "Mesa 7 · Freeform",
      reservationHolderName: "Carlos Mendoza",
      reservationCode: "RES-0001",
      venueName: eventVenue || undefined,
      date: eventDateLabel,
      time: eventTimeLabel,
      uniqueCode: "RES-0001-01",
      qrToken: "qr_preview_token",
      artLabel: "Arte de ejemplo",
    }),
    [eventDateLabel, eventName, eventTimeLabel, eventVenue],
  );

  const selectedElement = layout.elements.find((element) => element.id === effectiveSelectedElementId) ?? null;
  const selectedTextElement = selectedElement && isTextElement(selectedElement) ? selectedElement : null;

  const insertTemplateVariable = (variableKey: (typeof INVITATION_OVERLAY_TEXT_TEMPLATE_VARIABLES)[number]["key"]) => {
    if (!selectedTextElement) {
      return;
    }

    const insertion = `{{${variableKey}}}`;
    const textarea = templateTextareaRef.current;
    const currentTemplate = selectedTextElement.template ?? "";

    if (!textarea) {
      updateSelectedTextElement((candidate) => ({
        ...candidate,
        template: `${currentTemplate}${currentTemplate && !currentTemplate.endsWith("\n") ? " " : ""}${insertion}`,
      }));
      return;
    }

    const start = textarea.selectionStart ?? currentTemplate.length;
    const end = textarea.selectionEnd ?? currentTemplate.length;
    const nextTemplate = `${currentTemplate.slice(0, start)}${insertion}${currentTemplate.slice(end)}`;
    const nextCursor = start + insertion.length;

    updateSelectedTextElement((candidate) => ({
      ...candidate,
      template: nextTemplate,
    }));

    window.requestAnimationFrame(() => {
      templateTextareaRef.current?.focus();
      templateTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;

      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }

      const stage = stageRef.current;

      if (!stage) {
        return;
      }

      const rect = stage.getBoundingClientRect();

      if (!rect.width || !rect.height) {
        return;
      }

      const { dx, dy } = formatPointerToLogicalDelta(rect, event.clientX - interaction.startX, event.clientY - interaction.startY);

      const nextLayout = updateLayoutElement(layout, interaction.elementId, (candidate) => {
        if (interaction.mode === "move") {
          if (candidate.type === "QR") {
            const maxX = Math.max(0, INVITATION_OVERLAY_CANVAS_SIZE.width - candidate.size);
            const maxY = Math.max(0, INVITATION_OVERLAY_CANVAS_SIZE.height - candidate.size);

            return {
              ...candidate,
              x: clamp((interaction.startElement as InvitationOverlayElement & { x: number }).x + dx, 0, maxX),
              y: clamp((interaction.startElement as InvitationOverlayElement & { y: number }).y + dy, 0, maxY),
            };
          }

          const startElement = interaction.startElement as InvitationOverlayTextElement;
          const maxX = Math.max(0, INVITATION_OVERLAY_CANVAS_SIZE.width - startElement.width);
          const maxY = Math.max(0, INVITATION_OVERLAY_CANVAS_SIZE.height - startElement.height);

          return {
            ...candidate,
            x: clamp(startElement.x + dx, 0, maxX),
            y: clamp(startElement.y + dy, 0, maxY),
          };
        }

        if (candidate.type === "QR") {
          const startSize = interaction.startElement.type === "QR" ? interaction.startElement.size : 0;
          const nextSize = clamp(
            Math.round(startSize + Math.max(dx, dy)),
            180,
            Math.min(
              INVITATION_OVERLAY_CANVAS_SIZE.width - candidate.x,
              INVITATION_OVERLAY_CANVAS_SIZE.height - candidate.y,
            ),
          );

          return {
            ...candidate,
            size: nextSize,
          };
        }

        const startElement = interaction.startElement as InvitationOverlayTextElement;
        const minWidth = getInvitationOverlayTextElementMinimumWidth(startElement.type);
        const nextWidth = clamp(
          Math.round(startElement.width + dx),
          minWidth,
          INVITATION_OVERLAY_CANVAS_SIZE.width - startElement.x,
        );

        return {
          ...candidate,
          width: nextWidth,
        };
      });

      onChange(nextLayout);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const interaction = interactionRef.current;

      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }

      interactionRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [layout, onChange]);

  const beginInteraction = (element: InvitationOverlayElement, mode: InteractionMode, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    setSelectedElementId(element.id);
    interactionRef.current = {
      elementId: element.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startElement: element,
    };
  };

  const handleResetLayout = () => {
    const defaultLayout = getDefaultInvitationOverlayLayout();
    setSelectedElementId(defaultLayout.elements[0]?.id ?? null);
    onChange({
      ...defaultLayout,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateSelectedTextElement = (updater: (element: InvitationOverlayTextElement) => InvitationOverlayTextElement) => {
    if (!selectedElement || !isTextElement(selectedElement)) {
      return;
    }

    onChange(updateLayoutElement(layout, selectedElement.id, (candidate) => updater(candidate as InvitationOverlayTextElement)));
  };

  const updateSelectedQrElement = (updater: (element: Extract<InvitationOverlayElement, { type: "QR" }>) => Extract<InvitationOverlayElement, { type: "QR" }>) => {
    if (!selectedElement || selectedElement.type !== "QR") {
      return;
    }

    onChange(updateLayoutElement(layout, selectedElement.id, (candidate) => updater(candidate as Extract<InvitationOverlayElement, { type: "QR" }>)));
  };

  return (
    <section className="flex max-h-full flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/55">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/85 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Ajustar datos</p>
            <p className="mt-1 text-xs text-slate-400">Inspector compacto para layout libre.</p>
          </div>

          <button
            type="button"
            onClick={handleResetLayout}
            className="inline-flex h-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            Restablecer layout
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_392px] xl:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div className="min-w-0">
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/10">
              {artworkUrl ? (
                <img src={artworkUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
              ) : null}

              <InvitationOverlayStage
                measureRef={stageRef}
                layout={layout}
                context={previewContext}
                mode="editor"
                selectedElementId={selectedElementId}
                onElementPointerDown={(element, event) => beginInteraction(element, "move", event)}
                onResizePointerDown={(element, event) => beginInteraction(element, "resize", event)}
              />
            </div>
          </div>

          <aside className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Inspector</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {layout.elements.map((element) => (
                <button
                  key={element.id}
                  type="button"
                  onClick={() => setSelectedElementId(element.id)}
                  className={[
                    "min-h-11 rounded-2xl border px-3 py-2 text-[12px] font-medium leading-tight transition",
                    effectiveSelectedElementId === element.id
                      ? "border-cyan-400/30 bg-cyan-400/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  <span className="whitespace-normal break-words text-center">{getInvitationOverlayElementLabel(element.type)}</span>
                </button>
              ))}
            </div>

            {selectedElement ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-[1.25rem] border border-white/10 bg-black/15 p-3">
                  {selectedElement.type === "QR" ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <CompactNumberField
                        label="X"
                        value={selectedElement.x}
                        onChange={(value) => updateSelectedQrElement((candidate) => ({ ...candidate, x: value }))}
                      />
                      <CompactNumberField
                        label="Y"
                        value={selectedElement.y}
                        onChange={(value) => updateSelectedQrElement((candidate) => ({ ...candidate, y: value }))}
                      />
                      <CompactNumberField
                        label="Tamaño"
                        value={selectedElement.size}
                        onChange={(value) => updateSelectedQrElement((candidate) => ({ ...candidate, size: value }))}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <CompactNumberField
                          label="X"
                          value={selectedElement.x}
                          onChange={(value) => updateSelectedTextElement((candidate) => ({ ...candidate, x: value }))}
                        />
                        <CompactNumberField
                          label="Y"
                          value={selectedElement.y}
                          onChange={(value) => updateSelectedTextElement((candidate) => ({ ...candidate, y: value }))}
                        />
                        <CompactNumberField
                          label="Ancho"
                          value={selectedElement.width}
                          onChange={(value) => updateSelectedTextElement((candidate) => ({ ...candidate, width: value }))}
                        />
                      </div>

                      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(8rem,10rem)]">
                        <FontFamilyPicker
                          value={selectedElement.fontFamily}
                          onChange={(value) => updateSelectedTextElement((candidate) => ({ ...candidate, fontFamily: value }))}
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <CompactNumberField
                            label="Tamaño"
                            value={selectedElement.fontSize}
                            onChange={(value) =>
                              updateSelectedTextElement((candidate) => ({
                                ...candidate,
                                fontSize: value,
                                height: getInvitationOverlayTextElementMinimumHeight(candidate.type, value),
                              }))
                            }
                          />
                          <SelectField
                            label="Peso"
                            value={selectedElement.fontWeight}
                            options={[
                              { label: "Regular", value: 400 },
                              { label: "Medium", value: 500 },
                              { label: "Bold", value: 700 },
                            ]}
                            onChange={(value) => updateSelectedTextElement((candidate) => ({ ...candidate, fontWeight: value }))}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
                        <ColorField
                          key={selectedElement.id}
                          label="Color"
                          value={selectedElement.textColor}
                          onChange={(value) => updateSelectedTextElement((candidate) => ({ ...candidate, textColor: value }))}
                        />
                        <SelectField
                          label="Alineación"
                          value={selectedElement.textAlign}
                          options={[
                            { label: "Left", value: "left" },
                            { label: "Center", value: "center" },
                            { label: "Right", value: "right" },
                          ]}
                          onChange={(value) => updateSelectedTextElement((candidate) => ({ ...candidate, textAlign: value }))}
                        />
                      </div>

                      <div className="space-y-3 rounded-[1.25rem] border border-white/10 bg-black/15 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Contenido</span>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-600">Plantilla dinámica</span>
                        </div>

                        <textarea
                          ref={templateTextareaRef}
                          value={selectedElement.template}
                          onChange={(event) =>
                            updateSelectedTextElement((candidate) => ({
                              ...candidate,
                              template: event.target.value,
                            }))
                          }
                          rows={4}
                          className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                          placeholder="{{guestName}}, estás invitado."
                        />

                        <div className="flex flex-wrap gap-2">
                          {INVITATION_OVERLAY_TEXT_TEMPLATE_VARIABLES.map((variable) => (
                            <button
                              key={variable.key}
                              type="button"
                              onClick={() => insertTemplateVariable(variable.key)}
                              className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-[11px] font-medium text-slate-200 transition hover:bg-white/[0.08]"
                            >
                              {variable.label}
                            </button>
                          ))}
                        </div>

                        <div className="rounded-[1rem] border border-white/10 bg-slate-950/35 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Variables disponibles</p>
                            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-600">Tokens canónicos</p>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {INVITATION_OVERLAY_TEXT_TEMPLATE_VARIABLES.map((variable) => (
                              <div key={variable.key} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                                <p className="font-mono text-[11px] text-cyan-100">{`{{${variable.key}}}`}</p>
                                <p className="mt-1 text-sm font-medium text-white">{variable.label}</p>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 text-xs leading-5 text-slate-400">
                            Estas variables se resuelven en runtime y mantienen el texto alineado con el evento y la reserva.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-400">Selecciona un elemento para editarlo.</p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function CompactNumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={formatInspectableNumber(value)}
        onChange={(event) => onChange(Number.parseFloat(event.target.value) || 0)}
        className="mt-1.5 h-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
      />
    </label>
  );
}

function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
  }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <select
        value={String(value)}
        onChange={(event) => {
          const next = options.find((option) => String(option.value) === event.target.value)?.value;

          if (typeof next !== "undefined") {
            onChange(next);
          }
        }}
        className="mt-1.5 h-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FontFamilyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const currentFont = INVITATION_FONT_OPTIONS.find((option) => option.id === value) ?? INVITATION_FONT_OPTIONS[0];
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [floatingStyle, setFloatingStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePlacement = () => {
      const button = buttonRef.current;

      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const viewportPadding = 12;
      const width = clamp(Math.max(rect.width, 384), 384, Math.min(420, window.innerWidth - viewportPadding * 2));
      const left = clamp(rect.left, viewportPadding, window.innerWidth - width - viewportPadding);
      const preferredTop = rect.bottom + 12;
      const estimatedHeight = 270;
      const useTop = spaceBelow < estimatedHeight + 12 && spaceAbove > spaceBelow;
      const top = useTop ? Math.max(viewportPadding, rect.top - 12 - estimatedHeight) : preferredTop;
      const maxHeight = Math.min(280, window.innerHeight - viewportPadding * 2);

      setFloatingStyle({
        left,
        top,
        width,
        maxHeight,
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && (buttonRef.current?.contains(target) || popoverRef.current?.contains(target))) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <div className="relative min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Fuente</span>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-font-picker-trigger="true"
        onClick={() => setIsOpen((current) => !current)}
        className="mt-1.5 flex h-10 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-left text-sm text-white outline-none transition hover:bg-white/[0.06] focus:border-cyan-400/60 focus:bg-white/[0.06]"
        style={{ fontFamily: currentFont.cssFamily }}
      >
        <span className="min-w-0 flex-1 whitespace-nowrap">{currentFont.label}</span>
        <span className="text-xs text-slate-400">▼</span>
      </button>

      {isOpen && floatingStyle && portalTarget
        ? createPortal(
            <div
              ref={popoverRef}
              role="listbox"
              aria-label="Selector de fuente"
              data-font-picker-popover="true"
              className="fixed z-[9999] overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.52)]"
              style={{
                left: `${floatingStyle.left}px`,
                top: `${floatingStyle.top}px`,
                width: `${floatingStyle.width}px`,
                minWidth: "384px",
                maxWidth: "calc(100vw - 24px)",
                maxHeight: `${floatingStyle.maxHeight}px`,
              }}
            >
              <div className="px-3 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Seleccionar fuente
                </p>
              </div>
              <div className="overflow-y-auto p-3" style={{ maxHeight: `${Math.max(176, floatingStyle.maxHeight - 44)}px` }}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INVITATION_FONT_OPTIONS.map((option) => {
                    const isSelected = option.id === currentFont.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(option.id);
                          setIsOpen(false);
                        }}
                        className={[
                          "flex min-h-11 w-full items-center justify-between gap-3 rounded-[1rem] border px-3 py-2.5 text-left text-sm transition",
                          isSelected ? "border-cyan-400/30 bg-cyan-400/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]",
                        ].join(" ")}
                        style={{ fontFamily: option.cssFamily }}
                      >
                        <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalizedValue = normalizeInvitationOverlayTextColor(value);
  const [draft, setDraft] = useState(normalizedValue);

  return (
    <div className="min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <div className="mt-1.5 grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-2">
        <input
          type="color"
          value={normalizedValue}
          onChange={(event) => {
            const next = normalizeInvitationOverlayTextColor(event.target.value);
            setDraft(next);
            onChange(next);
          }}
          className="h-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-1"
        />
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => {
            const next = event.target.value.trim();
            setDraft(next);

            if (isValidInvitationOverlayTextColor(next)) {
              onChange(normalizeInvitationOverlayTextColor(next));
            }
          }}
          onBlur={() => {
            const next = normalizeInvitationOverlayTextColor(draft);
            setDraft(next);
            onChange(next);
          }}
          className="min-w-0 h-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm uppercase tracking-[0.16em] text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
        />
      </div>
    </div>
  );
}
