import OperationsCenter from "@/features/operations/components/operations-center";
import ModuleGuard from "@/components/module-guard";
import PermissionGuard from "@/components/permission-guard";

export default function OperationsPage() {
  return (
    <PermissionGuard permission="operations.view">
      <ModuleGuard module="operations">
        <OperationsCenter />
      </ModuleGuard>
    </PermissionGuard>
  );
}
