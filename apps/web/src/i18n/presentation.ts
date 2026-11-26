import type { Locale } from "@madrasty/contracts";
export const UI_LOCALE_COOKIE="madrasty-ui-locale";
export function displayPath(pathname:string,locale:Locale){
 return pathname.replace(/^\/(ar|de)(?=\/|$)/,"/"+locale);
}
