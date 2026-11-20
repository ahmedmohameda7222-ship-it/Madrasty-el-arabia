"use client";

import type { AttendanceSheet, AttendanceStatus, Locale } from "@madrasty/contracts";
import type { AccountPartition } from "@/ui/AccountScope";
import {
  bindAttendanceVault, clearAttendanceVault, countAttendanceDrafts, listAttendanceVaultRecords, readAttendanceVault,
  removeAttendanceVaultRecord, writeAttendanceVault,
} from "../../../public/attendance-vault.mjs";

export type Draft = { revision:number; status:AttendanceStatus|null };
export type SheetEdits = Record<string,Draft>;
export type SendEdits = {rowId:string;revision:number;status:AttendanceStatus|null}[];
export type CachedAttendanceRow = {
  id:string; displayName:string; studentNumber:string; status:AttendanceStatus|null; revision:number;
  locked:boolean; arrival:boolean;
};
export type CachedSheet = {
  kind:"sheet"; classroom:AttendanceSheet["classroom"]; schoolDate:string; sheetId:string;
  confirmedAt:string; validUntil:number; readonly:boolean; rows:CachedAttendanceRow[]; drafts:SheetEdits;
  sync:boolean; inFlight?:{key:string;edits:SendEdits};
};
export type CachedExcuse = {
  kind:"excuse"; schoolDate:string; child:{id:string;displayName:string}; confirmedAt:string; validUntil:number; reason:string; teachingDay:boolean;
  inFlight?:{key:string;reason:string};
};
export const sheetSlot=(classId:string,date:string)=>`sheet/${classId}/${date}`;
export const excuseSlot=(childId:string,date:string)=>`excuse/${childId}/${date}`;

let bound:{id:string;ready:Promise<unknown>}|undefined;
export function activateAttendanceDrafts(actor:AccountPartition,locale:Locale) {
  if(!actor.expiresAt)return Promise.resolve(null);
  const id=JSON.stringify([actor.accountId,actor.sessionId,actor.persona,actor.expiresAt,locale]);
  if(bound?.id!==id){
    bound={id,ready:bindAttendanceVault(actor,locale).catch(()=>null)};
  }
  void navigator.serviceWorker?.register("/school-sw.js").catch(()=>undefined);
  return bound.ready;
}

type CachedRecord = CachedSheet | CachedExcuse;
export async function readPrivateDraft<T extends CachedRecord>(actor:AccountPartition,slot:string):Promise<T|null> {
  try {await bound?.ready;return await readAttendanceVault(actor,slot) as T|null;}
  catch{return null;}
}
export async function writePrivateDraft(actor:AccountPartition,slot:string,record:CachedRecord){
  try{await bound?.ready;return await writeAttendanceVault(actor,slot,record);}
  catch{return false;}
}
export async function removePrivateDraft(actor:AccountPartition,slot:string){
  try{await removeAttendanceVaultRecord(actor,slot);}catch{}
}
export async function purgeAttendanceSlots(actor:AccountPartition,prefix:string){
  try{
    const slots=await listAttendanceVaultRecords(actor) as string[];
    await Promise.all(slots.filter((slot)=>slot.startsWith(prefix)).map((slot)=>removePrivateDraft(actor,slot)));
  }catch{}
}
export async function discardAttendanceDrafts(){
  bound=undefined;
  try{await clearAttendanceVault();}catch{}
}
export async function countPrivateDrafts(actor:AccountPartition){
  try{return await countAttendanceDrafts(actor);}catch{return 0;}
}

export function cachedSheet(current:AttendanceSheet,previous:CachedSheet|null,edits:SheetEdits,validUntil:number):CachedSheet|null{
  if(!current.id)return null;
  return {
    kind:"sheet",classroom:current.classroom,schoolDate:current.schoolDate,sheetId:current.id,confirmedAt:new Date().toISOString(),validUntil,
    readonly:!current.teachingDay||!current.canMark||current.state!=="open",
    rows:current.rows.map(({id,displayName,studentNumber,status,revision,locked,confirmedArrivalAt})=>({
      id,displayName,studentNumber,status,revision,locked,arrival:Boolean(confirmedArrivalAt),
    })),
    drafts:edits,sync:previous?.sync??false,inFlight:previous?.inFlight,
  };
}

export function reconcileAttendance(current:AttendanceSheet,pending:SheetEdits){
  const rows=new Map(current.rows.map((row)=>[row.id,row]));
  const compatible:SendEdits=[], acknowledged:string[]=[], blocked:string[]=[];
  for(const [rowId,draft] of Object.entries(pending)){
    const row=rows.get(rowId);
    if(row && row.status===draft.status){acknowledged.push(rowId);continue;}
    if(row && row.revision===draft.revision && !row.locked && !row.confirmedArrivalAt){
      compatible.push({rowId,...draft});
    }else blocked.push(rowId);
  }
  compatible.sort((first,second)=>first.rowId.localeCompare(second.rowId));
  return {compatible,acknowledged,blocked};
}
