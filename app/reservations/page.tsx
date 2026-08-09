import ReservationFlow from "@/features/reservations/components/reservation-flow";
import ModuleGuard from "@/components/module-guard";

export default function ReservationsPage() {
  return (
    <ModuleGuard module="access">
      <ReservationFlow />
    </ModuleGuard>
  );
}
