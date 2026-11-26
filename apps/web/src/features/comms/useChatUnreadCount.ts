"use client";
import {useEffect,useState} from "react";
import {noticeCount} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {useAccountScope} from "@/ui/AccountScope";

export function useChatUnreadCount(){
  const {accountId,sessionId,persona}=useAccountScope();
  const [count,setCount]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    let pending=false,dirty=false;
    setCount(0);
    async function sync(){
      if(abort.signal.aborted||document.hidden||!navigator.onLine)return;
      if(pending){dirty=true;return;}
      pending=true;
      try{
        const {data}=await requestApi("/threads/count",noticeCount,{headers:{"X-School-Persona":persona},signal:abort.signal});
        if(!abort.signal.aborted)setCount(data.unread);
      }catch(error){
        if(!abort.signal.aborted&&error instanceof ApiResponseError&&[401,403].includes(error.status))setCount(0);
      }finally{pending=false;if(dirty&&!abort.signal.aborted){dirty=false;void sync();}}
    }
    const timer=window.setInterval(sync,12000);
    window.addEventListener("madrasty-notices-changed",sync);
    window.addEventListener("focus",sync);
    window.addEventListener("online",sync);
    document.addEventListener("visibilitychange",sync);
    void sync();
    return ()=>{abort.abort();window.clearInterval(timer);window.removeEventListener("madrasty-notices-changed",sync);window.removeEventListener("focus",sync);window.removeEventListener("online",sync);document.removeEventListener("visibilitychange",sync);};
  },[accountId,sessionId,persona]);
  return count;
}
