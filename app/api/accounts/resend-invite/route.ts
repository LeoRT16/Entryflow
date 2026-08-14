import { handleResendInvite } from "./handler";

export async function POST(request: Request) {
  return handleResendInvite(request);
}
