import { NextResponse } from "next/server";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";
import { authorizeFinalReportEvent } from "@/lib/reporting/final-report-authorization";
import { finalReportFailure, logFinalReportFailure, type FinalReportFailure } from "@/lib/reporting/final-report-diagnostics";
import { loadWorkspaceBootstrap } from "@/services/workspace-loader";
import { WorkerEventReportDataError, WorkerEventReportScopeError, loadEventReportForWorker } from "@/features/reporting/server/event-report-worker-loader";

type Db = { from(table:string): { select(columns:string): { eq(column:string,value:string): { maybeSingle(): Promise<{data:Record<string,unknown>|null;error:Error|null}> } } }; rpc(name:string,args:Record<string,unknown>): Promise<{data:unknown;error:{message?:string;code?:string}|null}> };
type TransitionResult = { finalSnapshotId?: string | null; finalReportJobId?: string | null };

function failureResponse(eventId: string, failure: FinalReportFailure, status: number) {
  logFinalReportFailure(eventId, failure);
  return NextResponse.json({ error: failure }, { status });
}

async function authorizeEvent(eventId:string, permission:"event.view"|"event.edit") {
  const user=await getSupabaseAuthUser();
  if (!user) return { response: NextResponse.json({error:"unauthorized"},{status:401}) } as const;
  const workspace=await loadWorkspaceBootstrap({id:user.id,email:user.email});
  const authorization = authorizeFinalReportEvent(workspace, eventId, permission);
  if ("code" in authorization) return { response: NextResponse.json({error:authorization.code},{status:authorization.code === "unauthorized" ? 401 : 403}) } as const;
  return { event: authorization.event } as const;
}
function eventIdFrom(request:Request) { return new URL(request.url).searchParams.get("eventId") ?? ""; }
export async function GET(request:Request) {
  const eventId=eventIdFrom(request); if (!eventId) return NextResponse.json({error:"event_required"},{status:400});
  const authorized=await authorizeEvent(eventId,"event.view"); if ("response" in authorized) return authorized.response;
  const client=await createSupabaseAuthServerClient(); if (!client) return NextResponse.json({error:"supabase_unconfigured"},{status:503});
  const result=await (client as unknown as Db).from("reporting_final_report_jobs").select("id,event_id,status,attempts,drive_file_id,drive_file_url,last_error_code,updated_at").eq("event_id",eventId).maybeSingle();
  if (result.error) return NextResponse.json({error:"final_report_unavailable"},{status:500});
  return NextResponse.json({job:result.data ?? null});
}
export async function POST(request:Request) {
  const body = await request.json().catch(() => ({}));
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) return NextResponse.json({ error: finalReportFailure("authentication", null, "event_required", "Se requiere el evento para finalizar.") }, { status: 400 });

  const client = await createSupabaseAuthServerClient();
  if (!client) return failureResponse(eventId, finalReportFailure("authentication", null, "supabase_unconfigured", "El servicio de finalización no está configurado."), 503);

  let authorized: Awaited<ReturnType<typeof authorizeEvent>>;
  try {
    authorized = await authorizeEvent(eventId, "event.edit");
  } catch (error) {
    return failureResponse(eventId, finalReportFailure("authorization", error, "authorization_check_failed", "No se pudo verificar el permiso para finalizar el evento."), 500);
  }
  if ("response" in authorized) {
    const response = authorized.response!;
    const phase = response.status === 401 ? "authentication" : "authorization";
    const code = phase === "authentication" ? "unauthorized" : "finalization_forbidden";
    const message = phase === "authentication" ? "Tu sesión no es válida para finalizar el evento." : "No tienes permiso para finalizar este evento.";
    const failure = finalReportFailure(phase, null, code, message);
    return failureResponse(eventId, failure, response.status);
  }

  const db = client as unknown as Db;
  const first = await db.from("reporting_event_revisions").select("revision").eq("event_id", eventId).maybeSingle();
  if (first.error || first.data?.revision === undefined) return failureResponse(eventId, finalReportFailure("revision_lookup", first.error, "reporting_revision_unavailable", "No se pudo obtener la revisión del reporte."), 409);

  let report;
  try {
    report = await loadEventReportForWorker(client as never, { eventId, organizationId: authorized.event.organizationId });
  } catch (error) {
    const dataFailure = error instanceof WorkerEventReportDataError || error instanceof WorkerEventReportScopeError;
    return failureResponse(eventId, finalReportFailure(dataFailure ? "report_load" : "report_build", error, dataFailure ? "final_report_load_failed" : "final_report_build_failed", "No se pudo preparar el informe final."), 500);
  }

  const second = await db.from("reporting_event_revisions").select("revision").eq("event_id", eventId).maybeSingle();
  if (second.error || second.data?.revision !== first.data.revision) return failureResponse(eventId, finalReportFailure("revision_check", second.error, "final_report_revision_conflict", "El evento cambió mientras se preparaba el informe. Vuelve a intentarlo."), 409);

  const result = await db.rpc("transition_event_status", { p_event_id: eventId, p_next_status: "finished", p_report: report, p_expected_revision: first.data.revision });
  if (result.error) return failureResponse(eventId, finalReportFailure("transition", result.error, "finalization_failed", "No se pudo finalizar el evento."), result.error.code === "40001" ? 409 : 400);

  const transition = result.data as TransitionResult | null;
  if (!transition?.finalSnapshotId || !transition.finalReportJobId) return failureResponse(eventId, finalReportFailure("snapshot_job_confirmation", null, "final_report_artifacts_missing", "El cierre no confirmó el snapshot y el trabajo PDF."), 500);
  return NextResponse.json(transition);
}
export async function PATCH(request:Request) {
  const client=await createSupabaseAuthServerClient(); if (!client) return NextResponse.json({error:"supabase_unconfigured"},{status:503});
  const body=await request.json().catch(()=>({})); const eventId=typeof body.eventId==="string"?body.eventId:""; if (!eventId) return NextResponse.json({error:"event_required"},{status:400});
  const authorized=await authorizeEvent(eventId,"event.edit"); if ("response" in authorized) return authorized.response;
  const result=await (client as unknown as Db).rpc("retry_reporting_final_report_job",{p_event_id:eventId});
  if (result.error) return NextResponse.json({error:result.error.message ?? "retry_not_eligible"},{status:400});
  return NextResponse.json({ok:true});
}
