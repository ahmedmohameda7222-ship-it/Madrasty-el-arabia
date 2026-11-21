import { api, data } from "@/server/http";
import { factors } from "@/server/identity/assurance";
import { requestCredential } from "@/server/identity/session";

export const GET = api(async (request) => data(await factors(requestCredential(request).token)));
