"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useFeedback } from "@/components/premium-feedback";
import type { AccreditationInvitationDeliveryState } from "../domain/accreditation-invitation-operational";

type SendActionProps = {
  enrollmentId: string;
  latestDeliveryState: AccreditationInvitationDeliveryState;
  canSend: boolean;
  disabledReason?: string;
};

async function sendAccreditationInvitation(enrollmentId: string) {
  const response = await fetch("/api/accreditation/invitations/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        status?: string;
        trackingPersisted?: boolean;
        warning?: { message?: string };
        error?: { message?: string; code?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || "No se pudo enviar la invitación.");
  }

  return payload;
}

export default function AccreditationSendAction({
  enrollmentId,
  latestDeliveryState,
  canSend,
  disabledReason,
}: SendActionProps) {
  const router = useRouter();
  const { confirm, showToast } = useFeedback();
  const [isSending, setIsSending] = useState(false);

  const isResend = latestDeliveryState !== "never_sent";
  const label = isResend ? "Reenviar invitación" : "Enviar invitación";

  const handleSend = () => {
    if (!canSend || isSending) {
      if (disabledReason) {
        showToast({
          title: "No se puede enviar",
          description: disabledReason,
          tone: "warning",
        });
      }

      return;
    }

    const performSend = () => {
      void (async () => {
        setIsSending(true);

        try {
          const payload = await sendAccreditationInvitation(enrollmentId);

          if (payload?.trackingPersisted === false) {
            showToast({
              title: "WhatsApp aceptó el mensaje",
              description:
                payload.warning?.message || "WhatsApp aceptó el mensaje, pero EntryFlow no pudo guardar el historial de seguimiento.",
              tone: "warning",
            });
          } else {
            showToast({
              title: payload?.status === "accepted" && isResend ? "Invitación reenviada" : "Invitación enviada",
              description: payload?.status === "accepted" ? "WhatsApp aceptó la solicitud de envío." : "La invitación quedó actualizada.",
              tone: "success",
            });
          }

          router.refresh();
        } catch (error) {
          showToast({
            title: "No se pudo enviar la invitación",
            description: error instanceof Error && error.message ? error.message : "Ocurrió un error inesperado.",
            tone: "error",
          });
        } finally {
          setIsSending(false);
        }
      })();
    };

    if (isResend) {
      confirm({
        title: "Reenviar invitación",
        description: "Vas a volver a enviar la misma acreditación sin regenerar el código ni el QR.",
        confirmLabel: "Reenviar invitación",
        cancelLabel: "Cancelar",
        tone: "warning",
        onConfirm: performSend,
      });
      return;
    }

    performSend();
  };

  return (
    <button
      type="button"
      onClick={handleSend}
      disabled={!canSend || isSending}
      className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-50 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSending ? "Enviando..." : label}
    </button>
  );
}
