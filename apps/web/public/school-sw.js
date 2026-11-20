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


const noticeIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pushLabels = {
  ar: { title: "مدرستي العربية", body: "إشعار من المدرسة", dir: "rtl" },
  de: { title: "Madrasty El Arabia", body: "Mitteilung der Schule", dir: "ltr" },
};

function storedDeliveryGuard() {
  return new Promise((resolve) => {
    const opening = indexedDB.open("madrasty-push", 1);
    opening.onupgradeneeded = () => { opening.result.createObjectStore("device"); };
    opening.onerror = opening.onblocked = () => resolve(null);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction("device", "readonly");
      const saved = transaction.objectStore("device").get("deliveryGuard");
      saved.onsuccess = () => resolve(saved.result ?? null);
      saved.onerror = () => resolve(null);
      transaction.oncomplete = transaction.onabort = () => database.close();
    };
  });
}

function noticeMessage(message) {
  return message && (message.locale === "ar" || message.locale === "de") &&
    typeof message.noticeId === "string" && noticeIdPattern.test(message.noticeId) &&
    typeof message.deviceGuard === "string" && noticeIdPattern.test(message.deviceGuard);
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let message;
    try { message = event.data?.json(); } catch { return; }
    if (!noticeMessage(message) || await storedDeliveryGuard() !== message.deviceGuard) return;
    const { title, body, dir } = pushLabels[message.locale];
    await self.registration.showNotification(title, {
      body, dir, lang: message.locale, icon: "/school-192.png", tag: "notice-" + message.noticeId,
      data: { noticeId: message.noticeId, locale: message.locale, deviceGuard: message.deviceGuard },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const message = event.notification.data;
    if (!noticeMessage(message) || await storedDeliveryGuard() !== message.deviceGuard) return;
    const url = new URL("/" + message.locale + "/open-notice/" + message.noticeId, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => client.url === url);
    if (open) await open.focus();
    else await self.clients.openWindow(url);
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((windows) => {
    for (const client of windows) client.postMessage({ type: "madrasty-push-refresh" });
  }));
});
