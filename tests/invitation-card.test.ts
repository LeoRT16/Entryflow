import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import AccessQrCode from "../features/access/components/access-qr-code";
import InvitationCard from "../features/access/components/invitation-card";
import type { InvitationDesign } from "../features/access/domain/access-domain";
import {
  buildInvitationComposition,
  buildInvitationRenderData,
  getInvitationDownloadFilename,
  INVITATION_RENDER_SIZE,
} from "../features/access/domain/invitation-rendering";

function buildInvitation(overrides: Partial<InvitationDesign> = {}): InvitationDesign {
  return {
    id: "invitation-1",
    eventName: "Evento E2E",
    venueName: "Venue E2E",
    guestName: "Invitado Checkin Final",
    reservationName: "E2E checkin final Rivas",
    reservationCode: "RES-59B30752",
    tableName: "Mesa 2",
    zoneName: "Zona A",
    date: "12 de agosto de 2026",
    time: "22:00",
    dressCode: "Elegante oscuro",
    uniqueCode: "RES-59B30752-01",
    qrValue: "qr_1234567890abcdef",
    theme: "EntryFlow Invitation Designer",
    logoLabel: "EV",
    artLabel: "Rivas",
    variant: "general",
    message: "Mensaje operativo",
    ...overrides,
  };
}

type ReactTreeNode = {
  type: unknown;
  props: {
    children?: unknown;
    value?: string;
    [key: string]: unknown;
  };
};

function isElement(node: unknown): node is ReactTreeNode {
  if (!node || typeof node !== "object") {
    return false;
  }

  return "type" in node && "props" in node;
}

function walkTree(node: unknown, visitor: (element: ReactTreeNode) => void) {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkTree(child, visitor);
    }
    return;
  }

  if (!isElement(node)) {
    return;
  }

  visitor(node);
  walkTree(node.props.children, visitor);
}

test("InvitationCard delivers qrToken to the QR component", () => {
  const invitation = buildInvitation();
  const tree: unknown = InvitationCard({ invitation, mode: "preview" });
  let qrElement: ReactTreeNode | null = null;

  walkTree(tree, (element) => {
    if (element.type === AccessQrCode) {
      qrElement = element;
    }
  });

  assert.ok(qrElement, "AccessQrCode should be rendered inside the invitation card");
  const qrProps = (qrElement as { props: { value?: string } }).props;
  assert.equal(qrProps.value, invitation.qrValue);
  assert.equal(qrProps.value, "qr_1234567890abcdef");
  assert.equal(qrProps.value?.includes(invitation.guestName), false);
  assert.equal(qrProps.value?.includes(invitation.reservationCode), false);
});

test("InvitationCard keeps the human code visible and omits qrToken from visible text", () => {
  const invitation = buildInvitation();
  const markup = renderToStaticMarkup(InvitationCard({ invitation, mode: "preview" }));

  assert.ok(markup.includes(invitation.uniqueCode));
  assert.ok(markup.includes("Código de uso único"));
  assert.ok(markup.includes("Escaneá este código una sola vez."));
  assert.ok(markup.includes("La captura de pantalla no garantiza el ingreso."));
  assert.ok(markup.includes(invitation.eventName));
  assert.ok(markup.includes(invitation.guestName));
  assert.equal(markup.includes(invitation.qrValue), false);
});

test("Invitation rendering composition keeps the 1080x1920 contract", () => {
  const invitation = buildInvitation();
  const renderData = buildInvitationRenderData(invitation);
  const composition = buildInvitationComposition(invitation, "download");

  assert.equal(INVITATION_RENDER_SIZE.width, 1080);
  assert.equal(INVITATION_RENDER_SIZE.height, 1920);
  assert.equal(renderData.qrToken, invitation.qrValue);
  assert.equal(renderData.accessTypeLabel, "GENERAL");
  assert.equal(composition.template.width, 1080);
  assert.equal(composition.template.height, 1920);
  assert.equal(composition.template.mode, "download");
  assert.equal(composition.data.uniqueCode, invitation.uniqueCode);
});

test("Invitation download filename is deterministic and sanitized", () => {
  assert.equal(getInvitationDownloadFilename("RES-59B30752-01"), "invitation-res-59b30752-01.png");
  assert.equal(getInvitationDownloadFilename("  RES 59B30752 01  "), "invitation-res-59b30752-01.png");
});
