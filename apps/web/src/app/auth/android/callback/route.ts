import { api } from "@/server/http";

export const GET = api((request) => {
  const locale = request.headers.get("accept-language")?.toLowerCase().startsWith("de") ? "de" : "ar";
  // Without the originating app and its verifier the browser offers ordinary sign-in.
  return new Response(null, {
    status: 303,
    headers: { Location: `/${locale}/account/sign-in?android=1`, "Referrer-Policy": "no-referrer" },
  });
});
