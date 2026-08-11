import ReservationFlow from "@/features/reservations/components/reservation-flow";
import ModuleGuard from "@/components/module-guard";
import PermissionGuard from "@/components/permission-guard";

export default function ReservationsPage() {
  return (
    <PermissionGuard permission="reservation.view">
      <ModuleGuard module="access">
        <ReservationFlow />
      </ModuleGuard>
    </PermissionGuard>
  );
}
