type Flight = { controller:AbortController; promise:Promise<unknown>; consumers:number };

/** Shares in-flight GETs only, with independent cancellation for each consumer. */
export function createReadFlights() {
  let pending = new WeakMap<object,Map<string,Flight>>();
  function invalidate() {
    // Existing consumers may finish; new requests must never join a pre-write flight.
    pending = new WeakMap();
  }
  function read<T>(schema:object,key:string,signal:AbortSignal,work:(signal:AbortSignal)=>Promise<T>):Promise<T> {
    if(signal.aborted)return Promise.reject(signal.reason);
    let group=pending.get(schema);
    if(!group){group=new Map();pending.set(schema,group);}
    const flights=group;
    let active=flights.get(key);
    if(!active){
      const controller=new AbortController();
      const promise=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return work(controller.signal);});
      const created:Flight={controller,promise,consumers:0};
      flights.set(key,created);
      const cleanup=()=>{if(flights.get(key)===created)flights.delete(key);};
      void promise.then(cleanup,cleanup);
      active=created;
    }
    const flight=active;
    flight.consumers++;
    return new Promise<T>((resolve,reject)=>{
      let finished=false;
      function release(cancelled:boolean){
        if(finished)return false;
        finished=true;
        signal.removeEventListener("abort",cancel);
        if(--flight.consumers===0&&cancelled){
          if(flights.get(key)===flight)flights.delete(key);
          flight.controller.abort();
        }
        return true;
      }
      function cancel(){if(release(true))reject(signal.reason);}
      signal.addEventListener("abort",cancel,{once:true});
      if(signal.aborted)cancel();
      void flight.promise.then(value=>{if(release(false))resolve(value as T);},error=>{if(release(false))reject(error);});
    });
  }
  return {read,invalidate};
}
