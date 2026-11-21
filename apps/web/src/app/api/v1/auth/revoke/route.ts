import { api, readJson } from "@/server/http";
import { revokeWithTicket, revokeWithTicketInput } from "@/server/identity/revocation";

export const POST = api(async (request) => {
  const input = await readJson(request, revokeWithTicketInput);
  await revokeWithTicket(input.ticket, input.allDevices);
  return new Response(null, { status: 204 });
});
