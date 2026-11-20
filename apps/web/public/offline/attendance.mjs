import {
  activeAttendanceScope, clearAttendanceVault, listAttendanceVaultRecords, readAttendanceVault, removeAttendanceVaultRecord, writeAttendanceVault,
} from "/attendance-vault.mjs";

const copy={
  ar:{title:"مسودات الحضور على الجهاز",offline:"النسخة المحفوظة على الجهاز للاستخدام بدون اتصال.",empty:"فيه اتصال مطلوب قبل عرض أي كشف محفوظ.",
    last:"آخر تأكيد من المدرسة",back:"رجوع",unsent:"تعديلات غير مُرسلة",reason:"سبب الغياب",kept:"المسودة محفوظة على الجهاز.",
    error:"تعذّر حفظ المسودة على هذا الجهاز.",lock:"إزالة المسودات من الجهاز",warning:"إزالة المسودات والتسجيل المحفوظ من هذا الجهاز؟",
    reconnect:"افتح النسخة المتصلة",locked:"الحالة مقفولة",readonly:"الكشف للعرض فقط.",arrival:"حضور فعلي مؤكد.",
    marks:{"":"بدون تسجيل",present:"حاضر",late:"متأخر",absent_unexcused:"غائب بدون عذر",absent_excused:"غائب بعذر"}},
  de:{title:"Anwesenheitsentwürfe auf dem Gerät",offline:"Auf diesem Gerät gespeicherte Daten für die Nutzung ohne Verbindung.",empty:"Vor dem Anzeigen gespeicherter Listen ist eine Verbindung erforderlich.",
    last:"Zuletzt von der Schule bestätigt",back:"Zurück",unsent:"Ungesendete Änderungen",reason:"Grund der Abwesenheit",kept:"Der Entwurf wurde auf dem Gerät gespeichert.",
    error:"Der Entwurf konnte auf diesem Gerät nicht gespeichert werden.",lock:"Entwürfe vom Gerät entfernen",warning:"Entwürfe und gespeicherte Anwesenheit von diesem Gerät entfernen?",
    reconnect:"Verbundene Ansicht öffnen",locked:"Status gesperrt",readonly:"Die Liste kann nur gelesen werden.",arrival:"Ankunft bestätigt.",
    marks:{"":"Ohne Eintrag",present:"Anwesend",late:"Verspätet",absent_unexcused:"Unentschuldigt abwesend",absent_excused:"Entschuldigt abwesend"}},
};
const container=document.getElementById("attendance-offline");
let selected=null;
let workspace=null;
let expiration;
let saveTail=Promise.resolve();
let generation=0;

function node(tag,value){
  const element=document.createElement(tag);
  if(value!==undefined)element.textContent=String(value);
  return element;
}
function button(value,action){
  const control=node("button",value);control.type="button";control.addEventListener("click",action);return control;
}
function pathFor(scope,slot){
  const [type,id,date]=slot.split("/");
  if(type==="excuse")return `/${scope.locale}/school/children/${id}/excuse?date=${date}`;
  const base=scope.persona==="admin"?"more/attendance":"attendance";
  return `/${scope.locale}/school/${base}?class=${id}&date=${date}`;
}
function recordTitle(record,locale){
  if(record.kind==="excuse")return record.child.displayName;
  return locale==="de"?record.classroom.nameDe:record.classroom.nameAr;
}
function armExpiration(scope,record){
  clearTimeout(expiration);
  if(scope){
    const deadline=Math.min(scope.expiresAt,record?.validUntil??scope.expiresAt);
    expiration=setTimeout(()=>{selected=null;void render();},Math.max(0,deadline-Date.now()+10));
  }
}
async function stillAuthorized(scope,slot){
  if(!navigator.onLine)return true;
  const [kind,id,date]=slot.split("/");
  const api=kind==="excuse" ? `/api/v1/children/${id}/attendance/excuses?date=${date}`
    : `/api/v1/attendance/classes/${id}/days/${date}`;
  const cancel=new AbortController();
  const timer=setTimeout(()=>cancel.abort(),2500);
  try{
    const session=await fetch("/api/v1/auth/session",{cache:"no-store",signal:cancel.signal});
    if(session.status===401||session.status===403){await clearAttendanceVault();return false;}
    if(!session.ok)return true;
    const account=(await session.json()).data;
    if([account.accountId,account.sessionId,account.activePersona].join("/")!==scope.partition){
      await clearAttendanceVault();
      return false;
    }
    const result=await fetch(api,{cache:"no-store",signal:cancel.signal,headers:{"X-School-Persona":scope.persona}});
    if(result.status===401||result.status===403||result.status===404){
      const slots=await listAttendanceVaultRecords(scope);
      await Promise.all(slots.filter((item)=>item.startsWith(`${kind}/${id}/`)).map((item)=>removeAttendanceVaultRecord(scope,item)));
      return false;
    }
    if(result.ok){location.replace(pathFor(scope,slot));return false;}
    return result.status>=500;
  }catch{return true;}
  finally{clearTimeout(timer);}
}
function save(scope,slot,record,status,text){
  const snapshot=structuredClone(record);
  saveTail=saveTail.catch(()=>{}).then(async()=>{
    const ok=await writeAttendanceVault(scope,slot,snapshot);
    status.textContent=ok?text.kept:text.error;
  }).catch(()=>{status.textContent=text.error;});
}

