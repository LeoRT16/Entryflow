import EventCommandCenter from "@/features/events/components/event-command-center";
import PermissionGuard from "@/components/permission-guard";

export default function Home() {
  return (
    <PermissionGuard permission="dashboard.view">
      <EventCommandCenter />
    </PermissionGuard>
  );
}
