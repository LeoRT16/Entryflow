"use client";

import { useEffect, useState } from "react";

import Topbar from "@/components/topbar";
import { useFeedback } from "@/components/premium-feedback";

type Tone = "success" | "info" | "warning" | "danger" | "neutral";

type TimelineItem = {
  time: string;
  title: string;
  detail?: string;
};

type ActivityItem = {
  time: string;
  action: string;
  operator: string;
  reason?: string;
};

type InvitationRecord = {
  sequence: string;
  guest: string;
  carnet: string;
  whatsapp: string;
  invitationCode: string;
  deliveryStatus: "Pendiente de envío" | "Enviada" | "Reenviada" | "Fallida";
  deliveryTone: Tone;
  admissionStatus:
    | "Pendiente de ingreso"
    | "Ingresó"
    | "Anulada"
    | "Bloqueada";
  admissionTone: Tone;
  checkInTime?: string;
  lastSendAt: string;
  lastOpenAt?: string;
  resendCount: number;
  timeline: TimelineItem[];
  activities: ActivityItem[];
  pendingAdmission: boolean;
};

const reservation = {
  name: "Mesa Rodríguez",
  event: "Noche Carlota",
  date: "8 de agosto de 2026",
  time: "21:00",
  code: "RC-0084",
  status: "Confirmada",
};

const paymentSummary = {
  status: "Pagado",
  total: "Bs 850",
  registered: 2,
  method: "Transferencia",
  lastPayment: "8 de agosto, 18:42",
};

const reservationTotals = [
  { label: "Total de invitaciones", value: 5, tone: "neutral" as const },
  { label: "Ingresaron", value: 3, tone: "success" as const },
  { label: "Pendientes de ingreso", value: 2, tone: "warning" as const },
  { label: "Anuladas", value: 0, tone: "neutral" as const },
  { label: "Invitaciones enviadas", value: 4, tone: "info" as const },
  { label: "Pendientes de envío", value: 1, tone: "warning" as const },
];

const reservationHistory = [
  { time: "18:30", title: "Reserva creada" },
  { time: "18:42", title: "Pago confirmado" },
  { time: "18:50", title: "Invitaciones generadas" },
  { time: "18:53", title: "Envío masivo realizado" },
  { time: "21:07", title: "Transferencia relevante" },
  { time: "21:18", title: "Cambio de pago" },
];

const eventDetails = [
  { label: "Horario de apertura", value: "20:00" },
  { label: "Hora recomendada de llegada", value: "20:40" },
  { label: "Dress Code", value: "Elegante oscuro" },
  { label: "Edad mínima", value: "21+" },
  { label: "Ubicación", value: "La Rota Carlota, Sopocachi" },
  { label: "Organizador", value: "La Rota Carlota" },
];

const visualStateGuide = [
  { label: "Pendiente de envío", tone: "warning" as const, icon: "clock" as const },
  { label: "Enviada", tone: "info" as const, icon: "send" as const },
  { label: "Vista", tone: "neutral" as const, icon: "eye" as const },
  { label: "Ingresada", tone: "success" as const, icon: "check" as const },
  { label: "Cancelada", tone: "danger" as const, icon: "ban" as const },
  { label: "Bloqueada", tone: "warning" as const, icon: "alert" as const },
];

