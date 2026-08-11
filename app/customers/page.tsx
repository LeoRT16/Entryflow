import GuestDirectory from "@/features/customers/components/guest-directory";
import ModuleGuard from "@/components/module-guard";
import PermissionGuard from "@/components/permission-guard";

export default function CustomersPage() {
  return (
    <PermissionGuard permission="guest.view">
      <ModuleGuard module="attendees">
        <GuestDirectory />
      </ModuleGuard>
    </PermissionGuard>
  );
}
