import "server-only";
import type { ZodType } from "zod";
import { readJson } from "@/server/http";

function decimalKey(token:string){
  const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if(!match)return null;
  const fraction=match[3]??"";
  const significant=(match[2]+fraction).replace(/^0+/,"");
  if(!significant)return "0";
  let end=significant.length;
  while(significant.charCodeAt(end-1)===48)end--;
  const magnitude=Number(match[4]??0)-fraction.length+significant.length-end;
  return `${match[1]}${significant.slice(0,end)}e${magnitude}`;
}

export function readDecimalJson<T>(request:Request,schema:ZodType<T>,fields:readonly string[],limit?:number){
  return readJson(request,schema,limit,(key,value,context)=>{
    if(!fields.includes(key)||typeof value!=="number")return value;
    // Reject an imprecise decimal before the rounded value reaches validation or storage.
    return context?.source&&decimalKey(context.source)===decimalKey(String(value))?value:Number.NaN;
  });
}
