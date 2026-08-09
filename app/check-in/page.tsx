import CheckInFlow from "@/features/check-in/components/check-in-flow";
import ModuleGuard from "@/components/module-guard";

export default function CheckInPage() {
  return (
    <ModuleGuard module="admission">
      <CheckInFlow />
    </ModuleGuard>
  );
}
