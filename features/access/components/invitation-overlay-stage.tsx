"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import InvitationOverlayContent from "@/features/access/components/invitation-overlay-content";
import { INVITATION_OVERLAY_CANVAS_SIZE } from "@/features/events/domain/invitation-overlay";
import type { InvitationOverlayElement, InvitationOverlayLayout, InvitationOverlayPreviewContext } from "@/features/events/domain/invitation-overlay";
import { getInvitationOverlayElementLabel } from "@/features/events/domain/invitation-overlay";

type InvitationOverlayStageProps = {
  layout: InvitationOverlayLayout;
  context: InvitationOverlayPreviewContext;
  mode?: "preview" | "editor";
  selectedElementId?: string | null;
  className?: string;
  measureRef?: RefObject<HTMLDivElement | null>;
  onElementPointerDown?: (element: InvitationOverlayElement, event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown?: (element: InvitationOverlayElement, event: ReactPointerEvent<HTMLElement>) => void;
};

function getElementBoxStyle(element: InvitationOverlayElement) {
  if (element.type === "QR") {
    return {
      left: `${element.x}px`,
      top: `${element.y}px`,
      width: `${element.size}px`,
      height: `${element.size}px`,
    };
  }

  return {
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`,
  };
}

export default function InvitationOverlayStage({
  layout,
  context,
  mode = "preview",
  selectedElementId = null,
  className = "",
  measureRef,
  onElementPointerDown,
  onResizePointerDown,
}: InvitationOverlayStageProps) {
  const interactive = mode === "editor";
  const internalRef = useRef<HTMLDivElement | null>(null);
  const outerRef = measureRef ?? internalRef;
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = outerRef.current;

    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setStageSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [outerRef]);

  const scale = useMemo(() => {
    if (!stageSize.width || !stageSize.height) {
      return 1;
    }

    const widthScale = stageSize.width / INVITATION_OVERLAY_CANVAS_SIZE.width;
    const heightScale = stageSize.height / INVITATION_OVERLAY_CANVAS_SIZE.height;

    return Math.min(widthScale, heightScale, 1);
  }, [stageSize.height, stageSize.width]);

  return (
    <div ref={outerRef} className={["absolute inset-0 overflow-hidden", className].join(" ")}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: `${INVITATION_OVERLAY_CANVAS_SIZE.width}px`,
          height: `${INVITATION_OVERLAY_CANVAS_SIZE.height}px`,
          transform: `scale(${scale})`,
        }}
      >
        {layout.elements.map((element) => {
          const isSelected = selectedElementId === element.id;

          return (
            <div
              key={element.id}
              className="absolute"
              style={getElementBoxStyle(element)}
            >
              <InvitationOverlayContent element={element} context={context} />

              {interactive ? (
                <div
                  aria-label={`Editar elemento ${getInvitationOverlayElementLabel(element.type)}`}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => onElementPointerDown?.(element, event as ReactPointerEvent<HTMLElement>)}
                  className={[
                    "group absolute inset-0 cursor-move overflow-hidden rounded-[0.9rem] border text-left outline-none transition",
                    "border-white/20 bg-transparent",
                    isSelected ? "ring-2 ring-cyan-300/85 ring-offset-2 ring-offset-slate-950" : "hover:border-white/30",
                  ].join(" ")}
                >
                  <div className="pointer-events-none absolute left-2 top-2 rounded-full border border-white/15 bg-slate-950/75 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
                    {getInvitationOverlayElementLabel(element.type)}
                  </div>

                  <button
                    type="button"
                    aria-label={`Redimensionar elemento ${getInvitationOverlayElementLabel(element.type)}`}
                    className="pointer-events-auto absolute bottom-1.5 right-1.5 h-4 w-4 rounded-md border border-white/30 bg-white/90 shadow-[0_1px_12px_rgba(0,0,0,0.35)] transition hover:bg-white"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onResizePointerDown?.(element, event as ReactPointerEvent<HTMLElement>);
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
