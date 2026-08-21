import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import InvitationOverlayStage from "../features/access/components/invitation-overlay-stage";
import InvitationOverlayEditor from "../features/events/components/invitation-overlay-editor";
import {
  formatInvitationEventDateLabel,
  getDefaultInvitationOverlayLayout,
  getDefaultInvitationOverlayTextTemplateForElement,
  getEventInvitationOverlayLayout,
  getInvitationOverlayElementContent,
  getInvitationOverlayElementLabel,
  formatInspectableNumber,
  mergeEventInvitationOverlayLayoutMetadata,
  normalizeInvitationOverlayLayout,
  normalizeInvitationOverlayTextColor,
  resolveInvitationTextTemplate,
} from "../features/events/domain/invitation-overlay";
import { INVITATION_FONT_OPTIONS } from "../features/events/domain/invitation-fonts";

test("default invitation overlay layout exposes the four freeform elements", () => {
  const layout = getDefaultInvitationOverlayLayout();

  assert.equal(layout.version, 2);
  assert.equal(layout.mode, "freeform");
  assert.equal(layout.elements.length, 4);
  assert.deepEqual(
    layout.elements.map((element) => element.type),
    ["GUEST", "RESERVATION_CONTEXT", "QR", "NOTICE"],
  );

  for (const element of layout.elements) {
    assert.ok(element.x >= 0);
    assert.ok(element.y >= 0);

    if (element.type === "QR") {
      assert.ok(element.size > 0);
      continue;
    }

    assert.ok(element.width > 0);
    assert.ok(element.height > 0);
    assert.ok(element.fontSize > 0);
    assert.ok(element.fontFamily.length > 0);
    assert.equal(element.textColor, "#FFFFFF");
  }
});

test("legacy overlay metadata normalizes into the freeform layout without crashing", () => {
  const layout = normalizeInvitationOverlayLayout({
    version: 1,
    templateId: "legacy.overlay",
    blocks: [
      { id: "guest", type: "GUEST_IDENTITY", x: 0.1, y: 0.1, width: 0.8, height: 0.08 },
      { id: "reservation", type: "EVENT_CONTEXT", x: 0.1, y: 0.2, width: 0.8, height: 0.1 },
      { id: "qr", type: "ACCESS", x: 0.35, y: 0.4, width: 0.3, height: 0.3 },
      { id: "notice", type: "DISCLAIMER", x: 0.12, y: 0.88, width: 0.76, height: 0.08 },
    ],
  });

  assert.ok(layout);
  assert.equal(layout?.mode, "freeform");
  assert.equal(layout?.elements.length, 4);
  assert.deepEqual(
    layout?.elements.map((element) => element.type),
    ["GUEST", "RESERVATION_CONTEXT", "QR", "NOTICE"],
  );

  const guestElement = layout?.elements[0];
  const contextElement = layout?.elements[1];
  const noticeElement = layout?.elements[3];

  if (guestElement && guestElement.type !== "QR") {
    assert.equal(guestElement.fontFamily, "montserrat");
  }

  if (contextElement && contextElement.type !== "QR") {
    assert.equal(contextElement.fontFamily, "playfair-display");
  }

  if (noticeElement && noticeElement.type !== "QR") {
    assert.equal(noticeElement.textColor, "#FFFFFF");
    assert.equal(noticeElement.template, getDefaultInvitationOverlayTextTemplateForElement("NOTICE"));
  }
});

test("invitation overlay content resolves the canonical template with controlled variables", () => {
  const context = {
    eventName: "Evento E2E",
    guestName: "Leonardo",
    reservationName: "Reserva principal",
    reservationHolderName: "Carlota Rivas",
    reservationCode: "RES-0001",
    venueName: "La Rota",
    date: "12 de agosto de 2026",
    time: "22:00",
    uniqueCode: "RES-0001-01",
    qrToken: "qr_preview",
    artLabel: "Arte",
  };

  assert.deepEqual(getInvitationOverlayElementContent("GUEST", context).lines, ["Leonardo, estás invitado."]);
  assert.deepEqual(getInvitationOverlayElementContent("RESERVATION_CONTEXT", context).lines, [
    "Reserva de Carlota Rivas",
    "12 de agosto de 2026 22:00 · La Rota",
  ]);
  assert.deepEqual(getInvitationOverlayElementContent("NOTICE", context).lines, [
    "Uso único",
    "La captura de pantalla no garantiza el ingreso.",
  ]);
  assert.deepEqual(
    getInvitationOverlayElementContent("RESERVATION_CONTEXT", {
      ...context,
      reservationHolderName: undefined,
    }).lines,
    ["Reserva de", "12 de agosto de 2026 22:00 · La Rota"],
  );
});

test("invitation text templates resolve controlled variables without executing unknown tokens", () => {
  const resolved = resolveInvitationTextTemplate(
    "Hola {{guestName}}\nReserva de {{reservationHolder}}\n{{eventDate}} {{eventTime}} · {{venueName}}\n{{guestName}}\n{{unknownToken}}",
    {
      guestName: "Juan Pérez",
      reservationHolder: "Carlos Mendoza",
      eventDate: "8 de agosto de 2026",
      eventTime: "21:00",
      venueName: "La Rota Carlota",
    },
  );

  assert.equal(
    resolved,
    "Hola Juan Pérez\nReserva de Carlos Mendoza\n8 de agosto de 2026 21:00 · La Rota Carlota\nJuan Pérez\n{{unknownToken}}",
  );
});

