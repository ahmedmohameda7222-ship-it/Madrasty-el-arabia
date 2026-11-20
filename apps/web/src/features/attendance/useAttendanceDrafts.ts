"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attendanceChanges, type AttendanceChanges, type AttendanceSheet, type Locale } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { webHeaders } from "@/features/identity/SessionControls";
import type { AccountPartition } from "@/ui/AccountScope";
import {
  activateAttendanceDrafts, cachedSheet, purgeAttendanceSlots, readPrivateDraft, reconcileAttendance,
  writePrivateDraft, type CachedSheet, type SendEdits, type SheetEdits,
} from "./draft-store";

export function useAttendanceDrafts(actor:AccountPartition,locale:Locale,slot:string) {
  const loaded=useRef<CachedSheet|null>(null);
  const queue=useRef(Promise.resolve(true));
  const [local,setLocal]=useState<CachedSheet|null>(null);
  const [drafts,setDrafts]=useState<SheetEdits>({});
  const [ready,setReady]=useState(false);
  const sending=useRef(false);
  const [storageUnavailable,setStorageUnavailable]=useState(false);

  useEffect(()=>{
    let active=true;
    void activateAttendanceDrafts(actor,locale).then(()=>readPrivateDraft<CachedSheet>(actor,slot)).then((value)=>{
      if(!active)return;
      const entry=value?.kind==="sheet"?value:null;
      loaded.current=entry;
      setLocal(entry);
      setDrafts(entry?.drafts??{});
      setReady(true);
    });
    return ()=>{active=false;};
  },[actor,locale,slot]);

  const persist=useCallback((record:CachedSheet)=>{
    loaded.current=record;
    setLocal(record);
    setDrafts(record.drafts);
    const write=queue.current.catch(()=>false).then(()=>writePrivateDraft(actor,slot,record));
    queue.current=write;
    void write.then((ok)=>setStorageUnavailable(!ok));
    return write;
  },[actor,slot]);

  const accept=useCallback((value:AttendanceSheet)=>{
    const entry=cachedSheet(value,loaded.current,loaded.current?.drafts??{},Date.parse(actor.expiresAt??""));
    if(entry)void persist(entry);
  },[actor.expiresAt,persist]);

  function setEdits(change:(before:SheetEdits)=>SheetEdits,offline=false) {
    const record=loaded.current;
    const edits=change(record?.drafts??{});
    if(record)void persist({...record,drafts:edits,sync:record.sync||offline||!navigator.onLine});
    else setDrafts(edits);
  }

  const forget=useCallback(()=>{
    loaded.current=null;
    setLocal(null);
    setDrafts({});
    const prefix=slot.slice(0,slot.lastIndexOf("/")+1);
    const purge=queue.current.catch(()=>false).then(async()=>{await purgeAttendanceSlots(actor,prefix);return true;});
    queue.current=purge;
  },[actor,slot]);

  async function send(value:AttendanceSheet,automatic=false):Promise<{changes?:AttendanceChanges;queued:boolean}> {
    const before=loaded.current;
    if(!before || !value.id || sending.current)return {queued:false};
    if(!value.canMark || !value.teachingDay || value.state!=="open"){
      if(before.sync||before.inFlight)await persist({...before,readonly:true,sync:false,inFlight:undefined});
      return {queued:false};
    }
    if(!navigator.onLine){
      const saved=await persist({...before,sync:true});
      return {queued:saved};
    }
    const {compatible,acknowledged,blocked}=reconcileAttendance(value,before.drafts);
    const next={...before.drafts};
    for(const id of acknowledged)delete next[id];
    const typed:SendEdits=Object.entries(next).map(([rowId,draft])=>({rowId,...draft}));
    const edits=before.inFlight?.edits??(automatic?compatible:typed);
    const offlineConflicts=automatic?blocked.map((rowId)=>({
      rowId,reason:"stale" as const,current:value.rows.find((row)=>row.id===rowId)??null,
    })):[];
    if(!edits.length){
      if(before.sync||acknowledged.length)await persist({...before,drafts:next,sync:false,inFlight:undefined});
      return {queued:false,changes:offlineConflicts.length?{applied:[],skippedLocked:[],conflicts:offlineConflicts}:undefined};
    }
    sending.current=true;
    const attempt=before.inFlight??{key:crypto.randomUUID(),edits};
    const saved=await persist({...before,drafts:next,sync:true,inFlight:attempt});
    try{
      const {data}=await requestApi(`/attendance/sheets/${value.id}/rows`,attendanceChanges,{
        method:"PATCH",headers:{...webHeaders(actor.persona),"Idempotency-Key":attempt.key},body:JSON.stringify({edits:attempt.edits}),
      });
      const record=loaded.current;
      if(record){
        const remaining={...record.drafts};
        for(const row of data.applied){
          const used=attempt.edits.find((edit)=>edit.rowId===row.id);
          const current=remaining[row.id];
          if(used&&current&&used.revision===current.revision&&used.status===current.status)delete remaining[row.id];
        }
        await persist({...record,drafts:remaining,sync:false,inFlight:undefined});
      }
      return {queued:false,changes:{...data,conflicts:[...data.conflicts,...offlineConflicts.filter((local)=>!data.conflicts.some((remote)=>remote.rowId===local.rowId))]}};
    }catch(error){
      const savedInFlight=loaded.current;
      if(error instanceof ApiResponseError&&error.status<500&&savedInFlight){
        await persist({...savedInFlight,sync:false,inFlight:undefined});
        throw error;
      }
      if(saved)return {queued:true};
      throw error;
    }finally{sending.current=false;}
  }
  return {ready,local,drafts,setDrafts:setEdits,accept,forget,send,storageUnavailable};
}