const invitations: InvitationRecord[] = [
  {
    sequence: "Invitación 1 de 5",
    guest: "Leonardo Rodríguez",
    carnet: "******42",
    whatsapp: "+591 70000001",
    invitationCode: "INV-0084-01",
    deliveryStatus: "Enviada",
    deliveryTone: "info",
    admissionStatus: "Ingresó",
    admissionTone: "success",
    checkInTime: "20:58",
    lastSendAt: "18:53",
    lastOpenAt: "20:11",
    resendCount: 0,
    pendingAdmission: false,
    timeline: [
      { time: "18:30", title: "Reserva creada" },
      { time: "18:35", title: "Datos del invitado registrados" },
      { time: "18:42", title: "Pago confirmado" },
      { time: "18:50", title: "Invitación generada" },
      { time: "18:53", title: "Invitación enviada por WhatsApp" },
      { time: "20:11", title: "Invitación abierta" },
      { time: "20:58", title: "Ingreso registrado", detail: "Puerta principal" },
    ],
    activities: [
      {
        time: "18:35",
        action: "Camila corrigió el nombre del invitado",
        operator: "Camila",
        reason: "Ajuste solicitado por recepción",
      },
      {
        time: "18:53",
        action: "Camila reenvió la invitación",
        operator: "Camila",
      },
      {
        time: "20:58",
        action: "Ingreso registrado por Puerta Principal",
        operator: "Puerta Principal",
      },
    ],
  },
  {
    sequence: "Invitación 2 de 5",
    guest: "Andrea Pérez",
    carnet: "******18",
    whatsapp: "+591 70000002",
    invitationCode: "INV-0084-02",
    deliveryStatus: "Reenviada",
    deliveryTone: "info",
    admissionStatus: "Ingresó",
    admissionTone: "success",
    checkInTime: "21:07",
    lastSendAt: "21:05",
    lastOpenAt: "21:06",
    resendCount: 1,
    pendingAdmission: false,
    timeline: [
      { time: "18:30", title: "Reserva creada" },
      { time: "18:35", title: "Datos del invitado registrados" },
      { time: "18:50", title: "Invitación generada" },
      { time: "18:53", title: "Invitación enviada por WhatsApp" },
      { time: "21:05", title: "Invitación reenviada" },
      { time: "21:07", title: "Ingreso registrado", detail: "Puerta principal" },
    ],
    activities: [
      {
        time: "19:02",
        action: "Mateo actualizó el carnet",
        operator: "Mateo",
        reason: "Corrección de datos",
      },
      {
        time: "21:05",
        action: "Camila reenvió la invitación",
        operator: "Camila",
      },
      {
        time: "21:07",
        action: "Ingreso registrado por Puerta Principal",
        operator: "Puerta Principal",
      },
    ],
  },
  {
    sequence: "Invitación 3 de 5",
    guest: "Carlos Méndez",
    carnet: "******63",
    whatsapp: "+591 70000003",
    invitationCode: "INV-0084-03",
    deliveryStatus: "Enviada",
    deliveryTone: "info",
    admissionStatus: "Pendiente de ingreso",
    admissionTone: "warning",
    lastSendAt: "18:53",
    lastOpenAt: "20:26",
    resendCount: 0,
    pendingAdmission: true,
    timeline: [
      { time: "18:30", title: "Reserva creada" },
      { time: "18:35", title: "Datos del invitado registrados" },
      { time: "18:50", title: "Invitación generada" },
      { time: "18:53", title: "Invitación enviada por WhatsApp" },
      { time: "20:26", title: "Invitación abierta" },
    ],
    activities: [
      {
        time: "18:35",
        action: "Recepción revisó los datos del invitado",
        operator: "Recepción",
        reason: "Validación previa",
      },
      {
        time: "18:50",
        action: "Nueva versión de la invitación generada",
        operator: "Sistema",
      },
    ],
  },
  {
    sequence: "Invitación 4 de 5",
    guest: "Mariana Suárez",
    carnet: "******25",
    whatsapp: "+591 70000004",
    invitationCode: "INV-0084-04",
    deliveryStatus: "Enviada",
    deliveryTone: "info",
    admissionStatus: "Ingresó",
    admissionTone: "success",
    checkInTime: "21:16",
    lastSendAt: "18:53",
    lastOpenAt: "20:48",
    resendCount: 0,
    pendingAdmission: false,
    timeline: [
      { time: "18:30", title: "Reserva creada" },
      { time: "18:35", title: "Datos del invitado registrados" },
      { time: "18:50", title: "Invitación generada" },
      { time: "18:53", title: "Invitación enviada por WhatsApp" },
      { time: "21:16", title: "Ingreso registrado", detail: "Puerta principal" },
    ],
    activities: [
      {
        time: "18:52",
        action: "Supervisor aprobó una transferencia",
        operator: "Supervisor",
        reason: "Cambio de acompañante",
      },
      {
        time: "21:16",
        action: "Ingreso registrado por Puerta Principal",
        operator: "Puerta Principal",
      },
    ],
  },
  {
    sequence: "Invitación 5 de 5",
    guest: "Diego López",
    carnet: "******91",
    whatsapp: "+591 70000005",
    invitationCode: "INV-0084-05",
    deliveryStatus: "Pendiente de envío",
    deliveryTone: "warning",
    admissionStatus: "Pendiente de ingreso",
    admissionTone: "warning",
    lastSendAt: "—",
    lastOpenAt: "—",
    resendCount: 0,
    pendingAdmission: true,
    timeline: [
      { time: "18:30", title: "Reserva creada" },
      { time: "18:35", title: "Datos del invitado registrados" },
      { time: "18:50", title: "Invitación generada" },
    ],
    activities: [
      {
        time: "18:35",
        action: "Mateo actualizó el carnet",
        operator: "Mateo",
        reason: "Normalización del dato",
      },
      {
        time: "18:50",
        action: "Nueva versión de la invitación generada",
        operator: "Sistema",
      },
    ],
  },
];

