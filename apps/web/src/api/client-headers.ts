import type {Persona} from "@madrasty/contracts";

export function webHeaders(persona?:Persona){
  const csrf=document.cookie.split(";").map((value)=>value.trim()).find((value)=>
    value.startsWith("__Host-madrasty-csrf=")||value.startsWith("madrasty-csrf="))?.split("=")[1];
  return {"Content-Type":"application/json",...(csrf&&{"X-CSRF-Token":csrf}),...(persona&&{"X-School-Persona":persona})};
}
