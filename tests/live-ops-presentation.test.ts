import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("reservation operations board keeps the primary action ahead of secondary guest actions", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");

  assert.match(source, /Registrar ingreso/);
  assert.match(source, /Más acciones del invitado/);
  assert.match(source, /Editar/);
  assert.match(source, /Cancelar invitado/);
  assert.match(source, /Eliminar/);
  assert.match(source, /Mesa \/ espacio/);
});

test("reservation wizard keeps the payment section compact and coherent", () => {
  const source = readFileSync(new URL("../features/reservations/components/reservation-wizard-modal.tsx", import.meta.url), "utf8");

  assert.match(source, /Estado de pago/);
  assert.match(source, /Historial de pagos simulados/);
  assert.match(source, /LiveSummaryRow label="Monto"/);
  assert.match(source, /xl:grid-cols-2/);
});

test("guest directory keeps invitation actions available without repeating the same context blocks", () => {
  const source = readFileSync(new URL("../features/customers/components/guest-directory.tsx", import.meta.url), "utf8");

  assert.match(source, /Quién es/);
  assert.match(source, /Dónde pertenece/);
  assert.match(source, /Visualizar invitación/);
  assert.match(source, /Enviar por WhatsApp/);
  assert.match(source, /WhatsApp/);
});

test("guest directory keeps the individual invitation export path on the local DOM ref", () => {
  const source = readFileSync(new URL("../features/customers/components/guest-directory.tsx", import.meta.url), "utf8");

  assert.match(source, /exportInvitationRef/);
  assert.match(source, /waitForInvitationImageNodeReady/);
  assert.match(source, /renderInvitationImageBlob/);
  assert.match(source, /prepareWhatsAppInvitationMediaBlob/);
  assert.doesNotMatch(source, /renderReservationWhatsAppInvitationMedia/);
});

test("reservation bulk invitation export is driven by the reservation board hidden ref and not a temporary root", () => {
  const boardSource = readFileSync(new URL("../features/reservations/components/reservation-operations-board.tsx", import.meta.url), "utf8");
  const source = readFileSync(new URL("../features/access/domain/whatsapp-reservation-invitation-media.tsx", import.meta.url), "utf8");

  assert.match(boardSource, /bulkExportInvitationRef/);
  assert.match(boardSource, /data-export-guest-id/);
  assert.match(boardSource, /data-export-access-code/);
  assert.match(boardSource, /InvitationCard invitation=\{bulkExportCandidate\.invitation\} mode="download"/);
  assert.match(boardSource, /waitForBulkExportCandidate/);
  assert.match(source, /invitationNode/);
  assert.match(source, /waitForInvitationImageNodeReady/);
  assert.match(source, /renderInvitationImageBlob/);
  assert.match(source, /prepareWhatsAppInvitationMediaBlob/);
  assert.doesNotMatch(source, /createRoot/);
  assert.doesNotMatch(source, /flushSync/);
  assert.doesNotMatch(source, /document\.body\.appendChild/);
});

test("check-in flow prioritizes scanner usage before manual lookup", () => {
  const flowSource = readFileSync(new URL("../features/check-in/components/check-in-flow.tsx", import.meta.url), "utf8");
  const scannerSource = readFileSync(new URL("../features/check-in/components/qr-camera-scanner.tsx", import.meta.url), "utf8");
  const timelineSource = readFileSync(new URL("../features/timeline/components/timeline-feed.tsx", import.meta.url), "utf8");
  const handleDetectedStart = flowSource.indexOf("const handleDetected = (value: string) => {");
  const handleSelectGuestStart = flowSource.indexOf("const handleSelectGuest = (guest: Guest) => {");
  const handleDetectedBlock = handleDetectedStart >= 0 && handleSelectGuestStart > handleDetectedStart
    ? flowSource.slice(handleDetectedStart, handleSelectGuestStart)
    : "";

  assert.match(flowSource, /QrCameraScanner eventName={currentEvent\.name} onDetected={handleDetected} \/>/);
  assert.match(flowSource, /Búsqueda manual/);
  assert.match(handleDetectedBlock, /shouldAutoSubmitDetectedCheckIn/);
  assert.doesNotMatch(handleDetectedBlock, /setAttemptState\(\{ kind: "idle" \}\);/);
  assert.match(flowSource, /onClick=\{resetAttempt\}/);
  assert.match(scannerSource, /Activar cámara/);
  assert.match(scannerSource, /Detener cámara/);
  assert.match(scannerSource, /grid gap-2 sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(scannerSource, /createQrDetectionGate/);
  assert.match(scannerSource, /detectionGateRef\.current\.reset\(\);/);
  assert.match(scannerSource, /if \(rawValue && detectionGateRef\.current\.shouldAccept\(rawValue\)\)/);
  assert.doesNotMatch(timelineSource, /event\.actor \? <StatusBadge variant="info">\{event\.actor\}<\/StatusBadge> : null;/);
  assert.doesNotMatch(timelineSource, /event\.reservationCode \? <StatusBadge variant="info">\{event\.reservationCode\}<\/StatusBadge> : null;/);
});

test("timeline feed keeps the audit-trail hierarchy compact", () => {
  const source = readFileSync(new URL("../features/timeline/components/timeline-feed.tsx", import.meta.url), "utf8");

  assert.match(source, /Cronología operativa/);
  assert.match(source, /Operativo/);
  assert.match(source, /Crítico/);
  assert.match(source, /Informativo/);
  assert.match(source, /Sistema/);
  assert.match(source, /p-3\.5/);
});
