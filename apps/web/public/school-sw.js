const attendanceShellCache = "madrasty-attendance-shell-v1";
const shell = "/offline/attendance.html";
const publicAssets = [shell,"/offline/attendance.css","/offline/attendance.mjs","/attendance-vault.mjs","/school-192.png"];

self.addEventListener("install",(event)=>{
  event.waitUntil(caches.open(attendanceShellCache).then((cache)=>cache.addAll(publicAssets)));
  self.skipWaiting();
});

self.addEventListener("activate",(event)=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()){
      if(key.startsWith("madrasty-attendance-shell-")&&key!==attendanceShellCache)await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",(event)=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=="GET")return;
  if(publicAssets.includes(url.pathname)){
    event.respondWith(caches.open(attendanceShellCache).then(async(cache)=>await cache.match(url.pathname)??fetch(event.request)));
    return;
  }
  const protectedScreen=/^\/(ar|de)\/school\/(home|attendance|more\/attendance|children\/[^/]+\/excuse)\/?$/;
  if(event.request.mode==="navigate"&&(url.pathname==="/"||/^\/(ar|de)\/?$/.test(url.pathname)||protectedScreen.test(url.pathname))){
    event.respondWith(fetch(event.request).catch(async()=>{
      const cached=await caches.open(attendanceShellCache).then((cache)=>cache.match(shell));
      return cached??new Response(null,{status:503});
    }));
  }
});
