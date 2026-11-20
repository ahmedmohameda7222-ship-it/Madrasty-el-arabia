import "server-only";
import {androidClientVersions} from "@madrasty/contracts";
import {z} from "zod";

const settings=z.object({
  origin:z.string().url(),artifact:z.string().url(),host:z.string().regex(/^[a-z0-9.-]+$/),
  packageId:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/),
  certificate:z.string().regex(/^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i),
  minimum:z.coerce.number().int().min(1),suggested:z.coerce.number().int().min(1),version:z.string().regex(/^[a-zA-Z0-9.+_-]{1,40}$/),
  sha256:z.string().toLowerCase().regex(/^[a-f0-9]{64}$/),
});

export function androidRelease(){
  const parsed=settings.safeParse({
    origin:process.env.APP_ORIGIN,artifact:process.env.ANDROID_APK_URL,host:process.env.ANDROID_APK_STORAGE_HOST,
    packageId:process.env.ANDROID_APPLICATION_ID,certificate:process.env.ANDROID_SIGNING_CERT_SHA256,
    minimum:process.env.ANDROID_MINIMUM_VERSION_CODE,suggested:process.env.ANDROID_RELEASE_VERSION_CODE,
    version:process.env.ANDROID_RELEASE_VERSION_NAME,sha256:process.env.ANDROID_RELEASE_APK_SHA256,
  });
  if(!parsed.success)return null;
  const input=parsed.data,origin=new URL(input.origin),artifact=new URL(input.artifact);
  if(origin.protocol!=="https:"||origin.pathname!=="/"||origin.search||origin.hash||origin.username||origin.password||
    artifact.protocol!=="https:"||artifact.hostname!==input.host||artifact.username||artifact.password||artifact.port||
    artifact.hash||artifact.search||!artifact.pathname.endsWith(".apk"))return null;
  const versions=androidClientVersions.safeParse({minimumVersionCode:input.minimum,suggestedVersionCode:input.suggested,
    suggestedVersionName:input.version,downloadUrl:new URL("/download/android",origin).href,sha256:input.sha256});
  if(!versions.success)return null;
  return {versions:versions.data,artifact:artifact.href,packageId:input.packageId,certificate:input.certificate.toUpperCase()};
}
