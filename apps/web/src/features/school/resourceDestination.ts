import {schoolResourceLinkSchema,type Locale,type SchoolResourceLink} from "@madrasty/contracts";

export function schoolResourceDestination(locale:Locale,target:SchoolResourceLink){
  const root=`/${locale}/school`,id=target.id;
  switch(target.kind){
    case "notice":return `${root}/more/notifications?notice=${id}`;
    case "thread":return `${root}/messages?thread=${id}`;
    case "broadcast":return `${root}/more/broadcasts?announcement=${id}`;
    case "child":return `${root}/children?child=${id}`;
    case "attendance":return `${root}/children/${target.childId}/attendance?row=${id}`;
    case "exam":return `${root}/more/exams?child=${target.childId}&exam=${id}`;
    case "evaluation":return `${root}/more/evaluations?child=${target.childId}&evaluation=${id}`;
    case "activity":return `${root}/more/academics?child=${target.childId}&activity=${id}`;
    case "homework":return `${root}/more/homework?child=${target.childId}&work=${id}`;
    case "application":return `/${locale}/apply`;
    case "invoice":return `${root}/more/invoices?invoice=${id}`;
    case "receipt":return `${root}/more/receipts?receipt=${id}`;
    case "fee_stop":return `${root}/more/enrollment-stops?request=${id}`;
  }
}

export function schoolResourceLanding(locale:Locale,target:SchoolResourceLink){
  const query=new URLSearchParams();
  if(target.childId)query.set("child",target.childId);
  if(target.date)query.set("date",target.date);
  return `/${locale}/open/${target.kind}/${target.id}`+(query.size?"?"+query.toString():"");
}


export function safeSchoolResourceReturn(locale:Locale,raw:string|undefined){
  if(!raw?.startsWith(`/${locale}/open/`)||raw.includes("\\")||raw.includes("#"))return undefined;
  const route=new URL(raw,"https://school.invalid");
  const [,language,channel,kind,id,...rest]=route.pathname.split("/");
  if(language!==locale||channel!=="open"||rest.length||
    [...route.searchParams.keys()].some((key)=>key!=="child"&&key!=="date")||
    route.searchParams.getAll("child").length>1||route.searchParams.getAll("date").length>1)return undefined;
  const value=schoolResourceLinkSchema.safeParse({kind,id,childId:route.searchParams.get("child")??undefined,
    date:route.searchParams.get("date")??undefined});
  return value.success?schoolResourceLanding(locale,value.data):undefined;
}
