import type { Json } from "@/lib/supabase/types";
import type { AccreditationEventProfile } from "../events";

export type AccreditationProgramSessionStatus = "active" | "cancelled";

export type AccreditationProgramSessionType =
  | "keynote"
  | "talk"
  | "panel"
  | "workshop"
  | "break"
  | "networking"
  | "other";

export type AccreditationProgramSession = {
  id: string;
  organizationId: string;
  eventId: string;
  title: string;
  description?: string;
  sessionType: AccreditationProgramSessionType;
  startsAt: string;
  endsAt: string;
  room?: string;
  capacity?: number;
  metadata?: Record<string, unknown>;
  status: AccreditationProgramSessionStatus;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccreditationProgramSessionInput = {
  organizationId: string;
  eventId: string;
  title: string;
  description?: string | null;
  sessionType?: string | null;
  startsAt: string;
  endsAt: string;
  room?: string | null;
  capacity?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationProgramSessionUpdateInput = {
  title?: string;
  description?: string | null;
  sessionType?: string | null;
  startsAt?: string;
  endsAt?: string;
  room?: string | null;
  capacity?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type AccreditationProgramSessionRow = {
  id: string;
  organization_id: string;
  event_id: string;
  title: string;
  description: string | null;
  session_type: AccreditationProgramSessionType;
  starts_at: string;
  ends_at: string;
  room: string | null;
  capacity: number | null;
  metadata: Json | null;
  status: AccreditationProgramSessionStatus;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccreditationProgramSessionScope = {
  organizationId: string;
  eventId: string;
};

export type AccreditationProgramSessionSummary = {
  total: number;
  active: number;
  cancelled: number;
  upcoming: number;
  inProgress: number;
  completed: number;
};

export type AccreditationProgramSessionDisplay = {
  id: string;
  title: string;
  description?: string;
  sessionType: AccreditationProgramSessionType;
  sessionTypeLabel: string;
  startsAt: string;
  endsAt: string;
  timeRangeLabel: string;
  room?: string;
  roomLabel: string;
  capacity?: number;
  capacityLabel?: string;
  status: AccreditationProgramSessionStatus;
  statusLabel: string;
  lifecycleState: "upcoming" | "in_progress" | "completed" | "cancelled";
  lifecycleStateLabel: string;
  dateKey: string;
};

export type AccreditationProgramDateGroup = {
  dateKey: string;
  dateLabel: string;
  sessions: AccreditationProgramSessionDisplay[];
};

export type AccreditationProgramReadModel = {
  eventProfile: AccreditationEventProfile;
  summary: AccreditationProgramSessionSummary;
  dateGroups: AccreditationProgramDateGroup[];
};

export type AccreditationProgramSessionRepository = {
  create(input: AccreditationProgramSessionInput): Promise<AccreditationProgramSession>;
  update(id: string, patch: AccreditationProgramSessionUpdateInput): Promise<AccreditationProgramSession>;
  cancel(id: string): Promise<AccreditationProgramSession>;
  getById(id: string): Promise<AccreditationProgramSession | undefined>;
  list(scope: AccreditationProgramSessionScope): Promise<AccreditationProgramSession[]>;
};
