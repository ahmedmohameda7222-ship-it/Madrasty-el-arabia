import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ApiError } from "@/server/http";
import { resolveSchoolSession } from "./session";

export const webSchoolSession = cache(async () => {
  const jar = await cookies();
  if (jar.has("__Host-madrasty-locked") || jar.has("madrasty-locked")) return null;
  const name = process.env.NODE_ENV === "production" ? "__Host-madrasty-session" : "madrasty-session";
  const token = jar.get(name)?.value;
  if (!token) return null;
  try {
    return await resolveSchoolSession(token);
  } catch (error) {
    if (error instanceof ApiError && error.code === "unauthenticated") return null;
    throw error;
  }
});
