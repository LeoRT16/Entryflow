import OperationsCenter from "@/features/operations/components/operations-center";
import ModuleGuard from "@/components/module-guard";

export default function OperationsPage() {
  return (
    <ModuleGuard module="operations">
      <OperationsCenter />
    </ModuleGuard>
  );
}
