"use client";

import { useEffect, useRef } from "react";
import { attendanceNoticeBatch, attendanceRowDetail, type AttendanceNoticeBatch, type AttendanceRow, type Persona } from "@madrasty/contracts";
import { requestApi } from "@/api/client";

type Update = { patch:(rows:AttendanceRow[])=>void; refresh:()=>void };

export function useLiveAttendance(path:`/${string}`,sheetId:string|null,persona:Persona,updates:Update) {
  const targets=useRef(updates);
  useEffect(()=>{targets.current=updates;},[updates]);
  useEffect(()=>{
    if(!sheetId)return;
    const abort=new AbortController();
    const header={"X-School-Persona":persona};
    let cursor:string|undefined;
    let fallback:ReturnType<typeof setInterval>|undefined;
    let streaming:EventSource|undefined;
    let checking=false;

    async function merge(batch:AttendanceNoticeBatch){
      if(cursor===undefined || BigInt(batch.cursor)>BigInt(cursor))cursor=batch.cursor;
      if(abort.signal.aborted)return;
      const ids=[...new Set(batch.rows.filter((row)=>row.sheetId===sheetId).map((row)=>row.rowId))];
      if(!ids.length||ids.length>8){targets.current.refresh();return;}
      try{
        const replies=await Promise.all(ids.map((id)=>requestApi(`/attendance/rows/${id}`,attendanceRowDetail,{signal:abort.signal,headers:header})));
        if(abort.signal.aborted)return;
        if(replies.some(({data})=>data.sheetId!==sheetId))targets.current.refresh();
        else targets.current.patch(replies.map(({data})=>data.row));
      }catch{
        if(!abort.signal.aborted)targets.current.refresh();
      }
    }

    async function poll(){
      if(checking||abort.signal.aborted||document.visibilityState!=="visible")return;
      checking=true;
      try{
        const result=await requestApi(`${path}/changes${cursor?`?after=${cursor}`:""}`,attendanceNoticeBatch,{signal:abort.signal,headers:header});
        if(!cursor||result.data.rows.length)await merge(result.data);
      }catch{
        if(!abort.signal.aborted)targets.current.refresh();
      }finally{checking=false;}
    }
    const stopFallback=()=>{if(fallback)clearInterval(fallback);fallback=undefined;};
    const startFallback=()=>{if(!fallback)fallback=setInterval(()=>void poll(),3_500);};

    function connect(){
      if(document.visibilityState!=="visible"||abort.signal.aborted)return;
      if(!("EventSource" in window)){startFallback();void poll();return;}
      if(streaming)return;
      streaming=new EventSource(`/api/v1${path}/changes?stream=1${cursor?`&after=${cursor}`:""}`);
      streaming.onopen=stopFallback;
      streaming.onerror=startFallback;
      const accept=(event:MessageEvent<string>)=>{
        try{
          const batch=attendanceNoticeBatch.parse(JSON.parse(event.data));
          void merge(batch);
        }catch{startFallback();}
      };
      streaming.addEventListener("snapshot",accept);
      streaming.addEventListener("rows",accept);
      streaming.addEventListener("forbidden",()=>{
        streaming?.close();streaming=undefined;
        stopFallback();
        targets.current.refresh();
      });
    }
    function visibility(){
      if(document.visibilityState==="visible"){
        targets.current.refresh();
        connect();
      }else{
        streaming?.close();streaming=undefined;
        stopFallback();
      }
    }
    connect();
    document.addEventListener("visibilitychange",visibility);
    return ()=>{
      abort.abort();
      streaming?.close();
      stopFallback();
      document.removeEventListener("visibilitychange",visibility);
    };
  },[path,persona,sheetId]);
}
