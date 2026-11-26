import { importUploadInput, maxFamilyUploadBytes } from "@madrasty/contracts";
import { api, data, readJson } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { uploadImport, listFamilyImports } from "@/server/school/imports";

export const POST = api(async (request, ctx) => {
  const actor = await requireActor(request, ctx);
  const body = await readJson(request, importUploadInput, Math.ceil(maxFamilyUploadBytes / 3) * 4 + 2048);
  const result = await uploadImport(actor, request.headers.get("idempotency-key"), body);
  return data(result.data, result.replayed ? 200 : 201);
});

export const GET=api(async(request,ctx)=>data(await listFamilyImports(await requireActor(request,ctx))));