const primaryActions = [
  "Editar invitado",
  "Reenviar invitación",
  "Transferir invitación",
];

const secondaryActions = ["Regenerar diseño", "Rotar QR", "Anular invitación"];

export default function MockReservationDetailPage() {
  const { showToast, confirm } = useFeedback();
  const [expandedInvitationCode, setExpandedInvitationCode] = useState<string | null>(
    null,
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoaded(true), 180);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isLoaded) {
    return <ReservationDetailSkeleton />;
  }

  return (
    <div className="space-y-6 opacity-100 transition-opacity duration-300">
      <Topbar
        eyebrow="DETALLE DE RESERVA"
        title={reservation.name}
        description="Gestiona las invitaciones, el pago y los ingresos de esta reserva."
      />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <MetaCard label="Reserva" value={reservation.name} />
                <MetaCard label="Evento" value={reservation.event} />
                <MetaCard label="Fecha" value={reservation.date} />
                <MetaCard label="Hora" value={reservation.time} />
                <MetaCard label="Código de reserva" value={reservation.code} />
                <MetaCard label="Estado" value={reservation.status} />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <ActionButton
                  label="Editar reserva"
                  tone="neutral"
                  onClick={() =>
                    showToast({
                      title: "Reserva abierta (modo demo)",
                      description: "La edición solo genera retroalimentación visual.",
                      tone: "info",
                    })
                  }
                />
                <ActionButton
                  label="Reenviar todas las entradas"
                  tone="info"
                  onClick={() =>
                    showToast({
                      title: "Entradas reenviadas (simulación)",
                      description: "Todas las invitaciones se marcaron como reenviadas.",
                      tone: "success",
                    })
                  }
                />
                <ActionButton
                  label="Más acciones"
                  tone="neutral"
                  onClick={() =>
                    showToast({
                      title: "Más acciones",
                      description: "El menú contextual permanece en modo visual.",
                      tone: "info",
                    })
                  }
                />
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Progreso de ingreso
                </p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-white">
                  <AnimatedCount value={3} /> de <AnimatedCount value={5} /> invitados ingresaron
                </p>

                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-[60%] rounded-full bg-emerald-400" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Resumen de pagos
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <StatCard
                    label="Estado"
                    value={paymentSummary.status}
                    tone="success"
                  />
                  <StatCard label="Monto total" value={paymentSummary.total} />
                  <StatCard
                    label="Pagos registrados"
                    value={`${paymentSummary.registered}`}
                  />
                  <StatCard label="Método principal" value={paymentSummary.method} />
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Último pago
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">
                    {paymentSummary.lastPayment}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    showToast({
                      title: "Historial de pagos abierto",
                      description: "La consulta quedó registrada como simulación.",
                      tone: "info",
                    })
                  }
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/15"
                >
                  Ver historial de pagos
                </button>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Resumen operativo
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {reservationTotals.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        <AnimatedCount value={item.value} />
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Invitaciones individuales
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Cada invitación corresponde a una persona y tiene un acceso independiente.
            </h2>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Estados visuales
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {visualStateGuide.map((state) => (
              <StateChip
                key={state.label}
                label={state.label}
                tone={state.tone}
                icon={state.icon}
                pulse={state.label === "Vista"}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {invitations.map((invitation) => {
            const isExpanded = expandedInvitationCode === invitation.invitationCode;

            return (
              <article
                key={invitation.invitationCode}
                className="group rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.14)] transition duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.045] hover:shadow-[0_28px_90px_rgba(0,0,0,0.28)] sm:p-5"
              >
                <div className="grid gap-5">
                  <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/40 p-5 transition-all duration-300 group-hover:border-white/15 group-hover:bg-slate-950/55">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                          {invitation.sequence}
                        </p>
                        <h3 className="truncate text-2xl font-semibold tracking-tight text-white">
                          {invitation.guest}
                        </h3>
                        <p className="text-sm text-slate-400">
                          {reservation.event} · {reservation.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <StatusPill label={invitation.deliveryStatus} tone={invitation.deliveryTone} pulse={invitation.deliveryStatus === "Reenviada"} />
                          <StatusPill label={invitation.admissionStatus} tone={invitation.admissionTone} pulse={invitation.admissionStatus === "Ingresó"} />
                          <StatusPill label={invitation.invitationCode} tone="neutral" />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {primaryActions.map((action) => (
                          <ActionButton
                            key={action}
                            label={action}
                            tone="neutral"
                            onClick={() =>
                              showToast({
                                title: `${action} (modo demo)`,
                                description: "La acción solo cambia la interfaz.",
                                tone: "info",
                              })
                            }
                          />
                        ))}
                        {invitation.pendingAdmission ? (
                          <ActionButton
                            label="Marcar ingreso"
                            tone="success"
                            onClick={() =>
                              showToast({
                                title: "Ingreso marcado (simulación)",
                                description: `${invitation.guest} quedó ingresado de forma visual.`,
                                tone: "success",
                              })
                            }
                          />
                        ) : (
                          <ActionButton
                            label="Ingreso registrado"
                            tone="success"
                            onClick={() =>
                              showToast({
                                title: "Ingreso ya registrado",
                                description: "El estado no cambió, solo se emitió feedback visual.",
                                tone: "info",
                              })
                            }
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedInvitationCode((current) =>
                              current === invitation.invitationCode ? null : invitation.invitationCode,
                            )
                          }
                          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition duration-200 hover:bg-white/[0.07] active:scale-[0.98]"
                          aria-expanded={isExpanded}
                          aria-controls={`detail-${invitation.invitationCode}`}
                        >
                          {isExpanded ? "Ocultar detalles" : "Ver detalles"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    id={`detail-${invitation.invitationCode}`}
                    className={[
                      "grid overflow-hidden transition-all duration-500 ease-out",
                      isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    ].join(" ")}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
                        <div className="space-y-4">
                          <InvitationPreview invitation={invitation} />

                          <div className="grid gap-4 sm:grid-cols-2">
                            <ShareInvitationSection />
                            <DeliverySummaryCard invitation={invitation} />
                          </div>

                          <EventInfoCard />
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/40 p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                  Detalle operativo
                                </p>
                                <h4 className="mt-2 truncate text-xl font-semibold tracking-tight text-white">
                                  {invitation.guest}
                                </h4>
                                <p className="mt-1 text-sm text-slate-400">
                                  {reservation.event} · {reservation.name}
                                </p>
                              </div>
                              <StatusPill
                                label={invitation.admissionStatus}
                                tone={invitation.admissionTone}
                                pulse={invitation.admissionStatus === "Ingresó"}
                              />
                            </div>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                              <InfoRow
                                label="Entrega"
                                value={invitation.deliveryStatus}
                                tone={invitation.deliveryTone}
                              />
                              <InfoRow
                                label="Ingreso"
                                value={invitation.admissionStatus}
                                tone={invitation.admissionTone}
                              />
                              <InfoRow
                                label="Código de invitación"
                                value={invitation.invitationCode}
                              />
                              <InfoRow label="WhatsApp" value={invitation.whatsapp} />
                              <InfoRow label="Carnet" value={invitation.carnet} />
                              {invitation.checkInTime ? (
                                <InfoRow label="Hora de ingreso" value={invitation.checkInTime} />
                              ) : (
                                <InfoRow label="Hora de ingreso" value="Pendiente" tone="warning" />
                              )}
                            </div>
                          </div>

                          <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/40 p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                  Línea de tiempo
                                </p>
                                <p className="mt-1 text-sm text-slate-400">
                                  Secuencia operativa de esta invitación.
                                </p>
                              </div>
                              <StatusPill
                                label={invitation.deliveryStatus}
                                tone={invitation.deliveryTone}
                                pulse={invitation.deliveryStatus === "Reenviada"}
                              />
                            </div>

                            <div className="mt-4 space-y-3">
                              {invitation.timeline.length ? (
                                invitation.timeline.map((event, index) => (
                                  <TimelineRow
                                    key={`${event.time}-${index}`}
                                    event={event}
                                    isVisible={isExpanded}
                                    index={index}
                                  />
                                ))
                              ) : (
                                <EmptyState
                                  icon="clock"
                                  title="No hay línea de tiempo"
                                  description="La actividad de esta invitación aparecerá aquí cuando exista historial operativo."
                                />
                              )}
                            </div>
                          </div>

                          <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                  Actividad del operador
                                </p>
                                <p className="mt-1 text-sm text-slate-400">
                                  Intervenciones humanas registradas sobre esta invitación.
                                </p>
                              </div>
                              <StatusPill
                                label={invitation.pendingAdmission ? "Pendiente de ingreso" : "Ingreso registrado"}
                                tone={invitation.pendingAdmission ? "warning" : "success"}
                                pulse={!invitation.pendingAdmission}
                              />
                            </div>

                            <div className="mt-4 space-y-3">
                              {invitation.activities.length ? (
                                invitation.activities.map((activity, index) => (
                                  <ActivityRow
                                    key={`${activity.time}-${index}`}
                                    activity={activity}
                                    isVisible={isExpanded}
                                    index={index}
                                  />
                                ))
                              ) : (
                                <EmptyState
                                  icon="user"
                                  title="No hay actividad registrada"
                                  description="Las intervenciones del operador se mostrarán aquí cuando existan acciones manuales."
                                />
                              )}
                            </div>
                          </div>

                          <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/40 p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                              Acciones secundarias
                            </p>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <ActionButton
                                label="Ver historial"
                                tone="neutral"
                                onClick={() =>
                                  showToast({
                                    title: "Historial abierto",
                                    description: "La línea de tiempo se mostró en modo lectura.",
                                    tone: "info",
                                  })
                                }
                              />
                              {secondaryActions.map((action) => (
                                <ActionButton
                                  key={action}
                                  label={action}
                                  tone={action === "Anular invitación" ? "danger" : "neutral"}
                                  onClick={() => {
                                    if (action === "Anular invitación") {
                                      confirm({
                                        title: "Anular invitación",
                                        description:
                                          "La invitación se marcará como anulada solo en la interfaz. No se eliminará ningún dato real.",
                                        tone: "danger",
                                        confirmLabel: "Anular invitación",
                                        onConfirm: () =>
                                          showToast({
                                            title: "Invitación anulada (simulación)",
                                            description: `${invitation.guest} quedó marcada como cancelada.`,
                                            tone: "warning",
                                          }),
                                      });
                                      return;
                                    }

                                    showToast({
                                      title: `${action} (modo demo)`,
                                      description: "La acción solo afecta la vista.",
                                      tone: "info",
                                    });
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Historial de la reserva
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Movimientos agregados de la reserva
            </h2>
          </div>
          <p className="text-sm text-slate-400">
            Aquí se conservan únicamente eventos relevantes a nivel de reserva.
          </p>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {reservationHistory.map((item) => (
            <div
              key={`${item.time}-${item.title}`}
              className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                {item.time}
              </p>
              <p className="mt-2 text-sm font-medium text-white">{item.title}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function InvitationPreview({ invitation }: { invitation: InvitationRecord }) {
  const presentation = getInvitationPresentation(invitation);

  return (
    <div
      className={[
        "overflow-hidden rounded-[2rem] border bg-slate-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.35)]",
        presentation.frameClassName,
      ].join(" ")}
    >
      <div className="relative aspect-[9/16] min-h-[640px] w-full">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_30%),radial-gradient(circle_at_85%_18%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_50%_88%,rgba(16,185,129,0.16),transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.1),rgba(2,6,23,0.72))]" />

        <div className="relative flex h-full flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                  LR
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-300">
                    La Rota Carlota
                  </p>
                  <p className="text-[10px] text-slate-400">Logo placeholder</p>
                </div>
              </div>
            </div>

            <StateChip
              label={presentation.label}
              tone={presentation.tone}
              icon={presentation.icon}
            />
          </div>

          <div className="mt-4 flex-1 overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/20 p-4">
            <div
              className="relative flex h-full min-h-[300px] flex-col justify-between overflow-hidden rounded-[1.55rem] border border-white/10 p-4"
              style={{
                background:
                  "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.16), transparent 24%), radial-gradient(circle at 82% 18%, rgba(34,211,238,0.18), transparent 24%), linear-gradient(135deg, rgba(15,23,42,0.95), rgba(10,14,25,0.92))",
              }}
            >
              <div className="absolute inset-0 opacity-70">
                <div className="absolute left-[10%] top-[12%] h-16 w-16 rounded-full border border-white/10" />
                <div className="absolute right-[14%] top-[20%] h-24 w-24 rounded-[2rem] border border-cyan-400/15" />
                <div className="absolute bottom-[16%] left-[12%] h-24 w-24 rounded-[2rem] border border-emerald-400/15" />
                <div className="absolute right-[20%] bottom-[18%] h-12 w-12 rounded-full border border-white/10" />
              </div>

              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-300">
                    Arte oficial
                  </p>
                  <p className="mt-2 max-w-[10rem] text-3xl font-semibold tracking-tight text-white">
                    Noche Carlota
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-300">
                  Vista previa
                </span>
              </div>

              <div className="relative">
                <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-100/80">
                        {reservation.event}
                      </p>
                      <p className="mt-1 text-xl font-semibold tracking-tight text-white">
                        {invitation.guest}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.26em] text-slate-400">
                        {reservation.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">{reservation.date}</p>
                      <p className="text-xs text-slate-300">{reservation.time}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_94px] gap-3">
                    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                        Ubicación
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        La Rota Carlota
                      </p>
                      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Dress Code
                      </p>
                      <p className="mt-1 text-sm font-medium text-white">
                        Elegante oscuro
                      </p>
                    </div>

                    <div className="rounded-[1.25rem] border border-dashed border-white/15 bg-white/[0.03] p-3">
                      <div className="flex h-full flex-col items-center justify-center rounded-[1rem] border border-white/10 bg-slate-950/55 p-3">
                        <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-slate-900/80 p-2">
                          {Array.from({ length: 9 }).map((_, index) => (
                            <span
                              key={index}
                              className={[
                                "h-3 w-3 rounded-[0.18rem]",
                                index % 2 === 0 ? "bg-white/90" : "bg-cyan-400/55",
                              ].join(" ")}
                            />
                          ))}
                        </div>
                        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                          Vista previa
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                        Código de invitación
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {invitation.invitationCode}
                      </p>
                      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100/80">
                        Uso único
                      </p>
                    </div>

                    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                        Entrada personal
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">{invitation.guest}</p>
                      <p className="mt-3 text-xs leading-5 text-slate-400">
                        La captura de pantalla no garantiza el ingreso.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getInvitationPresentation(invitation: InvitationRecord) {
  if (invitation.admissionStatus === "Ingresó") {
    return {
      label: "Ingresada",
      tone: "success" as const,
      icon: "check" as const,
      frameClassName: "border-emerald-400/20",
    };
  }

  if (invitation.deliveryStatus === "Reenviada") {
    return {
      label: "Vista",
      tone: "info" as const,
      icon: "eye" as const,
      frameClassName: "border-cyan-400/20",
    };
  }

  if (invitation.deliveryStatus === "Pendiente de envío") {
    return {
      label: "Pendiente de envío",
      tone: "warning" as const,
      icon: "clock" as const,
      frameClassName: "border-amber-400/20",
    };
  }

  if (invitation.deliveryStatus === "Fallida" || invitation.admissionStatus === "Bloqueada") {
    return {
      label: "Bloqueada",
      tone: "danger" as const,
      icon: "alert" as const,
      frameClassName: "border-red-400/20",
    };
  }

  return {
    label: "Enviada",
    tone: "info" as const,
    icon: "send" as const,
    frameClassName: "border-white/10",
  };
}

function ShareInvitationSection() {
  const { showToast } = useFeedback();

  return (
    <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/40 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        Compartir invitación
      </p>
      <div className="mt-4 grid gap-3">
        <ShareButton
          label="Compartir"
          icon="share"
          tone="info"
          onClick={() =>
            showToast({
              title: "Compartir invitación (simulación)",
              description: "La acción quedó registrada solo en la interfaz.",
              tone: "info",
            })
          }
        />
        <ShareButton
          label="Descargar"
          icon="download"
          tone="neutral"
          onClick={() =>
            showToast({
              title: "Descarga preparada",
              description: "Se mostró una versión visual descargable.",
              tone: "success",
            })
          }
        />
        <ShareButton
          label="Copiar enlace"
          icon="link"
          tone="neutral"
          onClick={() =>
            showToast({
              title: "Enlace copiado (modo demo)",
              description: "El enlace se simuló como copiado al portapapeles.",
              tone: "info",
            })
          }
        />
        <ShareButton
          label="Vista para historias"
          icon="story"
          tone="neutral"
          onClick={() =>
            showToast({
              title: "Vista para historias abierta",
              description: "Se mostró la composición en proporción story.",
              tone: "info",
            })
          }
        />
      </div>
    </div>
  );
}

function DeliverySummaryCard({ invitation }: { invitation: InvitationRecord }) {
  return (
    <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        WhatsApp
      </p>

      <div className="mt-4 space-y-3">
        <DeliveryRow label="Número" value={invitation.whatsapp} />
        <DeliveryRow label="Último envío" value={invitation.lastSendAt} />
        <DeliveryRow
          label="Estado"
          value={invitation.deliveryStatus}
          tone={invitation.deliveryTone}
        />
        <DeliveryRow label="Última apertura" value={invitation.lastOpenAt ?? "—"} />
        <DeliveryRow label="Reenvíos" value={`${invitation.resendCount}`} />
      </div>
    </div>
  );
}

function EventInfoCard() {
  return (
    <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        Información del evento
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {eventDetails.map((field) => (
          <div
            key={field.label}
            className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              {field.label}
            </p>
            <p className="mt-2 text-sm font-medium text-white">{field.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeliveryRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100"
          : tone === "info"
            ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.03] text-white";

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-sm text-slate-400">{label}</p>
      <span
        className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${toneClassName}`}
      >
        {value}
      </span>
    </div>
  );
}

function StateChip({
  label,
  tone,
  icon,
  pulse = false,
}: {
  label: string;
  tone: Tone;
  icon: "clock" | "send" | "eye" | "check" | "ban" | "alert";
  pulse?: boolean;
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100"
          : tone === "info"
            ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.03] text-white";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition duration-300",
        pulse ? "motion-safe:animate-pulse" : "",
        toneClassName,
      ].join(" ")}
    >
      <StateIcon icon={icon} />
      {label}
    </span>
  );
}

function ShareButton({
  label,
  icon,
  tone,
  onClick,
}: {
  label: string;
  icon: "share" | "download" | "link" | "story";
  tone: "info" | "neutral";
  onClick?: () => void;
}) {
  const toneClassName =
    tone === "info"
      ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15"
      : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.07]";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        "inline-flex h-11 items-center justify-start gap-2 rounded-2xl border px-4 text-sm font-medium transition duration-200 hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
        toneClassName,
      ].join(" ")}
    >
      <ShareIcon icon={icon} />
      <span>{label}</span>
    </button>
  );
}

function ShareIcon({ icon }: { icon: "share" | "download" | "link" | "story" }) {
  const common = "h-4 w-4 shrink-0";

  if (icon === "share") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M12 6h3.5A1.5 1.5 0 0 1 17 7.5V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10 11V4m0 0 3 3M10 4 7 7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (icon === "download") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M10 4v8m0 0 3-3m-3 3-3-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 14.5A1.5 1.5 0 0 0 5.5 16h9A1.5 1.5 0 0 0 16 14.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "story") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <rect x="4" y="3.5" width="12" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
      <path
        d="M5.5 10h9m0 0-3.5-3.5M14.5 10 11 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3.5" y="3.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
    </svg>
  );
}

function StateIcon({ icon }: { icon: "clock" | "send" | "eye" | "check" | "ban" | "alert" }) {
  const common = "h-3.5 w-3.5 shrink-0";

  if (icon === "eye") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (icon === "check") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path d="m5.5 10 3 3 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "ban") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "alert") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path d="M10 4.2 17 16H3L10 4.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M10 7.4v4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="13.5" r="0.9" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "send") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path d="M3.5 10 16.5 4.5l-3 11-3.2-4.1-6.8-1.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
      <path d="M10 5v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 18a8 8 0 1 0-5.6-2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100"
          : tone === "info"
            ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.03] text-white";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${toneClassName}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
  pulse = false,
}: {
  label: string;
  tone: Tone;
  pulse?: boolean;
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100"
          : tone === "info"
            ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.03] text-white";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] transition duration-300",
        pulse ? "motion-safe:animate-pulse" : "",
        toneClassName,
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function InfoRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100"
          : tone === "info"
            ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.03] text-white";

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${toneClassName}`}
      >
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  label,
  tone,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  tone: "neutral" | "info" | "success" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15"
      : tone === "info"
        ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15"
        : tone === "danger"
          ? "border-red-400/20 bg-red-400/10 text-red-100 hover:bg-red-400/15"
          : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.07]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      className={[
        "inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-medium shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-0",
        toneClassName,
      ].join(" ")}
    >
      <ActionIcon label={label} />
      <span className={loading ? "animate-pulse" : ""}>{loading ? "Cargando..." : label}</span>
    </button>
  );
}

function TimelineRow({
  event,
  isVisible,
  index,
}: {
  event: TimelineItem;
  isVisible: boolean;
  index: number;
}) {
  return (
    <div
      className={[
        "flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-500",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-80",
      ].join(" ")}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] font-semibold text-slate-200">
        {event.time}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{event.title}</p>
        {event.detail ? (
          <p className="mt-1 text-xs text-slate-400">{event.detail}</p>
        ) : null}
      </div>
    </div>
  );
}

function ActivityRow({
  activity,
  isVisible,
  index,
}: {
  activity: ActivityItem;
  isVisible: boolean;
  index: number;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-white/10 bg-slate-950/40 p-3 transition-all duration-500",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-80",
      ].join(" ")}
      style={{ transitionDelay: `${index * 65}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{activity.action}</p>
          <p className="mt-1 text-xs text-slate-400">{activity.operator}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
          {activity.time}
        </span>
      </div>
      {activity.reason ? (
        <p className="mt-2 text-xs leading-5 text-slate-400">{activity.reason}</p>
      ) : null}
    </div>
  );
}

function AnimatedCount({ value }: { value: number }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let frame = 0;
    const duration = 700;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(value * eased));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return <span>{current}</span>;
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: "clock" | "user" | "spark";
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300">
        <EmptyStateIcon icon={icon} />
      </div>
      <p className="mt-3 text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}

function EmptyStateIcon({ icon }: { icon: "clock" | "user" | "spark" }) {
  const common = "h-4 w-4";

  if (icon === "user") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4 16c1.6-2.4 3.6-3.5 6-3.5s4.4 1.1 6 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "spark") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M10 3l1.7 4.3L16 9l-4.3 1.7L10 15l-1.7-4.3L4 9l4.3-1.7L10 3Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
      <path
        d="M10 4.5v5l3 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 16.5a6.5 6.5 0 1 0-4.6-1.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReservationDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Topbar
        eyebrow="DETALLE DE RESERVA"
        title={reservation.name}
        description="Gestiona las invitaciones, el pago y los ingresos de esta reserva."
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SkeletonCard className="h-[360px]" />
        <SkeletonCard className="h-[360px]" />
      </div>

      <SkeletonCard className="h-10" />

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <InvitationSkeleton key={index} />
        ))}
      </div>

      <SkeletonCard className="h-[160px]" />
    </div>
  );
}

function InvitationSkeleton() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <SkeletonCard className="h-[660px]" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard className="h-[170px]" />
            <SkeletonCard className="h-[170px]" />
          </div>
          <SkeletonCard className="h-[190px]" />
        </div>
        <div className="space-y-4">
          <SkeletonCard className="h-[170px]" />
          <SkeletonCard className="h-[220px]" />
          <SkeletonCard className="h-[220px]" />
          <SkeletonCard className="h-[120px]" />
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ className }: { className: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04]",
        className,
      ].join(" ")}
    >
      <div className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)] motion-safe:animate-[shimmer_1.6s_infinite]" />
    </div>
  );
}

function ActionIcon({ label }: { label: string }) {
  const common = "h-4 w-4 shrink-0";

  if (label.includes("Editar")) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M4 13.5V16h2.5L15.7 6.8a1.4 1.4 0 0 0 0-2L15.2 4a1.4 1.4 0 0 0-2 0L4 13.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (label.includes("Reenviar")) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M3 10h10m0 0-3.5-3.5M13 10 9.5 13.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 5.5h2.2A1.8 1.8 0 0 1 17 7.3v5.4a1.8 1.8 0 0 1-1.8 1.8H13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (label.includes("Transferir")) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M4 6h9.5a2.5 2.5 0 0 1 2.5 2.5V11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="m12.5 8.5 3.5 3.5-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (label.includes("Regenerar")) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M4.5 10a5.5 5.5 0 0 1 9.3-3.9L15 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M15.5 5V8h-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 10a5.5 5.5 0 0 1-9.3 3.9L5 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M4.5 15V12h3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (label.includes("Rotar")) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M16 10a6 6 0 0 1-10.6 3.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M4.5 13.5V10h3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 10a6 6 0 0 1 10.6-3.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M15.5 6.5V10H12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (label.includes("Anular")) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M5 5 15 15M15 5 5 15"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (label.includes("Historial")) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="M10 5v5l3 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10 18a8 8 0 1 0-5.6-2.3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (label.includes("Ingreso")) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={common} aria-hidden="true">
        <path
          d="m5.5 10 3 3 6-6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return null;
}
