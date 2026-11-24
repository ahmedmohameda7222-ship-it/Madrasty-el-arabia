"use client";
import {useState} from "react";
import type {Locale} from "@madrasty/contracts";
import {webHeaders} from "@/api/client-headers";
import {useAccountScope} from "@/ui/AccountScope";
export function FinancePdfButton({locale,id,kind,number}:{locale:Locale;id:string;kind:"invoices"|"receipts";number:string}){
  const {persona}=useAccountScope(),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  async function download(){
    if(busy)return;
    setBusy(true);setError(false);
    try{
      const response=await fetch(`/api/v1/finance/${kind}/${id}/pdf?locale=${locale}`,{headers:webHeaders(persona),cache:"no-store"});
      if(!response.ok||!response.headers.get("content-type")?.startsWith("application/pdf"))throw Error("PDF unavailable");
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement("a");
      link.href=url;link.download=number.replace(/[^A-Za-z0-9_-]/g,"_")+".pdf";
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch{setError(true);}finally{setBusy(false);}
  }
  return <div className="auth-form"><button type="button" className="plain-button" disabled={busy} onClick={()=>void download()}>
    {busy?(locale==="ar"?"جارٍ التحميل":"Wird geladen"):(locale==="ar"?"تحميل PDF":"PDF herunterladen")}
  </button>{error&&<p role="alert">{locale==="ar"?"تعذّر تحميل المستند. حاول مرة أخرى.":"PDF konnte nicht geladen werden. Erneut versuchen."}</p>}</div>;
}
