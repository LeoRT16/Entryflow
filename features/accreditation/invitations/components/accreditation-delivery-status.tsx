import StatusBadge from "@/components/status-badge";
import type { AccreditationInvitationDeliveryState } from "../domain/accreditation-invitation-operational";
import { getAccreditationInvitationDeliveryLabel, getAccreditationInvitationDeliveryTone } from "../domain/accreditation-invitation-operational";

export default function AccreditationDeliveryStatus({
  state,
}: {
  state: AccreditationInvitationDeliveryState;
}) {
  return <StatusBadge variant={getAccreditationInvitationDeliveryTone(state)}>{getAccreditationInvitationDeliveryLabel(state)}</StatusBadge>;
}