async function render(){
  const version=++generation;
  const found=await activeAttendanceScope(undefined).catch(()=>null);
  if(version!==generation)return;
  workspace=found;
  const scope=found;
  const locale=scope?.locale??(location.pathname.startsWith("/de/")?"de":"ar");
  const text=copy[locale];
  document.documentElement.lang=locale;
  document.documentElement.dir=locale==="ar"?"rtl":"ltr";
  container.replaceChildren(node("h1",text.title),node("p",text.offline));
  armExpiration(scope);
  if(!scope){selected=null;container.append(node("p",text.empty));return;}

  const slot=selected;
  if(slot){
    const permitted=await stillAuthorized(scope,slot);
    const record=permitted?await readAttendanceVault(scope,slot).catch(()=>null):null;
    if(version!==generation)return;
    if(!record){selected=null;void render();return;}
    armExpiration(scope,record);
    const panel=node("section");
    panel.append(button(text.back,()=>{selected=null;void render();}),node("h2",recordTitle(record,locale)),node("bdi",record.schoolDate));
    panel.append(node("p",text.last+" · "+new Date(record.confirmedAt).toLocaleString(locale)));
    const status=node("p");
    status.setAttribute("role","status");
    if(record.kind==="sheet"){
      if(record.readonly)panel.append(node("p",text.readonly));
      const pending=node("p",text.unsent+" · "+Object.keys(record.drafts).length);
      panel.append(pending);
      for(const row of record.rows){
        const item=node("article");
        item.append(node("strong",row.displayName),node("bdi",row.studentNumber));
        if(record.readonly||row.locked||row.arrival){
          item.append(node("p",text.marks[row.status??""]));
          if(row.locked)item.append(node("p",text.locked));
          if(row.arrival)item.append(node("p",text.arrival));
        }else{
          const label=node("label",row.displayName);
          const input=node("select");
          for(const [key,value] of Object.entries(text.marks)){const option=node("option",value);option.value=key;input.append(option);}
          const draft=record.drafts[row.id];
          input.value=(draft?draft.status:row.status)??"";
          input.addEventListener("change",()=>{
            const value=input.value||null;
            if(value===row.status)delete record.drafts[row.id];
            else record.drafts[row.id]={revision:row.revision,status:value};
            record.sync=true;
            pending.textContent=text.unsent+" · "+Object.keys(record.drafts).length;
            save(scope,slot,record,status,text);
          });
          label.append(input);item.append(label);
        }
        panel.append(item);
      }
    }else if(record.teachingDay){
      const group=node("label",text.reason);
      const input=node("textarea");
      input.maxLength=500;
      input.value=record.reason;
      input.addEventListener("input",()=>{record.reason=input.value;save(scope,slot,record,status,text);});
      group.append(input);panel.append(group,node("p",text.unsent));
    }
    const reconnect=node("a",text.reconnect);
    reconnect.href=pathFor(scope,slot);
    panel.append(status,reconnect);
    container.append(panel);
    return;
  }

  const slots=await listAttendanceVaultRecords(scope).catch(()=>[]);
  const records=await Promise.all(slots.map(async(key)=>({key,record:await readAttendanceVault(scope,key)})));
  if(version!==generation)return;
  if(!records.some(({record})=>record))container.append(node("p",text.empty));
  for(const {key,record} of records){
    if(record)container.append(button(recordTitle(record,locale)+" · "+record.schoolDate,()=>{selected=key;void render();}));
  }
  container.append(button(text.lock,async()=>{
    if(!window.confirm(text.warning))return;
    await saveTail.catch(()=>{});
    await clearAttendanceVault();
    selected=null;
    await render();
  }));
}

window.addEventListener("online",()=>{
  if(!workspace||!selected)return;
  const route=pathFor(workspace,selected);
  void saveTail.finally(()=>location.replace(route));
});
window.addEventListener("pageshow",()=>void render());
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")void render();
});
void render();
