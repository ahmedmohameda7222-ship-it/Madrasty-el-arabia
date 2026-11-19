import { apiVersion, healthSchema } from "@madrasty/contracts";
import { api, data } from "@/server/http";

export const GET = api(() => data(healthSchema.parse({ status: "ok", apiVersion })));
