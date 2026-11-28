import type { Page } from "@playwright/test";

// Development-navigation diagnostics only: never store URL queries, auth values,
// form values, message bodies, raw console output or WebSocket payloads.
const routePattern = /^\/(?:ar|de)(?:\/(?:install|invite|account\/(?:sign-in|preferences|profile|security(?:\/(?:recover|email|activate))?)|staff\/access))?\/?$/;
function route(value: string) {
  try {
    const path = new URL(value, "http://127.0.0.1").pathname;
    return routePattern.test(path) ? path : "<other>";
  } catch { return "<other>"; }
}
export async function visualNavigationProbe(page: Page, label: string) {
  const started = Date.now();
  const events: Record<string, string | number | boolean>[] = [];
  function record(event: string, details: Record<string, string | number | boolean> = {}) {
    events.push({ ms: Date.now() - started, event, ...details });
    if (events.length > 100) events.shift();
  }
  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) record("document-navigation", { route: route(frame.url()) });
  });
  page.on("request", request => {
    if (request.isNavigationRequest()) record("navigation-request", { route: route(request.url()) });
  });
  page.on("response", response => {
    if (response.request().isNavigationRequest()) record("navigation-response", { route: route(response.url()), status: response.status() });
  });
  page.on("requestfailed", request => {
    if (request.isNavigationRequest()) {
      const failure = request.failure()?.errorText ?? "";
      record("navigation-request-failed", { route: route(request.url()), category: /abort|cancel|interrupt/i.test(failure) ? "aborted" : "other" });
    }
  });
  page.on("websocket", socket => {
    try { if (!new URL(socket.url()).pathname.includes("/_next/") || !new URL(socket.url()).pathname.includes("hmr")) return; }
    catch { return; }
    record("dev-hmr-connected");
    socket.on("framereceived", ({ payload }) => {
      try {
        const parsed = JSON.parse(typeof payload === "string" ? payload : payload.toString("utf8"));
        const type = parsed.action ?? parsed.type;
        if (typeof type === "string" && ["building", "built", "sync", "reloadPage", "reload", "serverComponentChanges", "server-component-changes", "turbopack-message", "turbopack-connected", "devPagesManifestUpdate"].includes(type)) record("dev-hmr-message", { type });
      } catch { /* no raw payload is retained */ }
    });
  });
  page.on("console", message => {
    const value = message.text();
    if (value.startsWith("VISUAL_NAV_PROBE ")) {
      try {
        const item = JSON.parse(value.slice("VISUAL_NAV_PROBE ".length));
        if (["pointerdown", "click"].includes(item.event) && typeof item.href === "string") {
          record("link-" + item.event, { route: route(item.href), prevented: item.prevented === true,
            ready: ["loading", "interactive", "complete"].includes(item.ready) ? item.ready : "unknown" });
        }
      } catch { /* no raw console message is retained */ }
    } else if (/\[Fast Refresh\].*(?:full reload|rebuilding|done)/i.test(value)) {
      record("dev-fast-refresh", { category: /full reload/i.test(value) ? "full-reload" : /rebuilding/i.test(value) ? "rebuilding" : "done" });
    }
  });
  page.on("pageerror", () => record("page-error"));
  await page.addInitScript(() => {
    for (const kind of ["pointerdown", "click"] as const) {
      document.addEventListener(kind, event => {
        const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
        if (!(target instanceof HTMLAnchorElement) || target.origin !== location.origin) return;
        const href = target.pathname;
        if (!/^\/(?:ar|de)(?:\/(?:install|invite|account\/(?:sign-in|preferences|profile|security(?:\/(?:recover|email|activate))?)|staff\/access))?\/?$/.test(href)) return;
        queueMicrotask(() => console.info("VISUAL_NAV_PROBE " + JSON.stringify({
          event: kind, href, prevented: event.defaultPrevented, ready: document.readyState,
        })));
      }, true);
    }
  });
  return {
    mark(stage: string) { record("test-stage", { stage }); },
    dump() { console.log("P03 navigation boundaries", JSON.stringify({ label, events })); },
  };
}
