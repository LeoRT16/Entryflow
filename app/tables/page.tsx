import TablesFlow from "@/features/tables/components/tables-flow";
import ModuleGuard from "@/components/module-guard";

export default function TablesPage() {
  return (
    <ModuleGuard module="resources">
      <TablesFlow />
    </ModuleGuard>
  );
}
