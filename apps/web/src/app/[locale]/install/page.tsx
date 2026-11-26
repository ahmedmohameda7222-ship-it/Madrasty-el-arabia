import { displayParams } from "@/server/identity/display-locale";
import Link from "next/link";
import type {Locale} from "@madrasty/contracts";
import {androidRelease} from "@/server/release/android";
import {SchoolHeader} from "@/ui/Shell";

export const dynamic="force-dynamic";

const copy={
  ar:{
    title:"تثبيت مدرستي العربية",ios:"iPhone",iosSteps:["افتح موقع المدرسة في Safari.","اضغط مشاركة، ثم إضافة إلى الشاشة الرئيسية. اختار الفتح كتطبيق ويب لو ظهر الاختيار.","افتح مدرستي العربية من الشاشة الرئيسية وسجّل الدخول."],
    android:"Android",androidSteps:["نزّل ملف APK من رابط المدرسة هنا.","افتح الملف واسمح بالتثبيت من المتصفح لو Android طلب الإذن.","لو التطبيق موجود على الجهاز، افتح الملف واعتمد التحديث."],
    download:"تنزيل APK",unavailable:"النسخة الموقّعة لسه مش متاحة للتنزيل.",fingerprint:"بصمة الملف SHA-256",signIn:"تسجيل الدخول من الويب",
  },
  de:{
    title:"Madrasty El Arabia installieren",ios:"iPhone",
    iosSteps:["Öffne die Schulwebsite in Safari.","Tippe auf Teilen und zum Home-Bildschirm hinzufügen. Aktiviere Als Web-App öffnen, wenn die Option angezeigt wird.","Öffne Madrasty El Arabia auf dem Home-Bildschirm und melde dich an."],
    android:"Android",androidSteps:["Lade die APK über den Schullink auf dieser Seite herunter.","Öffne die Datei und erlaube die Installation über den Browser, wenn Android danach fragt.",
      "Wenn die App bereits installiert ist, öffne die Datei und bestätige das Update."],
    download:"APK herunterladen",unavailable:"Die signierte APK steht noch nicht zum Download bereit.",fingerprint:"SHA-256-Prüfsumme der Datei",signIn:"Im Browser anmelden",
  },
};
export default async function InstallSchoolApp({params}:{params:Promise<{locale:Locale}>}){
  const {locale}=await displayParams(params),text=copy[locale],release=androidRelease();
  return <main className="public-page">
    <SchoolHeader locale={locale}/>
    <section className="auth-card auth-form"><h1>{text.title}</h1>
      <h2>{text.ios}</h2>
      <ol>{text.iosSteps.map((step)=><li key={step}>{step}</li>)}</ol>
      <h2>{text.android}</h2>
      {release?<><ol>{text.androidSteps.map((step)=><li key={step}>{step}</li>)}</ol>
        <Link className="primary-button" href="/download/android" prefetch={false}>{text.download} · <bdi>{release.versions.suggestedVersionName}</bdi></Link>
        <details><summary>{text.fingerprint}</summary><code dir="ltr" style={{overflowWrap:"anywhere"}}>{release.versions.sha256}</code></details>
      </>:<p>{text.unavailable}</p>}
      <Link className="plain-button" href={`/${locale}/account/sign-in`}>{text.signIn}</Link>
    </section>
  </main>;
}
