import { api, data } from "@/server/http";
import { myApplication } from "@/server/identity/teacherApplications";

export const GET = api(async (request) => data(await myApplication(request)));
