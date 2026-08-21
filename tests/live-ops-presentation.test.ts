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

test("check-in flow prioritizes scanner usage before manual lookup", () => {
  const flowSource = readFileSync(new URL("../features/check-in/components/check-in-flow.tsx", import.meta.url), "utf8");
  const scannerSource = readFileSync(new URL("../features/check-in/components/qr-camera-scanner.tsx", import.meta.url), "utf8");

  assert.match(flowSource, /QrCameraScanner eventName={currentEvent\.name} onDetected={handleDetected} \/>/);
  assert.match(flowSource, /Búsqueda manual/);
  assert.match(scannerSource, /Activar cámara/);
  assert.match(scannerSource, /Detener cámara/);
  assert.match(scannerSource, /grid gap-2 sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
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
