import { directStaffAccountInput } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { provisionStaffAccount } from "@/server/identity/staffProvisioning";

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const result = await provisionStaffAccount(actor, await readJson(request,directStaffAccountInput));
  return data(result,201);
});
