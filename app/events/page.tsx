import EventLibrary from "@/features/events/components/event-library";
import PermissionGuard from "@/components/permission-guard";

export default function EventsPage() {
  return (
    <PermissionGuard permission="event.view">
      <EventLibrary />
    </PermissionGuard>
  );
}
