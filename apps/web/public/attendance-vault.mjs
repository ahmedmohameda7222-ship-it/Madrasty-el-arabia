const databaseName = "madrasty-attendance-v1";
const contextKey = "confirmed-scope";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const blockedCookie = () => /(?:^|;\s*)(?:__Host-)?madrasty-locked=/.test(document.cookie);

async function purgeExpired(store) {
  const now=Date.now();
  const records=await requestResult(store.getAll());
  for(const entry of records)if(entry.expiry<=now)store.delete(entry.id);
}

function database() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName,1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("scope");
      open.result.createObjectStore("records",{keyPath:"id"});
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("Attendance storage unavailable"));
  });
}

function requestResult(request) {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function trans(names,mode,work) {
  const db = await database();
  const tx = db.transaction(names,mode);
  const commit = new Promise((resolve,reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Attendance storage changed"));
  });
  // Observe failure even if an individual operation is rejected before the transaction.
  void commit.catch(() => {});
  try {
    const result = await work(tx);
    await commit;
    return result;
  } catch (error) {
    try { tx.abort(); } catch {}
    throw error;
  } finally { db.close(); }
}

function binding(actor,locale) {
  if (!actor || !["teacher","guardian","admin"].includes(actor.persona) || !actor.expiresAt) return null;
  return {
    partition:[actor.accountId,actor.sessionId,actor.persona].join("/"),
    persona:actor.persona,
    locale:locale === "de" ? "de" : "ar",
    expiresAt:Date.parse(actor.expiresAt),
  };
}

function usable(scope,expected) {
  return Boolean(scope && scope.expiresAt > Date.now() && !blockedCookie()
    && (!expected || scope.partition === expected.partition)
    && (!expected?.epoch || scope.epoch === expected.epoch));
}

export async function bindAttendanceVault(actor,locale) {
  if (blockedCookie()) {
    await clearAttendanceVault();
    return null;
  }
  const next = binding(actor,locale);
  if (!next || !Number.isFinite(next.expiresAt) || next.expiresAt <= Date.now()) {
    await clearAttendanceVault();
    return null;
  }
  const key = await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  return trans(["scope","records"],"readwrite",async(tx)=>{
    const table=tx.objectStore("scope");
    const current=await requestResult(table.get(contextKey));
    if (blockedCookie()) {
      tx.objectStore("records").clear();
      table.clear();
      return null;
    }
    const same=current && current.partition===next.partition && current.expiresAt>Date.now();
    if(!same)tx.objectStore("records").clear();
    else await purgeExpired(tx.objectStore("records"));
    const confirmed={...next,expiresAt:same?Math.max(current.expiresAt,next.expiresAt):next.expiresAt,
      key:same?current.key:key,epoch:same?current.epoch:crypto.randomUUID()};
    table.put(confirmed,contextKey);
    return confirmed.partition;
  });
}

export async function clearAttendanceVault() {
  return trans(["scope","records"],"readwrite",async(tx)=>{
    tx.objectStore("scope").clear();
    tx.objectStore("records").clear();
  });
}

export async function activeAttendanceScope(expectedActor) {
  if(blockedCookie()){
    await clearAttendanceVault();
    return null;
  }
  const expected=expectedActor?.epoch?expectedActor:expectedActor?binding(expectedActor,"ar"):null;
  if(expectedActor&&!expected)return null;
  return trans(["scope","records"],"readwrite",async(tx)=>{
    const table=tx.objectStore("scope");
    const scope=await requestResult(table.get(contextKey));
    if(scope && scope.expiresAt<=Date.now()){
      table.clear();
      tx.objectStore("records").clear();
      return null;
    }
    if(usable(scope,expected)){
      await purgeExpired(tx.objectStore("records"));
      return scope;
    }
    return null;
  });
}

async function recordId(scope,slot) {
  const hash=await crypto.subtle.digest("SHA-256",encoder.encode(`${scope.partition}/${scope.epoch}/${slot}`));
  return Array.from(new Uint8Array(hash),(byte)=>byte.toString(16).padStart(2,"0")).join("");
}
async function unseal(scope,record) {
  try {
    const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:record.iv,additionalData:encoder.encode(record.id)},scope.key,record.payload);
    return JSON.parse(decoder.decode(bytes));
  } catch { return null; }
}

export async function readAttendanceVault(actor,slot) {
  const scope=await activeAttendanceScope(actor);
  if(!scope)return null;
  const id=await recordId(scope,slot);
  const record=await trans(["records"],"readonly",(tx)=>requestResult(tx.objectStore("records").get(id)));
  if (!record || !usable(scope)) return null;
  const content=await unseal(scope,record);
  if(!usable(await activeAttendanceScope(actor),scope))return null;
  return content?.slot===slot&&content.value?.validUntil>Date.now()?content.value:null;
}

export async function writeAttendanceVault(actor,slot,value) {
  const scope=await activeAttendanceScope(actor);
  if(!scope||!Number.isFinite(value.validUntil)||value.validUntil<=Date.now())return false;
  const id=await recordId(scope,slot);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const payload=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(id)},scope.key,encoder.encode(JSON.stringify({slot,value})));
  return trans(["scope","records"],"readwrite",async(tx)=>{
    const current=await requestResult(tx.objectStore("scope").get(contextKey));
    if(!usable(current,scope))return false;
    tx.objectStore("records").put({id,iv,payload,expiry:Math.min(current.expiresAt,value.validUntil)});
    return true;
  });
}

export async function removeAttendanceVaultRecord(actor,slot) {
  const scope=await activeAttendanceScope(actor);
  if(!scope)return;
  const id=await recordId(scope,slot);
  await trans(["scope","records"],"readwrite",async(tx)=>{
    const current=await requestResult(tx.objectStore("scope").get(contextKey));
    if(usable(current,scope))tx.objectStore("records").delete(id);
  });
}

export async function listAttendanceVaultRecords(actor) {
  const scope=await activeAttendanceScope(actor);
  if(!scope)return [];
  const records=await trans(["records"],"readonly",tx=>requestResult(tx.objectStore("records").getAll()));
  const contents=await Promise.all(records.map((record)=>unseal(scope,record)));
  if(!usable(await activeAttendanceScope(actor),scope))return [];
  return contents.flatMap((content)=>typeof content?.slot==="string"&&content.value?.validUntil>Date.now()?[content.slot]:[]);
}

export function hasUnsentAttendance(record) {
  return Boolean(record&&(Object.keys(record.drafts??{}).length||record.reason?.trim()||record.inFlight));
}

export async function countAttendanceDrafts(actor) {
  const slots=await listAttendanceVaultRecords(actor);
  const records=await Promise.all(slots.map((slot)=>readAttendanceVault(actor,slot)));
  return records.filter(hasUnsentAttendance).length;
}
