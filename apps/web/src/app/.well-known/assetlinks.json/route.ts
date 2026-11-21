import {androidRelease} from "@/server/release/android";

export const dynamic="force-dynamic";

export function GET(){
  const release=androidRelease();
  if(!release)return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
  return Response.json([{
    relation:["delegate_permission/common.handle_all_urls"],
    target:{namespace:"android_app",package_name:release.packageId,sha256_cert_fingerprints:[release.certificate]},
  }],{headers:{"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});
}
