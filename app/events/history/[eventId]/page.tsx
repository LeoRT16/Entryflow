import HistoricalEventView from "@/features/events/components/historical-event-view";

export default async function HistoricalEventPage({ params }: { params: Promise<{ eventId:string }> }) {
  const { eventId } = await params;
  return <HistoricalEventView eventId={eventId} />;
}
