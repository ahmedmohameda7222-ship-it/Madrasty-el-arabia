import "server-only";
import { cookies } from "next/headers";
import { localeSchema, type Locale } from "@madrasty/contracts";
import { UI_LOCALE_COOKIE } from "@/i18n/presentation";

// Device-local presentation only; never use this for authentication, access,
// correspondence language or interpreting entered data.
export async function resolveUiLocale(fallback:Locale):Promise<Locale>{
 const selected=localeSchema.safeParse((await cookies()).get(UI_LOCALE_COOKIE)?.value);
 return selected.success?selected.data:fallback;
}
export async function presentationParams<T extends {locale:string}>(params:Promise<T>):Promise<T & {locale:Locale}>{
 const route=await params;
 const valid=localeSchema.safeParse(route.locale);
 if(!valid.success)return route as T & {locale:Locale};
 return {...route,locale:await resolveUiLocale(valid.data)};
}
