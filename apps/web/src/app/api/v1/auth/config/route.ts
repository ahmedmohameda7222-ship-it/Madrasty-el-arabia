import { ApiError, api, data } from "@/server/http";

export const GET = api(() => {
  const origin = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !publishableKey?.startsWith("sb_publishable_")) throw new ApiError("unavailable");
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/") throw new ApiError("unavailable");
  return data({ origin: url.origin, publishableKey });
});
