import { switchPersonaInput } from "@madrasty/contracts";
import { ApiError, api, data, readJson } from "@/server/http";
import { withRuntime } from "@/server/db/scoped";
import { assertWebMutation, requestCredential, resolveSchoolSession } from "@/server/identity/session";

export const POST = api(async (request) => {
  const credential = requestCredential(request);
  if (credential.kind === "web") assertWebMutation(request, true);
  const { persona } = await readJson(request, switchPersonaInput);
  const current = await resolveSchoolSession(credential.token);
  if (request.headers.get("x-school-persona") !== current.activePersona || !current.personas.includes(persona)) {
    throw new ApiError("forbidden");
  }

  if (persona !== current.activePersona) {
    const [result] = await withRuntime((tx) => tx<{ switched: boolean }[]>`
      select app.switch_persona(${current.accountId}, ${current.sessionId},
        ${current.activePersona}::app.persona, ${persona}::app.persona) as switched
    `);
    if (!result.switched) throw new ApiError("conflict");
  }

  return data(await resolveSchoolSession(credential.token));
});
