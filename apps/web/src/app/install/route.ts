import {NextResponse} from "next/server";

export function GET(request:Request){
  const url=new URL(request.url);
  url.pathname=url.searchParams.get("locale")==="de"?"/de/install":"/ar/install";
  url.search="";
  return NextResponse.redirect(url);
}