test("default invitation templates are canonical for v1", () => {
  const layout = getDefaultInvitationOverlayLayout();
  const textElements = layout.elements.filter((element) => element.type !== "QR");

  assert.deepEqual(
    textElements.map((element) => element.template),
    [
      "{{guestName}}, estás invitado.",
      "Reserva de {{reservationHolder}}\n{{eventDate}} {{eventTime}} · {{venueName}}",
      "Uso único\nLa captura de pantalla no garantiza el ingreso.",
    ],
  );
});

test("overlay stage shares the same content between preview and editor", () => {
  const layout = getDefaultInvitationOverlayLayout();
  const context = {
    eventName: "Evento E2E",
    guestName: "Leonardo",
    reservationName: "Reserva principal",
    reservationHolderName: "Carlota Rivas",
    reservationCode: "RES-0001",
    venueName: "La Rota",
    date: "12 de agosto de 2026",
    time: "22:00",
    uniqueCode: "RES-0001-01",
    qrToken: "qr_preview",
    artLabel: "Arte",
  };

  const markupPreview = renderToStaticMarkup(
    createElement(InvitationOverlayStage, {
      layout,
      context,
      mode: "preview",
    }),
  );
  const markupEditor = renderToStaticMarkup(
    createElement(InvitationOverlayStage, {
      layout,
      context,
      mode: "editor",
      selectedElementId: layout.elements[0]?.id ?? null,
    }),
  );

  assert.ok(markupPreview.includes("Leonardo, estás invitado."));
  assert.ok(markupPreview.includes("Reserva de Carlota Rivas"));
  assert.ok(markupPreview.includes("Uso único"));
  assert.ok(markupEditor.includes("Leonardo, estás invitado."));
  assert.ok(markupEditor.includes("Reserva de Carlota Rivas"));
  assert.ok(markupEditor.includes("Uso único"));
  assert.equal(markupPreview.includes("Editar elemento"), false);
  assert.ok(markupEditor.includes("Editar elemento"));
  assert.ok(markupEditor.includes("Redimensionar elemento"));
  assert.ok(markupEditor.includes(getInvitationOverlayElementLabel("GUEST")));
  assert.ok(markupEditor.includes("--font-invitation-montserrat"));
  assert.ok(markupEditor.includes("color:#FFFFFF"));
});

test("invitation overlay editor sample data is neutral", () => {
  const layout = getDefaultInvitationOverlayLayout();
  const markup = renderToStaticMarkup(
    createElement(InvitationOverlayEditor, {
      eventName: "Evento E2E",
      eventStartAt: "2026-08-18T02:00:00.000Z",
      eventVenue: "La Rota Carlota",
      layout,
      onChange: () => undefined,
    }),
  );

  assert.ok(markup.includes("Juan Pérez"));
  assert.ok(markup.includes("Carlos Mendoza"));
  assert.ok(markup.includes("Variables disponibles"));
  assert.ok(markup.includes("{{guestName}}"));
  assert.ok(markup.includes("Nombre invitado"));
  assert.equal(markup.includes("Llaco Gay"), false);
});

test("invitation overlay label helper keeps the four v1 labels stable", () => {
  assert.equal(getInvitationOverlayElementLabel("GUEST"), "Invitado");
  assert.equal(getInvitationOverlayElementLabel("RESERVATION_CONTEXT"), "Reserva y evento");
  assert.equal(getInvitationOverlayElementLabel("QR"), "QR");
  assert.equal(getInvitationOverlayElementLabel("NOTICE"), "Aviso");
});

test("invitation overlay date formatter keeps the local label readable", () => {
  assert.equal(formatInvitationEventDateLabel("2026-08-18T02:15:00.000Z", "America/La_Paz").length > 0, true);
  assert.equal(formatInvitationEventDateLabel("not-a-date"), "not-a-date");
});

test("overlay text color normalizes to canonical hex", () => {
  assert.equal(normalizeInvitationOverlayTextColor("#fff"), "#FFFFFF");
  assert.equal(normalizeInvitationOverlayTextColor("  #8a2be2  "), "#8A2BE2");
  assert.equal(normalizeInvitationOverlayTextColor("invalid"), "#FFFFFF");
});

test("inspectable numbers stay human readable without corrupting the stored value", () => {
  assert.equal(formatInspectableNumber(119.0035535117), "119");
  assert.equal(formatInspectableNumber(767.4), "767.4");
  assert.equal(formatInspectableNumber(880), "880");
});

test("font registry stays controlled and complete", () => {
  assert.equal(INVITATION_FONT_OPTIONS.length, 8);
  assert.deepEqual(
    INVITATION_FONT_OPTIONS.map((option) => option.label),
    [
      "Inter",
      "Montserrat",
      "Playfair Display",
      "Bebas Neue",
      "Oswald",
      "Anton",
      "Cormorant Garamond",
      "Archivo Narrow",
    ],
  );
});

test("overlay metadata merge keeps canonical payloads round-trippable", () => {
  const layout = getDefaultInvitationOverlayLayout();
  const metadata = mergeEventInvitationOverlayLayoutMetadata({ other: "value" }, layout);

  assert.deepEqual(metadata, {
    other: "value",
    invitationOverlayLayout: layout,
  });

  assert.deepEqual(getEventInvitationOverlayLayout({ metadata }), layout);
  assert.deepEqual(mergeEventInvitationOverlayLayoutMetadata(metadata, null), {
    other: "value",
  });
});
