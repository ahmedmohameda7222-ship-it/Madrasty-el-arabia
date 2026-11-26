import "server-only";
import {cookies} from "next/headers";
import {localeSchema} from "@madrasty/contracts";

// The URL segment identifies the current route, not a new workspace.
// Only a valid UI-language preference can override its presentation.
export async function displayParams<T extends {locale:string}>(params:Promise<T>):Promise<T>{
  const route=await params;
  if(!localeSchema.safeParse(route.locale).success)return route;
  const jar=await cookies();
  const chosen=localeSchema.safeParse(jar.get("madrasty-ui-locale")?.value);
  return chosen.success?{...route,locale:chosen.data}:route;
}
