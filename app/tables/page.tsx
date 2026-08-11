import TablesFlow from "@/features/tables/components/tables-flow";
import ModuleGuard from "@/components/module-guard";
import PermissionGuard from "@/components/permission-guard";

export default function TablesPage() {
  return (
    <PermissionGuard permission="resource.view">
      <ModuleGuard module="resources">
        <TablesFlow />
      </ModuleGuard>
    </PermissionGuard>
  );
}
