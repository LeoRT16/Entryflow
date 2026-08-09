import GuestDirectory from "@/features/customers/components/guest-directory";
import ModuleGuard from "@/components/module-guard";

export default function CustomersPage() {
  return (
    <ModuleGuard module="attendees">
      <GuestDirectory />
    </ModuleGuard>
  );
}
