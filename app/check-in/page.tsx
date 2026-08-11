import CheckInFlow from "@/features/check-in/components/check-in-flow";
import ModuleGuard from "@/components/module-guard";
import PermissionGuard from "@/components/permission-guard";

export default function CheckInPage() {
  return (
    <PermissionGuard permission="checkin.view">
      <ModuleGuard module="admission">
        <CheckInFlow />
      </ModuleGuard>
    </PermissionGuard>
  );
}
