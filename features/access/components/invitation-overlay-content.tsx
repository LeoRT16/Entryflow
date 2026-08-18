"use client";

import AccessQrCode from "@/features/access/components/access-qr-code";
import type {
  InvitationOverlayElement,
  InvitationOverlayPreviewContext,
} from "@/features/events/domain/invitation-overlay";
import { getInvitationOverlayElementContent } from "@/features/events/domain/invitation-overlay";
import { getInvitationFontOption, resolveInvitationFontWeight } from "@/features/events/domain/invitation-fonts";

type InvitationOverlayContentProps = {
  element: InvitationOverlayElement;
  context: InvitationOverlayPreviewContext;
};

function alignmentClasses(textAlign: "left" | "center" | "right") {
  if (textAlign === "left") {
    return "items-start text-left";
  }

  if (textAlign === "right") {
    return "items-end text-right";
  }

  return "items-center text-center";
}

export default function InvitationOverlayContent({ element, context }: InvitationOverlayContentProps) {
  const content = getInvitationOverlayElementContent(
    element.type,
    context,
    element.type === "QR" ? undefined : element.template,
  );

  if (element.type === "QR") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <AccessQrCode value={context.qrToken} size={element.size} />
      </div>
    );
  }

  const alignClassName = alignmentClasses(element.textAlign);
  const isGuest = element.type === "GUEST";
  const isNotice = element.type === "NOTICE";
  const primaryFontSize = element.fontSize;
  const secondaryFontSize = Math.max(14, Math.round(element.fontSize * (isNotice ? 0.78 : 0.74)));
  const gapClassName = isGuest ? "gap-0" : "gap-2";
  const fontOption = getInvitationFontOption(element.fontFamily);
  const resolvedFontWeight = resolveInvitationFontWeight(element.fontFamily, element.fontWeight);

  return (
    <div className={["flex h-full w-full", alignClassName].join(" ")}>
      <div
        className={["flex h-full w-full flex-col", alignClassName, gapClassName, "drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"].join(" ")}
        style={{
          color: element.textColor,
          fontFamily: fontOption.cssFamily,
          fontSize: `${primaryFontSize}px`,
          fontWeight: resolvedFontWeight,
          lineHeight: 1.05,
          letterSpacing: isGuest ? "-0.02em" : "-0.01em",
          width: "100%",
          textAlign: element.textAlign,
        }}
      >
        {content.lines.map((line, index) => (
          <p
            key={`${element.id}-${index}`}
            className="whitespace-normal"
            style={
              index === 0
                ? undefined
                : {
                    fontSize: `${secondaryFontSize}px`,
                    fontWeight: isNotice ? 500 : 400,
                    lineHeight: 1.14,
                    letterSpacing: "0",
                    opacity: 0.96,
                  }
            }
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
